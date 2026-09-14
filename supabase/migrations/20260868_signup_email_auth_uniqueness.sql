-- THE LOOP — Unicité inscription : auth.users + public.users (SECURITY DEFINER)

CREATE OR REPLACE FUNCTION public.check_signup_email_available(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_auth_id UUID;
  v_confirmed BOOLEAN;
  v_public_count INT;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RETURN 'invalid';
  END IF;

  IF length(v_email) > 254 OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RETURN 'invalid';
  END IF;

  IF v_email ~ '^[0-9]+@theloop\.gn$' THEN
    RETURN 'synthetic_blocked';
  END IF;

  SELECT au.id, (au.email_confirmed_at IS NOT NULL)
  INTO v_auth_id, v_confirmed
  FROM auth.users au
  WHERE lower(trim(au.email)) = v_email
  LIMIT 1;

  IF v_auth_id IS NOT NULL THEN
    IF v_confirmed THEN
      RETURN 'already_registered';
    END IF;
    RETURN 'pending_confirmation';
  END IF;

  SELECT COUNT(*)::INT INTO v_public_count
  FROM public.users u
  WHERE lower(trim(u.email)) = v_email;

  IF v_public_count > 0 THEN
    RETURN 'already_registered';
  END IF;

  RETURN 'available';
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_signup_email_available(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.check_signup_email_available IS
  'Pré-contrôle inscription : available | already_registered | pending_confirmation | invalid | synthetic_blocked';

CREATE OR REPLACE FUNCTION public.assert_signup_email_allowed(p_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_status TEXT;
  v_recent INT;
BEGIN
  v_status := public.check_signup_email_available(v_email);

  IF v_status = 'invalid' THEN
    RAISE EXCEPTION 'email_invalid';
  END IF;

  IF v_status = 'synthetic_blocked' THEN
    RAISE EXCEPTION 'synthetic_email_blocked';
  END IF;

  IF v_status = 'already_registered' THEN
    RAISE EXCEPTION 'email_already_used';
  END IF;

  IF v_status = 'pending_confirmation' THEN
    RAISE EXCEPTION 'email_pending_confirmation';
  END IF;

  SELECT COUNT(*)::INT INTO v_recent
  FROM public.signup_attempts s
  WHERE s.email_normalized = v_email
    AND s.attempted_at > NOW() - INTERVAL '1 hour';

  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'signup_rate_limited';
  END IF;

  INSERT INTO public.signup_attempts (email_normalized) VALUES (v_email);
END;
$$;
