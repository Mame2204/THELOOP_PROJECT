-- Bloquer l'activation « compte invité » lorsque le profil public.users est déjà actif (hors statut invited).

CREATE OR REPLACE FUNCTION public.find_pending_admin_invite_by_email(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_row public.admin_user_invites%ROWTYPE;
  v_status TEXT;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN NULL;
  END IF;

  IF length(v_email) > 254 OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_row
  FROM public.admin_user_invites i
  WHERE lower(trim(i.email)) = v_email
    AND i.activated_at IS NULL
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT lower(trim(u.account_status))
  INTO v_status
  FROM public.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  IF v_status IS NOT NULL AND v_status <> 'invited' THEN
    UPDATE public.admin_user_invites i
    SET activated_at = COALESCE(i.activated_at, NOW())
    WHERE i.id = v_row.id
      AND i.activated_at IS NULL;
    RETURN NULL;
  END IF;

  RETURN json_build_object(
    'id', v_row.id,
    'phone_number', v_row.phone_number,
    'email', v_row.email,
    'user_role', v_row.user_role,
    'first_name', v_row.first_name,
    'last_name', v_row.last_name,
    'country_code', v_row.country_code,
    'otp_sent_at', v_row.otp_sent_at,
    'activated_at', v_row.activated_at,
    'created_at', v_row.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_admin_invite_activation_eligibility(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_has_pending BOOLEAN := FALSE;
  v_status TEXT;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN 'no_pending_invite';
  END IF;

  IF length(v_email) > 254 OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RETURN 'no_pending_invite';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.admin_user_invites i
    WHERE lower(trim(i.email)) = v_email
      AND i.activated_at IS NULL
  )
  INTO v_has_pending;

  IF NOT v_has_pending THEN
    RETURN 'no_pending_invite';
  END IF;

  SELECT lower(trim(u.account_status))
  INTO v_status
  FROM public.users u
  WHERE lower(trim(u.email)) = v_email
  LIMIT 1;

  IF v_status IS NOT NULL AND v_status <> 'invited' THEN
    UPDATE public.admin_user_invites i
    SET activated_at = COALESCE(i.activated_at, NOW())
    WHERE lower(trim(i.email)) = v_email
      AND i.activated_at IS NULL;
    RETURN 'account_already_active';
  END IF;

  RETURN 'eligible';
END;
$$;

REVOKE ALL ON FUNCTION public.check_admin_invite_activation_eligibility(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_admin_invite_activation_eligibility(TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.check_admin_invite_activation_eligibility IS
  'eligible | no_pending_invite | account_already_active — garde-fou activation compte invité (mobile).';
