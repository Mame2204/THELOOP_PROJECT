-- Parrainage à l'inscription : résolution du code sponsor côté serveur (registre local app incomplet).

CREATE OR REPLACE FUNCTION public.lookup_sponsor_referral(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_code TEXT := upper(trim(COALESCE(p_code, '')));
  v_row RECORD;
BEGIN
  IF v_code = '' THEN
    RETURN NULL;
  END IF;

  SELECT u.id, u.referral_code, u.user_role
  INTO v_row
  FROM public.users u
  WHERE upper(trim(u.referral_code)) = v_code
    AND COALESCE(u.is_active, true) = true
    AND COALESCE(u.account_status, 'active') = 'active'
    AND lower(COALESCE(u.user_role, 'member')) IN (
      'member',
      'prime',
      'partner',
      'tool_partner'
    )
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'referral_code', v_row.referral_code,
    'user_role', COALESCE(v_row.user_role, 'member')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_sponsor_referral_code_valid(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.lookup_sponsor_referral(p_code) IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_sponsor_referral(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_sponsor_referral_code_valid(TEXT) TO anon, authenticated;

COMMENT ON FUNCTION public.lookup_sponsor_referral(TEXT) IS
  'Inscription parrainage : { id, referral_code, user_role } ou NULL.';
COMMENT ON FUNCTION public.is_sponsor_referral_code_valid(TEXT) IS
  'Pré-contrôle inscription : code parrain actif et éligible.';
