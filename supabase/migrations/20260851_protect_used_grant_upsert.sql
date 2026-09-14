-- Ne jamais repasser un octroi « used » en active via upsert mobile (sync admin stale).

CREATE OR REPLACE FUNCTION public.upsert_prime_benefit_grant(
  p_local_id TEXT,
  p_user_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_partner_name TEXT,
  p_status TEXT,
  p_granted_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_used_at TIMESTAMPTZ,
  p_grant_audience TEXT,
  p_grant_country_code TEXT DEFAULT NULL,
  p_grant_city TEXT DEFAULT NULL,
  p_catalog_local_id TEXT DEFAULT NULL,
  p_role_entitlement TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_prev public.prime_benefit_grants%ROWTYPE;
BEGIN
  SELECT * INTO v_prev
  FROM public.prime_benefit_grants
  WHERE local_id = p_local_id
  LIMIT 1;

  INSERT INTO public.prime_benefit_grants (
    local_id, user_id, title, description, partner_name,
    status, granted_at, expires_at, used_at, grant_audience,
    grant_country_code, grant_city, catalog_local_id, role_entitlement
  ) VALUES (
    p_local_id, p_user_id, p_title, p_description, p_partner_name,
    p_status, p_granted_at, p_expires_at, p_used_at, p_grant_audience,
    p_grant_country_code, p_grant_city, p_catalog_local_id, p_role_entitlement
  )
  ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    partner_name = EXCLUDED.partner_name,
    status = CASE
      WHEN public.prime_benefit_grants.status = 'used'
        AND EXCLUDED.status IN ('active', 'pending_validation')
        THEN public.prime_benefit_grants.status
      ELSE EXCLUDED.status
    END,
    expires_at = EXCLUDED.expires_at,
    used_at = COALESCE(EXCLUDED.used_at, public.prime_benefit_grants.used_at),
    grant_audience = EXCLUDED.grant_audience,
    grant_country_code = EXCLUDED.grant_country_code,
    grant_city = EXCLUDED.grant_city,
    catalog_local_id = COALESCE(EXCLUDED.catalog_local_id, public.prime_benefit_grants.catalog_local_id),
    role_entitlement = EXCLUDED.role_entitlement
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_prime_benefit_grant(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;
