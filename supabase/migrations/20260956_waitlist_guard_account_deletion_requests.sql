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
 *    La demande passe en « processed » quand le super admin supprime ou archive le compte.
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

CREATE OR REPLACE FUNCTION public.tg_account_deletion_requests_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target := OLD.id;
  ELSIF NEW.account_status IS DISTINCT FROM OLD.account_status AND NEW.account_status = 'archived' THEN
    v_target := NEW.id;
  ELSE
    RETURN NULL;
  END IF;

  UPDATE public.account_deletion_requests
  SET status = 'processed',
      processed_at = NOW(),
      processed_by = auth.uid()
  WHERE user_id = v_target AND status = 'pending';

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
