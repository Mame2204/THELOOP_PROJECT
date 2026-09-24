-- Insights admin : lecture agrégée des octrois (contourne RLS membre-only si session admin incomplète).

CREATE OR REPLACE FUNCTION public.list_admin_benefit_grants_analytics(p_country_code text DEFAULT NULL)
RETURNS TABLE (
  local_id text,
  catalog_local_id text,
  catalog_id uuid,
  status text,
  used_at timestamptz,
  expires_at timestamptz,
  role_entitlement text,
  grant_country_code text,
  grant_audience text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    g.local_id,
    g.catalog_local_id,
    g.catalog_id,
    g.status,
    g.used_at,
    g.expires_at,
    g.role_entitlement,
    g.grant_country_code,
    g.grant_audience
  FROM public.prime_benefit_grants g
  WHERE
    p_country_code IS NULL
    OR trim(p_country_code) = ''
    OR g.grant_country_code IS NULL
    OR upper(trim(g.grant_country_code)) = upper(left(trim(p_country_code), 2))
  ORDER BY g.granted_at DESC
  LIMIT 5000;
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_benefit_grants_analytics(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_benefit_grants_analytics(text) TO authenticated;

COMMENT ON FUNCTION public.list_admin_benefit_grants_analytics(text) IS
  'Liste octrois pour KPI Insights admin (admin uniquement, filtre pays optionnel).';
