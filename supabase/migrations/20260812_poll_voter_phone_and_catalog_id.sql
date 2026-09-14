-- Votes sondages : téléphone optionnel + catalog_id avantages nullable + RPC fix

-- 1) Sondages Accueil — identifier le vote (compte et/ou téléphone)
ALTER TABLE public.home_poll_votes
  ADD COLUMN IF NOT EXISTS voter_phone TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_home_poll_votes_phone
  ON public.home_poll_votes (poll_id, voter_phone)
  WHERE voter_phone IS NOT NULL;

COMMENT ON COLUMN public.home_poll_votes.voter_phone IS
  'Téléphone canonique du votant (profil connecté ou saisi en anonyme).';

-- 2) Avantages — catalog_id peut être NULL (octrois rôle / sync sans UUID catalogue)
ALTER TABLE public.prime_benefit_grants
  ALTER COLUMN catalog_id DROP NOT NULL;

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
  v_catalog_id UUID;
  v_local TEXT := NULLIF(trim(COALESCE(p_catalog_local_id, '')), '');
BEGIN
  IF v_local IS NOT NULL AND v_local NOT IN ('remote', 'legacy') THEN
    IF v_local ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_catalog_id := v_local::uuid;
    ELSE
      SELECT c.id INTO v_catalog_id
      FROM public.benefit_catalog c
      WHERE c.local_id = v_local
      LIMIT 1;
    END IF;
  END IF;

  INSERT INTO public.prime_benefit_grants (
    local_id, user_id, title, description, partner_name,
    status, granted_at, expires_at, used_at, grant_audience,
    grant_country_code, grant_city, catalog_local_id, role_entitlement, catalog_id
  ) VALUES (
    p_local_id, p_user_id, p_title, p_description, p_partner_name,
    p_status, p_granted_at, p_expires_at, p_used_at, p_grant_audience,
    p_grant_country_code, p_grant_city, v_local, p_role_entitlement, v_catalog_id
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
    catalog_local_id = COALESCE(EXCLUDED.catalog_local_id, public.prime_benefit_grants.catalog_local_id),
    role_entitlement = EXCLUDED.role_entitlement,
    catalog_id = COALESCE(EXCLUDED.catalog_id, public.prime_benefit_grants.catalog_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_prime_benefit_grant(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;
