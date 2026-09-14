-- THE LOOP — Téléphone optionnel (auth e-mail)
-- Rend phone_number nullable et aligne les triggers/RPC sur NULL au lieu de 'non_renseigne'.

ALTER TABLE public.users
  ALTER COLUMN phone_number DROP NOT NULL;

UPDATE public.users
SET phone_number = NULL
WHERE phone_number IS NOT NULL
  AND trim(phone_number) IN ('', 'non_renseigne');

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'first_name'), ''), 'Membre');
  v_last_name TEXT := COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'last_name'), ''), 'THE LOOP');
  v_phone TEXT := NULLIF(trim(NEW.raw_user_meta_data->>'phone_number'), '');
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
    is_active = CASE WHEN users.is_active = FALSE THEN FALSE ELSE TRUE END,
    updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_user_profile(
  p_first_name TEXT DEFAULT 'Membre',
  p_last_name TEXT DEFAULT 'THE LOOP',
  p_phone TEXT DEFAULT NULL,
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
  v_phone TEXT := NULLIF(trim(p_phone), '');
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
    v_phone,
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

COMMENT ON COLUMN public.users.phone_number IS
  'Numéro international optionnel ; NULL si non renseigné (auth e-mail).';
