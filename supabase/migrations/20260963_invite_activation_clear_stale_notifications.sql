-- À l'activation invité : retirer les notifications « invitation » devenues obsolètes (e-mail suffit).

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
  v_caller_email TEXT;
  v_user_id UUID;
BEGIN
  IF p_invite_id IS NULL OR v_email IS NULL OR v_email = '' THEN
    RETURN FALSE;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN
    IF auth.uid() IS NULL THEN
      RETURN FALSE;
    END IF;
    SELECT lower(trim(au.email)) INTO v_caller_email
    FROM auth.users au
    WHERE au.id = auth.uid();
    IF v_caller_email IS DISTINCT FROM v_email THEN
      RETURN FALSE;
    END IF;
  END IF;

  UPDATE public.admin_user_invites i
  SET activated_at = NOW()
  WHERE i.id = p_invite_id
    AND i.activated_at IS NULL
    AND lower(trim(i.email)) = v_email;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    UPDATE public.users u
    SET
      account_status = 'active',
      is_active = TRUE,
      updated_at = NOW()
    WHERE lower(trim(u.email)) = v_email
      AND u.account_status = 'invited';

    SELECT u.id INTO v_user_id
    FROM public.users u
    WHERE lower(trim(u.email)) = v_email
    LIMIT 1;

    IF v_user_id IS NOT NULL THEN
      DELETE FROM public.user_notifications un
      WHERE un.user_id = v_user_id
        AND (
          un.title = 'Invitation THE LOOP'
          OR un.message ILIKE '%Activer un compte invité par THE LOOP%'
        );
    END IF;
  END IF;

  RETURN v_updated > 0;
END;
$$;
