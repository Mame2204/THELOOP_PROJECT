-- THE LOOP — Lier jetons SPOT aux comptes users + sync octrois Prime
-- Compatible Production V1.0 (users VARCHAR, pas d'enum partner_token_status)

-- -----------------------------------------------------------------------------
-- 0. Table partner_tokens (absente du script analyste — requise pour SPOT-DEMO-2026)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_name TEXT NOT NULL,
  token_code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_tokens_code ON public.partner_tokens(token_code);

ALTER TABLE public.partner_tokens
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

INSERT INTO public.partner_tokens (partner_name, token_code, expires_at, status)
VALUES ('L''Avenue', 'SPOT-DEMO-2026', '2027-12-31 23:59:59+00', 'active')
ON CONFLICT (token_code) DO UPDATE SET
  status = 'active',
  expires_at = EXCLUDED.expires_at,
  updated_at = NOW();

-- 1. Lier partner_tokens → users (SPOT-DEMO-2026 → contact@lavenue.gn)
UPDATE public.partner_tokens pt
SET user_id = u.id, updated_at = NOW()
FROM public.users u
WHERE pt.user_id IS NULL
  AND lower(u.email) = 'contact@lavenue.gn'
  AND pt.token_code = 'SPOT-DEMO-2026';

UPDATE public.partner_tokens pt
SET user_id = u.id, updated_at = NOW()
FROM public.users u
WHERE pt.user_id IS NULL
  AND pt.partner_name ILIKE '%' || u.first_name || '%'
  AND u.user_role = 'partner';

ALTER TABLE public.partner_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active partner tokens" ON public.partner_tokens;
CREATE POLICY "Public read active partner tokens"
  ON public.partner_tokens FOR SELECT TO anon, authenticated
  USING (status = 'active' AND expires_at > NOW());

-- 2. Tables avantages Prime (si absentes — migration 20260720)
CREATE TABLE IF NOT EXISTS public.benefit_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  partner_name TEXT,
  default_validity_days INTEGER NOT NULL DEFAULT 30 CHECK (default_validity_days > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prime_benefit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id TEXT UNIQUE,
  catalog_id UUID REFERENCES public.benefit_catalog(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  partner_name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'pending_validation', 'used', 'expired_unused')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  grant_audience TEXT NOT NULL DEFAULT 'individual',
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  grant_country_code CHAR(2),
  grant_city TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prime_benefit_grants
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS grant_country_code CHAR(2),
  ADD COLUMN IF NOT EXISTS grant_city TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prime_benefit_grants_local_id
  ON public.prime_benefit_grants(local_id)
  WHERE local_id IS NOT NULL;

ALTER TABLE public.prime_benefit_grants
  DROP CONSTRAINT IF EXISTS prime_benefit_grants_status_check;

ALTER TABLE public.prime_benefit_grants
  ADD CONSTRAINT prime_benefit_grants_status_check
  CHECK (status IN ('active', 'pending_validation', 'used', 'expired_unused'));

-- 3. RPC upsert octroi (mobile ↔ base)
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
  p_grant_city TEXT DEFAULT NULL
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
    grant_country_code, grant_city
  ) VALUES (
    p_local_id, p_user_id, p_title, p_description, p_partner_name,
    p_status, p_granted_at, p_expires_at, p_used_at, p_grant_audience,
    p_grant_country_code, p_grant_city
  )
  ON CONFLICT (local_id) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    partner_name = EXCLUDED.partner_name,
    status = EXCLUDED.status,
    expires_at = EXCLUDED.expires_at,
    used_at = EXCLUDED.used_at,
    grant_audience = EXCLUDED.grant_audience,
    grant_country_code = EXCLUDED.grant_country_code,
    grant_city = EXCLUDED.grant_city
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_prime_benefit_grant(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO anon, authenticated;

ALTER TABLE public.prime_benefit_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own benefit grants" ON public.prime_benefit_grants;
CREATE POLICY "Users read own benefit grants"
  ON public.prime_benefit_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update own benefit grants" ON public.prime_benefit_grants;
CREATE POLICY "Users update own benefit grants"
  ON public.prime_benefit_grants FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Anon read benefit grants by user" ON public.prime_benefit_grants;
CREATE POLICY "Anon read benefit grants by user"
  ON public.prime_benefit_grants FOR SELECT TO anon
  USING (true);
