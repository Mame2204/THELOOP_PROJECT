-- THE LOOP — RPC admin_sync_auth_user_email (migration automatique)
-- Pour exécution manuelle : voir supabase/scripts/sync_auth_user_email.sql

CREATE OR REPLACE FUNCTION public.admin_sync_auth_user_email(
  p_user_id UUID,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_conflict UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required';
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'email_required';
  END IF;

  IF length(v_email) > 254 OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'email_invalid';
  END IF;

  IF v_email ~ '^[0-9]+@theloop\.gn$' THEN
    RAISE EXCEPTION 'synthetic_email_blocked';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_user_id) THEN
    RAISE EXCEPTION 'user_not_found';
  END IF;

  SELECT au.id INTO v_conflict
  FROM auth.users au
  WHERE lower(trim(au.email)) = v_email
    AND au.id <> p_user_id
  LIMIT 1;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'email_already_used';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = p_user_id) THEN
    RAISE EXCEPTION 'auth_user_not_found';
  END IF;

  UPDATE auth.users
  SET
    email = v_email,
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
  WHERE id = p_user_id;

  IF to_regclass('auth.identities') IS NOT NULL THEN
    UPDATE auth.identities
    SET
      identity_data = jsonb_set(
        jsonb_set(COALESCE(identity_data, '{}'::jsonb), '{email}', to_jsonb(v_email), true),
        '{email_verified}',
        'true'::jsonb,
        true
      ),
      provider_id = v_email,
      updated_at = NOW()
    WHERE user_id = p_user_id
      AND provider = 'email';
  END IF;

  UPDATE public.users
  SET email = v_email, updated_at = CURRENT_TIMESTAMP
  WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'email', v_email);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_sync_auth_user_email(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sync_auth_user_email(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_sync_auth_user_email IS
  'Admin : aligne auth.users + identities + public.users sur le nouvel e-mail (comptes migrés téléphone → e-mail).';
