-- THE LOOP — Correctif permissions + sync Auth → public.users
-- =============================================================================
-- À exécuter dans Supabase → SQL Editor (rôle postgres).
-- Si une étape échoue, exécutez bloc par bloc.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Droits sur le schéma public (corrige "permission denied for schema public")
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO postgres, supabase_admin, service_role, authenticator;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;

-- -----------------------------------------------------------------------------
-- 1. Trigger Auth → public.users (QR auto)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'first_name'), ''), 'Membre');
  v_last_name TEXT := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'last_name'), ''), 'THE LOOP');
  v_phone TEXT := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'phone_number'), ''), 'non_renseigne');
  v_user_role TEXT := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'user_role'), ''), 'member');
  v_qr_token TEXT := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'qr_code_token'), ''),
    'LOOP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  );
  v_email TEXT := COALESCE(NULLIF(trim(NEW.email), ''), '');
BEGIN
  INSERT INTO public.users (
    id, email, password_hash, phone_number,
    first_name, last_name, user_role, qr_code_token, is_active
  )
  VALUES (
    NEW.id,
    v_email,
    'managed_by_supabase_auth',
    v_phone,
    v_first_name,
    v_last_name,
    v_user_role,
    v_qr_token,
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone_number = EXCLUDED.phone_number,
    user_role = COALESCE(NULLIF(EXCLUDED.user_role, ''), users.user_role),
    qr_code_token = COALESCE(NULLIF(EXCLUDED.qr_code_token, ''), users.qr_code_token),
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_auth_user() OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_auth_user() TO postgres, service_role;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 2. RPC secours — appelée par l'app après signup (si trigger en retard)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_user_profile(
  p_first_name TEXT DEFAULT 'Membre',
  p_last_name TEXT DEFAULT 'THE LOOP',
  p_phone TEXT DEFAULT 'non_renseigne',
  p_user_role TEXT DEFAULT 'member',
  p_qr_token TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_email TEXT;
  v_qr TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT COALESCE(NULLIF(trim(email), ''), '') INTO v_email
  FROM auth.users
  WHERE id = v_uid;

  v_qr := COALESCE(
    NULLIF(trim(p_qr_token), ''),
    'LOOP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  );

  INSERT INTO public.users (
    id, email, password_hash, phone_number,
    first_name, last_name, user_role, qr_code_token, is_active
  )
  VALUES (
    v_uid,
    v_email,
    'managed_by_supabase_auth',
    COALESCE(NULLIF(trim(p_phone), ''), 'non_renseigne'),
    COALESCE(NULLIF(trim(p_first_name), ''), 'Membre'),
    COALESCE(NULLIF(trim(p_last_name), ''), 'THE LOOP'),
    COALESCE(NULLIF(trim(p_user_role), ''), 'member'),
    v_qr,
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone_number = EXCLUDED.phone_number,
    user_role = COALESCE(NULLIF(EXCLUDED.user_role, ''), users.user_role),
    qr_code_token = COALESCE(NULLIF(EXCLUDED.qr_code_token, ''), users.qr_code_token),
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;
END;
$$;

ALTER FUNCTION public.ensure_user_profile(TEXT, TEXT, TEXT, TEXT, TEXT) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.ensure_user_profile(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Rétro-créer public.users pour les comptes Auth déjà existants
-- -----------------------------------------------------------------------------
INSERT INTO public.users (
  id, email, password_hash, phone_number,
  first_name, last_name, user_role, qr_code_token, is_active
)
SELECT
  au.id,
  COALESCE(au.email, ''),
  'managed_by_supabase_auth',
  COALESCE(NULLIF(trim(au.raw_user_meta_data->>'phone_number'), ''), 'non_renseigne'),
  COALESCE(NULLIF(trim(au.raw_user_meta_data->>'first_name'), ''), 'Membre'),
  COALESCE(NULLIF(trim(au.raw_user_meta_data->>'last_name'), ''), 'THE LOOP'),
  COALESCE(NULLIF(trim(au.raw_user_meta_data->>'user_role'), ''), 'member'),
  COALESCE(
    NULLIF(trim(au.raw_user_meta_data->>'qr_code_token'), ''),
    'LOOP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  ),
  TRUE
FROM auth.users au
LEFT JOIN public.users u ON u.id = au.id
WHERE u.id IS NULL;

-- -----------------------------------------------------------------------------
-- 4. Policy INSERT users (secours côté client)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users insert own row on signup" ON users;
CREATE POLICY "Users insert own row on signup"
  ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. Confirmer les e-mails existants (dev)
-- -----------------------------------------------------------------------------
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email_confirmed_at IS NULL;

-- -----------------------------------------------------------------------------
-- 6. QR manquants + rôles comptes test
-- -----------------------------------------------------------------------------
UPDATE users
SET qr_code_token = 'LOOP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP
WHERE qr_code_token IS NULL OR trim(qr_code_token) = '';

UPDATE users SET user_role = 'member', phone_number = '+22462000001', is_active = TRUE, updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'membre@theloop.gn';

UPDATE users SET user_role = 'prime', phone_number = '+22462000002', is_active = TRUE, updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'prime@theloop.gn';

UPDATE users SET user_role = 'partner', phone_number = '+22462000003', is_active = TRUE, updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'contact@lavenue.gn';

UPDATE users SET user_role = 'admin', phone_number = '+22462000004', is_active = TRUE, updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'admin@theloop.gn';
