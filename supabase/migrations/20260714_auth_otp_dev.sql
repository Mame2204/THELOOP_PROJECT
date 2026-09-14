-- THE LOOP — Auth dev : OTP 1234, sans confirmation email, QR auto
-- ⚠️ Si erreur "permission denied for schema public" → exécutez plutôt
--    supabase/migrations/20260715_fix_public_schema_auth.sql
-- =============================================================================
-- ÉTAPE MANUELLE OBLIGATOIRE (Dashboard Supabase, une seule fois) :
--   Authentication → Providers → Email
--   → DÉSACTIVER « Confirm email »
--   → Enregistrer
-- Sans cela, les nouveaux comptes restent bloqués jusqu'à clic sur un lien mail.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Trigger Auth → public.users (QR + champs obligatoires)
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 2. Rétro-remplir QR manquants sur comptes existants
-- -----------------------------------------------------------------------------
UPDATE users
SET qr_code_token = 'LOOP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP
WHERE qr_code_token IS NULL OR trim(qr_code_token) = '';

-- -----------------------------------------------------------------------------
-- 3. DEV : confirmer tous les comptes Auth existants (plus besoin de mail)
-- -----------------------------------------------------------------------------
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email_confirmed_at IS NULL;

-- -----------------------------------------------------------------------------
-- 4. Policy INSERT users (secours si trigger en retard)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users insert own row on signup" ON users;
CREATE POLICY "Users insert own row on signup"
  ON users FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5. Comptes de test — rôles + QR (après création via l'app ou Auth)
-- -----------------------------------------------------------------------------
UPDATE users SET
  user_role = 'member',
  phone_number = '+22462000001',
  first_name = COALESCE(NULLIF(first_name, ''), 'Aïssata'),
  last_name = COALESCE(NULLIF(last_name, ''), 'Camara'),
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'membre@theloop.gn';

UPDATE users SET
  user_role = 'prime',
  phone_number = '+22462000002',
  first_name = COALESCE(NULLIF(first_name, ''), 'Fatoumata'),
  last_name = COALESCE(NULLIF(last_name, ''), 'Bah'),
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'prime@theloop.gn';

UPDATE users SET
  user_role = 'partner',
  phone_number = '+22462000003',
  first_name = COALESCE(NULLIF(first_name, ''), 'L''Avenue'),
  last_name = COALESCE(NULLIF(last_name, ''), 'Direction'),
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'contact@lavenue.gn';

UPDATE users SET
  user_role = 'admin',
  phone_number = '+22462000004',
  first_name = COALESCE(NULLIF(first_name, ''), 'Admin'),
  last_name = COALESCE(NULLIF(last_name, ''), 'THE LOOP'),
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP
WHERE lower(email) = 'admin@theloop.gn';
