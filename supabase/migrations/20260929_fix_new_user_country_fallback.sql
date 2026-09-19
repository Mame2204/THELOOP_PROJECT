-- =============================================================================
-- 20260929 — Fiabiliser la création de compte
-- =============================================================================
-- Problème constaté en production : public.users.country_code est NOT NULL,
-- mais handle_new_auth_user écrit explicitement NULL dans cette colonne quand
-- la métadonnée 'country_code' est absente. L'INSERT échoue alors avec 23502,
-- la transaction auth est annulée et le client ne reçoit qu'un message opaque
-- « Database error creating new user », impossible à diagnostiquer.
--
-- Les deux chemins de création actuels (inscription mobile et Edge Function
-- admin-send-invite) envoient toujours un pays, donc la production n'est pas
-- cassée aujourd'hui. Mais tout nouveau chemin qui oublierait ce champ casserait
-- silencieusement l'inscription. On retombe donc sur le pays par défaut de
-- l'application ('GN'), aligné sur DEFAULT_COUNTRY_CODE côté mobile et sur le
-- défaut déjà appliqué par admin-send-invite.
--
-- Seule la ligne v_country change par rapport à 20260916.
-- =============================================================================

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
  v_admin_invite BOOLEAN := COALESCE(
    (NEW.raw_user_meta_data->>'invited_by_admin')::BOOLEAN,
    FALSE
  ) OR lower(COALESCE(NEW.raw_user_meta_data->>'invited_by_admin', '')) = 'true';
  v_country TEXT := COALESCE(
    NULLIF(upper(trim(COALESCE(NEW.raw_user_meta_data->>'country_code', ''))), ''),
    'GN'
  );
  v_city TEXT := NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'city', '')), '');
BEGIN
  INSERT INTO public.users (
    id, email, password_hash, phone_number,
    first_name, last_name, user_role, qr_code_token,
    is_active, account_status, country_code, city
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
    NOT v_admin_invite,
    CASE WHEN v_admin_invite THEN 'invited' ELSE 'active' END,
    v_country,
    v_city
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone_number = EXCLUDED.phone_number,
    user_role = COALESCE(NULLIF(EXCLUDED.user_role, ''), users.user_role),
    qr_code_token = COALESCE(NULLIF(EXCLUDED.qr_code_token, ''), users.qr_code_token),
    country_code = COALESCE(EXCLUDED.country_code, users.country_code),
    city = COALESCE(EXCLUDED.city, users.city),
    is_active = CASE
      WHEN users.account_status = 'invited' THEN FALSE
      WHEN users.is_active = FALSE THEN FALSE
      ELSE EXCLUDED.is_active
    END,
    account_status = CASE
      WHEN users.account_status IN ('suspended', 'archived', 'deleted') THEN users.account_status
      WHEN v_admin_invite AND users.account_status = 'invited' THEN 'invited'
      WHEN users.account_status = 'invited' THEN 'invited'
      ELSE COALESCE(users.account_status, 'active')
    END,
    updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$;
