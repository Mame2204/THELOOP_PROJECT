-- THE LOOP — Sécurité inscription par e-mail (anti-abus, unicité, rate limit)

CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_lower
  ON public.users (lower(trim(email)))
  WHERE email IS NOT NULL AND trim(email) <> '';

CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_normalized TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signup_attempts_email_time
  ON public.signup_attempts (email_normalized, attempted_at DESC);

ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read signup attempts" ON public.signup_attempts;
CREATE POLICY "Admins read signup attempts"
  ON public.signup_attempts FOR SELECT TO authenticated
  USING (public.is_admin());

-- Vérifie e-mail + rate limit avant signUp (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.assert_signup_email_allowed(p_email TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT := lower(trim(p_email));
  v_recent INT;
  v_exists INT;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'email_required';
  END IF;

  IF length(v_email) > 254 OR v_email !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$' THEN
    RAISE EXCEPTION 'email_invalid';
  END IF;

  -- Anciens e-mails synthétiques téléphone (123456@theloop.gn)
  IF v_email ~ '^[0-9]+@theloop\.gn$' THEN
    RAISE EXCEPTION 'synthetic_email_blocked';
  END IF;

  SELECT COUNT(*)::INT INTO v_exists
  FROM public.users u
  WHERE lower(trim(u.email)) = v_email;

  IF v_exists > 0 THEN
    RAISE EXCEPTION 'email_already_used';
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

GRANT EXECUTE ON FUNCTION public.assert_signup_email_allowed(TEXT) TO authenticated, anon;

COMMENT ON FUNCTION public.assert_signup_email_allowed IS
  'Garde-fou inscription : format e-mail, unicité, rate limit horaire, blocage e-mails synthétiques @theloop.gn.';
