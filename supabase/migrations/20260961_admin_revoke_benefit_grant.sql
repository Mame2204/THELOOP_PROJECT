-- Révocation admin d'un octroi individuel (actif ou en attente validation), post-sécurité 954.

CREATE OR REPLACE FUNCTION public.admin_revoke_benefit_grant(p_local_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(trim(p_local_id), '') = '' THEN
    RETURN FALSE;
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: révocation réservée à l''administration'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.prime_benefit_grants
  SET
    status = 'expired_unused',
    expires_at = NOW(),
    updated_at = NOW()
  WHERE local_id = p_local_id
    AND status IN ('active', 'pending_validation');

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_benefit_grant(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_benefit_grant(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_revoke_benefit_grant(TEXT) IS
  'Révoque un octroi individuel non consommé (admin ou service role).';
