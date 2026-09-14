-- THE LOOP — Activation compte invité par l'équipe (anon/authenticated, sans accès direct RLS admin)

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

CREATE OR REPLACE FUNCTION public.mark_admin_user_invite_activated(
  p_invite_id UUID,
  p_email TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_updated INT;
BEGIN
  IF p_invite_id IS NULL OR v_email IS NULL OR v_email = '' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.admin_user_invites i
  SET activated_at = NOW()
  WHERE i.id = p_invite_id
    AND i.activated_at IS NULL
    AND lower(trim(i.email)) = v_email;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.find_pending_admin_invite_by_email(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_admin_user_invite_activated(UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.find_pending_admin_invite_by_email(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_admin_user_invite_activated(UUID, TEXT) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.find_pending_admin_invite_by_email IS
  'Retourne une invitation admin en attente pour un e-mail (activation compte invité, sans lecture RLS directe).';

COMMENT ON FUNCTION public.mark_admin_user_invite_activated IS
  'Marque une invitation admin comme activée si l''e-mail correspond (post-inscription invité).';
