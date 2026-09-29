-- Fix révocation octroi : pas de colonne updated_at sur prime_benefit_grants ;
-- accepte local_id ou id::text ; backfill local_id manquants.

UPDATE public.prime_benefit_grants
SET local_id = id::text
WHERE local_id IS NULL
   OR btrim(local_id) = ''
   OR lower(btrim(local_id)) = 'null';

CREATE OR REPLACE FUNCTION public.admin_revoke_benefit_grant(p_local_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT := btrim(COALESCE(p_local_id, ''));
BEGIN
  IF v_key = '' OR lower(v_key) = 'null' THEN
    RETURN FALSE;
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden: révocation réservée à l''administration'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.prime_benefit_grants
  SET
    status = 'expired_unused',
    expires_at = NOW()
  WHERE status IN ('active', 'pending_validation')
    AND (
      (local_id IS NOT NULL AND btrim(local_id) = v_key)
      OR id::text = v_key
    );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_revoke_benefit_grant(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_revoke_benefit_grant(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_revoke_benefit_grant(TEXT) IS
  'Révoque un octroi individuel (local_id ou id). Post-fix 20260962.';
