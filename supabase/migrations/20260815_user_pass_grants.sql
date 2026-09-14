-- Octrois PASS (catalogue → membre) persistés en base

CREATE TABLE IF NOT EXISTS public.user_pass_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pass_catalog_id TEXT NOT NULL,
  label TEXT NOT NULL,
  pass_kind TEXT NOT NULL DEFAULT 'custom',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  grant_note TEXT,
  local_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_pass_grants_user
  ON public.user_pass_grants (user_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_pass_grants_catalog
  ON public.user_pass_grants (pass_catalog_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_pass_grants_local_id
  ON public.user_pass_grants (local_id)
  WHERE local_id IS NOT NULL;

COMMENT ON TABLE public.user_pass_grants IS
  'Historique des PASS octroyés (Heritage et catalogue custom) — source cloud pour mobile.';

ALTER TABLE public.user_pass_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own pass grants" ON public.user_pass_grants;
CREATE POLICY "Users read own pass grants"
  ON public.user_pass_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admin manage pass grants" ON public.user_pass_grants;
CREATE POLICY "Admin manage pass grants"
  ON public.user_pass_grants FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Corriger d’éventuels theme_id inversés partenaire / visiteur
UPDATE public.platform_roles
SET theme_id = 'PARTNER', app_role = 'PARTNER', updated_at = NOW()
WHERE slug IN ('partner', 'tool_partner');

UPDATE public.platform_roles
SET theme_id = 'VISITOR', updated_at = NOW()
WHERE slug = 'guest' OR slug = 'anonymous' OR slug = 'visitor';
