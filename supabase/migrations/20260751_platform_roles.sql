-- THE LOOP — Rôles plateforme (mapping user_role → app_role + theme_id)

CREATE TABLE IF NOT EXISTS public.platform_roles (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  app_role TEXT NOT NULL,
  theme_id TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_roles_sort ON public.platform_roles(sort_order);

ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read platform roles" ON public.platform_roles;
CREATE POLICY "Public read platform roles"
  ON public.platform_roles FOR SELECT TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Admin manage platform roles" ON public.platform_roles;
CREATE POLICY "Admin manage platform roles"
  ON public.platform_roles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.platform_roles (slug, label, app_role, theme_id, is_admin, sort_order)
VALUES
  ('member', 'Membre', 'USER_FREE', 'FREE_MEMBER', FALSE, 0),
  ('prime', 'Loop Prime', 'USER_PRIME', 'PRIME_MEMBER', FALSE, 1),
  ('partner', 'Partenaire', 'PARTNER', 'PARTNER', FALSE, 2),
  ('tool_partner', 'Partenaire outil', 'TOOL_PARTNER', 'PARTNER', FALSE, 3),
  ('admin', 'Admin délégué', 'ADMIN', 'DELEGATED_ADMIN', TRUE, 4),
  ('super_admin', 'Super admin', 'ADMIN', 'ADMIN', TRUE, 5)
ON CONFLICT (slug) DO NOTHING;
