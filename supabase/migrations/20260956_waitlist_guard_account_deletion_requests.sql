/**
 * 1. Liste d'attente (landing www.theloop-app.com) — la clé publique permet d'insérer
 *    directement dans public.waitlist. Le formulaire n'envoie que { email } ; tout le
 *    reste (statut, invitation, notes…) est réservé à l'admin.
 *    - e-mail normalisé + format vérifié côté base ;
 *    - colonnes admin forcées à leurs valeurs par défaut ;
 *    - 20 inscriptions / heure / IP (IP souvent partagées par les opérateurs mobiles)
 *      et 300 / heure au total (anti-remplissage par robot).
 *
 * 2. Demandes de suppression de compte depuis l'app (exigence App Store / Google Play).
 *    Le membre ne peut pas appeler admin_distribute_notifications (réservé admin) :
 *    request_account_deletion enregistre la demande et notifie les admins.
 *    La demande passe en « processed » quand le super admin supprime le compte ;
 *    un compte archivé est anonymisé (3.).
 *
 * Idempotent — safe à relancer.
 */

-- ---------------------------------------------------------------------------
-- 1. Waitlist
-- ---------------------------------------------------------------------------

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.waitlist FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS waitlist_created_at_idx ON public.waitlist (created_at DESC);

CREATE TABLE IF NOT EXISTS public.waitlist_insert_log (
  id BIGSERIAL PRIMARY KEY,
  client_ip TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_insert_log_ip
  ON public.waitlist_insert_log (client_ip, created_at DESC);

ALTER TABLE public.waitlist_insert_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_insert_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_waitlist_guard_public_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers JSON;
  v_ip TEXT;
  v_count INT := 0;
BEGIN
  IF COALESCE(auth.role(), '') NOT IN ('anon', 'authenticated') OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  NEW.email := lower(trim(COALESCE(NEW.email, '')));
  IF length(NEW.email) > 254
     OR NEW.email !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'E-mail invalide' USING ERRCODE = '22023';
  END IF;

  NEW.id := gen_random_uuid();
  NEW.full_name := NULL;
  NEW.first_name := NULL;
  NEW.last_name := NULL;
  NEW.phone := NULL;
  NEW.city := NULL;
  NEW.country_code := 'GN';
  NEW.source := 'landing';
  NEW.status := 'pending';
  NEW.invite_id := NULL;
  NEW.invited_at := NULL;
  NEW.notes := NULL;
  NEW.metadata := '{}'::jsonb;
  NEW.created_at := NOW();
  NEW.updated_at := NOW();

  SELECT count(*) INTO v_count
  FROM public.waitlist w
  WHERE w.created_at > NOW() - INTERVAL '1 hour';
  IF v_count >= 300 THEN
    RAISE EXCEPTION 'Trop d''inscriptions, réessayez plus tard' USING ERRCODE = '54000';
  END IF;

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
    SELECT count(*) INTO v_count
    FROM public.waitlist_insert_log l
    WHERE l.client_ip = v_ip
      AND l.created_at > NOW() - INTERVAL '1 hour';
    IF v_count >= 20 THEN
      RAISE EXCEPTION 'Trop d''inscriptions, réessayez plus tard' USING ERRCODE = '54000';
    END IF;
    INSERT INTO public.waitlist_insert_log (client_ip) VALUES (v_ip);
    DELETE FROM public.waitlist_insert_log WHERE created_at < NOW() - INTERVAL '1 day';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_waitlist_guard_public_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_waitlist_guard_public_insert ON public.waitlist;
CREATE TRIGGER trg_waitlist_guard_public_insert
  BEFORE INSERT ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION public.tg_waitlist_guard_public_insert();

-- ---------------------------------------------------------------------------
-- 2. Demandes de suppression de compte
-- ---------------------------------------------------------------------------

-- Pas de clé étrangère : la demande doit survivre à la suppression du compte (preuve de traitement).
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT,
  phone_number TEXT,
  full_name TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  CONSTRAINT account_deletion_requests_status_check
    CHECK (status IN ('pending', 'processed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_pending
  ON public.account_deletion_requests (user_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS account_deletion_requests_status_idx
  ON public.account_deletion_requests (status, created_at DESC);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_deletion_requests FROM anon;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.account_deletion_requests FROM authenticated;

DROP POLICY IF EXISTS "account_deletion_requests_own_select" ON public.account_deletion_requests;
CREATE POLICY "account_deletion_requests_own_select"
  ON public.account_deletion_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "account_deletion_requests_admin_update" ON public.account_deletion_requests;
CREATE POLICY "account_deletion_requests_admin_update"
  ON public.account_deletion_requests FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.request_account_deletion(p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_user public.users%ROWTYPE;
  v_existing public.account_deletion_requests%ROWTYPE;
  v_request_id UUID;
  v_name TEXT;
  v_message TEXT;
  v_ids UUID[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing
  FROM public.account_deletion_requests
  WHERE user_id = v_uid AND status = 'pending'
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'request_id', v_existing.id,
      'already_pending', TRUE,
      'created_at', v_existing.created_at,
      'admin_ids', '[]'::jsonb
    );
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = v_uid;
  v_name := NULLIF(trim(concat_ws(' ', v_user.first_name, v_user.last_name)), '');

  INSERT INTO public.account_deletion_requests (user_id, email, phone_number, full_name, reason)
  VALUES (
    v_uid,
    v_user.email,
    v_user.phone_number,
    v_name,
    NULLIF(left(trim(COALESCE(p_reason, '')), 500), '')
  )
  RETURNING id INTO v_request_id;

  v_message := trim(
    COALESCE(v_name, 'Un membre')
    || ' demande la suppression de son compte — '
    || COALESCE(NULLIF(v_user.email, ''), '—')
    || ' · '
    || COALESCE(NULLIF(v_user.phone_number, ''), '—')
    || '. À traiter sous 30 jours (Utilisateurs → Supprimer).'
  );

  SELECT COALESCE(array_agg(u.id), ARRAY[]::UUID[])
  INTO v_ids
  FROM public.users u
  WHERE COALESCE(u.is_active, TRUE) = TRUE
    AND u.user_role = 'super_admin';

  IF cardinality(v_ids) = 0 THEN
    SELECT COALESCE(array_agg(u.id), ARRAY[]::UUID[])
    INTO v_ids
    FROM public.users u
    WHERE COALESCE(u.is_active, TRUE) = TRUE
      AND u.user_role = 'admin';
  END IF;

  IF cardinality(v_ids) > 0 THEN
    INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at)
    SELECT x, 'Demande suppression compte', v_message, 'admin', NOW()
    FROM unnest(v_ids) AS x;
  END IF;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'already_pending', FALSE,
    'created_at', NOW(),
    'admin_ids', to_jsonb(v_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Anonymisation (compte archivé car rattaché à du contenu partenaire)
-- ---------------------------------------------------------------------------
-- Suppression définitive : admin_delete_user_if_orphan efface auth.users → public.users
-- et les données liées partent en cascade. Quand du contenu est rattaché, le compte ne
-- peut être qu'archivé : on efface alors toutes les données personnelles et on bloque
-- la connexion. Le contenu publié et l'historique (privilèges, paiements) restent,
-- sans identité. Les paiements (payment_intents) sont conservés pour la comptabilité.

CREATE OR REPLACE FUNCTION public._anonymize_user_data(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_old_email TEXT;
  v_old_phone TEXT;
  v_placeholder TEXT := CONCAT('deleted+', p_user_id::TEXT, '@theloop.invalid');
BEGIN
  SELECT u.email, u.phone_number INTO v_old_email, v_old_phone
  FROM public.users u WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.users
  SET first_name = 'Compte',
      last_name = 'supprimé',
      email = v_placeholder,
      phone_number = NULL,
      birth_date = NULL,
      city = NULL,
      job_title = NULL,
      qr_code_token = replace(gen_random_uuid()::TEXT, '-', ''),
      is_active = FALSE,
      account_status = 'archived',
      updated_at = NOW()
  WHERE id = p_user_id;

  UPDATE auth.users
  SET email = v_placeholder,
      phone = NULL,
      encrypted_password = '',
      raw_user_meta_data = '{}'::jsonb,
      banned_until = 'infinity'::timestamptz,
      updated_at = NOW()
  WHERE id = p_user_id;
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.sessions WHERE user_id = p_user_id;

  DELETE FROM public.user_notifications
  WHERE user_id = p_user_id
     OR (v_old_phone IS NOT NULL AND recipient_phone IS NOT NULL
         AND right(regexp_replace(recipient_phone, '\D', '', 'g'), 9)
           = right(regexp_replace(v_old_phone, '\D', '', 'g'), 9));
  DELETE FROM public.user_push_tokens WHERE user_id = p_user_id;
  DELETE FROM public.favorite_events WHERE user_id = p_user_id;
  DELETE FROM public.favorite_spots WHERE user_id = p_user_id;
  DELETE FROM public.favorite_tools WHERE user_id = p_user_id;
  DELETE FROM public.favorite_walks WHERE user_id = p_user_id;
  UPDATE public.home_poll_votes SET voter_phone = NULL WHERE user_id = p_user_id;
  UPDATE public.community_suggestions
  SET contact_name = NULL, contact_email = NULL, contact_phone = NULL
  WHERE user_id = p_user_id;

  IF v_old_email IS NOT NULL AND v_old_email <> '' THEN
    DELETE FROM public.waitlist WHERE lower(trim(email)) = lower(trim(v_old_email));
    UPDATE public.admin_user_invites
    SET email = CONCAT('deleted+', id::TEXT, '@theloop.invalid'),
        first_name = 'Compte',
        last_name = 'supprimé',
        phone_number = NULL
    WHERE lower(trim(email)) = lower(trim(v_old_email));
  END IF;

  UPDATE public.account_deletion_requests
  SET status = CASE WHEN status = 'pending' THEN 'processed' ELSE status END,
      processed_at = COALESCE(processed_at, NOW()),
      processed_by = COALESCE(processed_by, auth.uid()),
      email = NULL,
      phone_number = NULL,
      full_name = NULL
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public._anonymize_user_data(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_anonymize_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Réservé au super admin';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN_SELF';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RETURN FALSE;
  END IF;
  PERFORM public._anonymize_user_data(p_user_id);
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_anonymize_user(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_anonymize_user(UUID) TO authenticated, service_role;

-- Suppression : la demande passe en « traitée » et perd ses coordonnées.
-- Archivage d'un compte qui a demandé sa suppression : anonymisation automatique.
CREATE OR REPLACE FUNCTION public.tg_account_deletion_requests_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.account_deletion_requests
    SET status = CASE WHEN status = 'pending' THEN 'processed' ELSE status END,
        processed_at = COALESCE(processed_at, NOW()),
        processed_by = COALESCE(processed_by, auth.uid()),
        email = NULL,
        phone_number = NULL,
        full_name = NULL
    WHERE user_id = OLD.id;
    RETURN NULL;
  END IF;

  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     AND NEW.account_status = 'archived'
     AND EXISTS (
       SELECT 1 FROM public.account_deletion_requests r
       WHERE r.user_id = NEW.id AND r.status = 'pending'
     ) THEN
    PERFORM public._anonymize_user_data(NEW.id);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_account_deletion_requests_close() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_account_deletion_requests_close ON public.users;
CREATE TRIGGER trg_account_deletion_requests_close
  AFTER DELETE OR UPDATE OF account_status ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.tg_account_deletion_requests_close();

COMMENT ON TABLE public.account_deletion_requests IS
  'Demandes de suppression de compte (app). Traitées par le super admin sous 30 jours.';
