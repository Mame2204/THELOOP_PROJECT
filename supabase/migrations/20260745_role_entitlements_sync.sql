-- Sync entitlements rôle (config app_settings + colonnes octrois rôle)

INSERT INTO public.app_settings (key, value)
VALUES (
  'role_benefit_entitlements',
  '{"member":[],"prime":[],"updatedAt":"1970-01-01T00:00:00.000Z","updatedBy":null}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.prime_benefit_grants
  ADD COLUMN IF NOT EXISTS catalog_local_id TEXT,
  ADD COLUMN IF NOT EXISTS role_entitlement TEXT
    CHECK (role_entitlement IS NULL OR role_entitlement IN ('member', 'prime'));

-- Fix upsert (idempotent si 20260744 déjà appliquée)
DROP INDEX IF EXISTS public.idx_prime_benefit_grants_local_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prime_benefit_grants_local_id
  ON public.prime_benefit_grants (local_id)
  WHERE local_id IS NOT NULL;

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
BEGIN
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
    status = EXCLUDED.status,
    expires_at = EXCLUDED.expires_at,
    used_at = EXCLUDED.used_at,
    grant_audience = EXCLUDED.grant_audience,
    grant_country_code = EXCLUDED.grant_country_code,
    grant_city = EXCLUDED.grant_city,
    catalog_local_id = EXCLUDED.catalog_local_id,
    role_entitlement = EXCLUDED.role_entitlement
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_prime_benefit_grant(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;
