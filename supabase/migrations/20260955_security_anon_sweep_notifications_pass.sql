-- =============================================================================
-- 20260955 — Sécurité, troisième passe (audit pré-build 53)
-- =============================================================================
--   1. Droits « anon » (sans compte) sur les fonctions : Supabase accorde
--      EXECUTE à anon sur toute nouvelle fonction du schéma public. La remise à
--      plat de 20260874 est donc érodée par chaque migration postérieure. On la
--      refait avec la liste autorisée à jour, et on coupe ce privilège par
--      défaut pour les prochaines fonctions.
--   2. list_notifications_for_phone : un compte connecté lisait l'inbox de
--      n'importe quel numéro.
--   3. notify_user : un partenaire pouvait notifier tout membre ayant une
--      activité privilège récente, même chez un autre établissement.
--   4. user_pass_grants : un membre Prime pouvait repousser l'échéance de son
--      propre PASS via l'écriture technique du gel de rôle.
--   5. find_partner_by_validation_code : plus de tentatives illimitées depuis
--      une même adresse IP.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Balayage des droits anon
-- -----------------------------------------------------------------------------
-- Liste autorisée = parcours sans compte réellement utilisés par les apps :
-- inscription / activation d'invitation, écran « Code établissement »
-- (personnel sans compte, client anon), demande de partenariat, sondage et
-- empreinte catalogue, plus event_is_readable (policies anon).

DO $$
DECLARE
  r RECORD;
  v_allow_anon TEXT[] := ARRAY[
    'check_signup_email_available',
    'assert_signup_email_allowed',
    'find_pending_admin_invite_by_email',
    'check_admin_invite_activation_eligibility',
    'apply_partner_benefit_validation',
    'list_partner_pending_validations',
    'list_member_pending_benefit_redemptions',
    'verify_member_qr_payload',
    'verify_member_qr_partner',
    'find_partner_by_validation_code',
    'validate_partner_spot_token',
    'fetch_member_benefit_grants_public',
    'record_partner_member_attribution',
    'resolve_partner_token_user_id',
    'upsert_prime_benefit_grant',
    'get_public_catalog_fingerprint',
    'get_home_poll_results',
    'submit_partnership_request',
    'notify_admins_for_partnership_request',
    'event_is_readable'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.oid::regprocedure);
      IF r.name = ANY(v_allow_anon) THEN
        EXECUTE format(
          'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role',
          r.oid::regprocedure
        );
      ELSE
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.oid::regprocedure);
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Droits inchangés (propriétaire différent) : %', r.oid::regprocedure;
    END;
  END LOOP;
END $$;

-- Les fonctions créées par les prochaines migrations ne seront plus
-- exécutables sans compte, sauf GRANT explicite. Le droit PUBLIC vient des
-- privilèges par défaut globaux : une clause IN SCHEMA ne peut pas le retirer.
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Privilèges par défaut inchangés (droits insuffisants).';
END $$;

-- -----------------------------------------------------------------------------
-- 2. Inbox par téléphone : uniquement son propre numéro
-- -----------------------------------------------------------------------------
-- Comparaison sur les 9 derniers chiffres (numéro national guinéen), pour
-- tolérer les écritures avec ou sans indicatif.

CREATE OR REPLACE FUNCTION public.list_notifications_for_phone(p_phone TEXT)
RETURNS SETOF public.user_notifications
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_digits TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_own TEXT;
BEGIN
  IF v_digits = '' THEN
    RETURN;
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
    IF auth.uid() IS NULL THEN
      RETURN;
    END IF;
    SELECT regexp_replace(COALESCE(u.phone_number, ''), '\D', '', 'g')
      INTO v_own
    FROM public.users u
    WHERE u.id = auth.uid();
    IF COALESCE(v_own, '') = '' OR right(v_own, 9) <> right(v_digits, 9) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.user_notifications
  WHERE recipient_phone = v_digits
     OR (user_id IS NOT NULL AND user_id::text = 'phone:' || v_digits)
  ORDER BY sent_at DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.list_notifications_for_phone(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_notifications_for_phone(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_notifications_for_phone(TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. notify_user : un partenaire ne notifie que ses propres clients privilège
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_audience TEXT DEFAULT 'individual',
  p_recipient_phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_role TEXT;
  v_company TEXT;
  v_ok BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requis';
  END IF;

  SELECT user_role, lower(trim(COALESCE(company, '')))
    INTO v_role, v_company
  FROM public.users WHERE id = auth.uid() LIMIT 1;

  IF public.is_admin() OR auth.uid() = p_user_id THEN
    v_ok := TRUE;
  ELSIF v_role IN ('partner', 'tool_partner') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.benefit_redemptions r
      WHERE r.user_id = p_user_id
        AND r.status IN ('pending', 'validated')
        AND r.created_at > NOW() - INTERVAL '30 days'
        AND (
          r.partner_key = 'user:' || auth.uid()::text
          OR EXISTS (
            SELECT 1
            FROM public.partner_validation_codes c
            WHERE c.user_id = auth.uid()
              AND (c.partner_key = r.partner_key OR c.validation_code = upper(trim(r.partner_code)))
          )
          OR (v_company <> '' AND lower(trim(r.partner_name)) = v_company)
        )
      LIMIT 1
    ) INTO v_ok;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  INSERT INTO public.user_notifications (
    user_id, recipient_phone, title, message, audience, sent_at
  ) VALUES (
    p_user_id,
    NULLIF(trim(COALESCE(p_recipient_phone, '')), ''),
    COALESCE(NULLIF(trim(p_title), ''), 'Notification'),
    COALESCE(p_message, ''),
    COALESCE(NULLIF(trim(p_audience), ''), 'individual'),
    NOW()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. PASS : l'écriture « membre sur son compte » ne prolonge jamais un PASS
-- -----------------------------------------------------------------------------
-- La suspension / restauration du gel de rôle reprend toujours l'échéance
-- d'origine : borner expires_at à l'ancienne valeur ne change rien pour elle.
-- Les lignes « pending » (achat en cours, finalisé par le serveur de paiement
-- en service_role) ne sont pas concernées.

CREATE OR REPLACE FUNCTION public.tg_user_pass_grants_guard_self()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated'
     OR auth.uid() IS DISTINCT FROM OLD.user_id
     OR OLD.status = 'pending'
     OR public.is_admin()
  THEN
    RETURN NEW;
  END IF;

  IF OLD.expires_at IS NOT NULL
     AND (NEW.expires_at IS NULL OR NEW.expires_at > OLD.expires_at)
  THEN
    NEW.expires_at := OLD.expires_at;
  END IF;

  NEW.user_id := OLD.user_id;
  NEW.amount_gnf := OLD.amount_gnf;
  NEW.payment_method := OLD.payment_method;
  NEW.paid_at := OLD.paid_at;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_user_pass_grants_guard_self() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_user_pass_grants_guard_self() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_user_pass_grants_guard_self ON public.user_pass_grants;
CREATE TRIGGER trg_user_pass_grants_guard_self
  BEFORE UPDATE ON public.user_pass_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_user_pass_grants_guard_self();

-- -----------------------------------------------------------------------------
-- 5. Code établissement : limite d'essais infructueux par adresse IP
-- -----------------------------------------------------------------------------
-- Seuls les échecs sont comptés : le personnel qui saisit un code valide n'est
-- jamais freiné. Au-delà de 20 échecs en 15 minutes depuis une même IP, même
-- un code valide est refusé jusqu'à la fin de la fenêtre.

CREATE TABLE IF NOT EXISTS public.partner_code_lookup_failures (
  id BIGSERIAL PRIMARY KEY,
  client_ip TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_code_lookup_failures_ip
  ON public.partner_code_lookup_failures (client_ip, created_at DESC);

ALTER TABLE public.partner_code_lookup_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_code_lookup_failures FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.find_partner_by_validation_code(p_code TEXT)
RETURNS TABLE(partner_key TEXT, partner_name TEXT, validation_code TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers JSON;
  v_ip TEXT;
  v_failures INT := 0;
BEGIN
  BEGIN
    v_headers := NULLIF(current_setting('request.headers', true), '')::json;
  EXCEPTION WHEN others THEN
    v_headers := NULL;
  END;
  v_ip := NULLIF(trim(split_part(COALESCE(
    v_headers->>'cf-connecting-ip',
    v_headers->>'x-real-ip',
    v_headers->>'x-forwarded-for',
    ''
  ), ',', 1)), '');

  IF v_ip IS NOT NULL THEN
    SELECT count(*) INTO v_failures
    FROM public.partner_code_lookup_failures f
    WHERE f.client_ip = v_ip
      AND f.created_at > NOW() - INTERVAL '15 minutes';
    IF v_failures >= 20 THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT pvc.partner_key, pvc.partner_name, pvc.validation_code
  FROM public.partner_validation_codes pvc
  WHERE pvc.validation_code = upper(trim(COALESCE(p_code, '')))
  LIMIT 1;

  IF NOT FOUND AND v_ip IS NOT NULL THEN
    INSERT INTO public.partner_code_lookup_failures (client_ip) VALUES (v_ip);
    DELETE FROM public.partner_code_lookup_failures
    WHERE created_at < NOW() - INTERVAL '1 day';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.find_partner_by_validation_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_partner_by_validation_code(TEXT) TO anon, authenticated, service_role;
