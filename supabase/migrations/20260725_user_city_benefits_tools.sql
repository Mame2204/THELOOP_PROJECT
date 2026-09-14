-- Ville utilisateur, géo avantages, fix désactivation, catégorie outils
-- 2026-07-25

-- Ville sur le profil membre
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS city TEXT;

-- Géo sur le catalogue d'avantages (AsyncStorage côté mobile en parallèle)
ALTER TABLE public.benefit_catalog
  ADD COLUMN IF NOT EXISTS country_code CHAR(2),
  ADD COLUMN IF NOT EXISTS city TEXT;

ALTER TABLE public.prime_benefit_grants
  ADD COLUMN IF NOT EXISTS grant_country_code CHAR(2),
  ADD COLUMN IF NOT EXISTS grant_city TEXT;

ALTER TABLE public.scheduled_benefit_grants
  ADD COLUMN IF NOT EXISTS grant_country_code CHAR(2),
  ADD COLUMN IF NOT EXISTS grant_city TEXT;

-- Catégorie Outils pour les établissements
INSERT INTO public.establishment_categories (name, slug)
VALUES ('Outils', 'tools')
ON CONFLICT (slug) DO NOTHING;

-- Ne pas réactiver un compte désactivé via ensure_user_profile
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
    is_active = CASE WHEN users.is_active = FALSE THEN FALSE ELSE TRUE END,
    updated_at = CURRENT_TIMESTAMP;
END;
$$;
