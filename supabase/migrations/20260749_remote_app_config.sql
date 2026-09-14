-- THE LOOP — Catégories, staff overrides, catalogue enrichi, réglages app (source unique BDD)

-- -----------------------------------------------------------------------------
-- 1. Catégories contenu (événements, spots, outils)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.content_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('event', 'spot', 'tool')),
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '🏷️',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_builtin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kind, slug)
);

CREATE INDEX IF NOT EXISTS idx_content_categories_kind ON public.content_categories(kind, sort_order);

ALTER TABLE public.content_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read content categories" ON public.content_categories;
CREATE POLICY "Public read content categories"
  ON public.content_categories FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admin manage content categories" ON public.content_categories;
CREATE POLICY "Admin manage content categories"
  ON public.content_categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.content_categories (kind, slug, label, emoji, sort_order, is_builtin)
VALUES
  ('event', 'corporate', 'Corporate', '💼', 0, TRUE),
  ('event', 'nightlife', 'Nightlife', '🌙', 1, TRUE),
  ('event', 'art_culture', 'Art & Culture', '🎨', 2, TRUE),
  ('event', 'gastronomie', 'Gastronomie', '🍽️', 3, TRUE),
  ('spot', 'fine_dining', 'Fine Dining', '🍽️', 0, TRUE),
  ('spot', 'hotels', 'Hôtels', '🏨', 1, TRUE),
  ('spot', 'bars_lounges', 'Bars & Lounges', '🍸', 2, TRUE),
  ('tool', 'tool-productivite', 'Productivité', '🛠️', 0, TRUE),
  ('tool', 'tool-finance', 'Finance', '🛠️', 1, TRUE),
  ('tool', 'tool-commerce', 'Commerce', '🛠️', 2, TRUE),
  ('tool', 'tool-social', 'Social', '🛠️', 3, TRUE),
  ('tool', 'tool-sante', 'Santé', '🛠️', 4, TRUE),
  ('tool', 'tool-education', 'Éducation', '🛠️', 5, TRUE),
  ('tool', 'tool-autre', 'Autre', '🛠️', 6, TRUE)
ON CONFLICT (kind, slug) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Overrides avantages staff (super admin + admins délégués)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_benefit_overrides (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  revoked_catalog_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  extra JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled_catalog_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL
);

ALTER TABLE public.staff_benefit_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own staff overrides" ON public.staff_benefit_overrides;
CREATE POLICY "Users read own staff overrides"
  ON public.staff_benefit_overrides FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admin manage staff overrides" ON public.staff_benefit_overrides;
CREATE POLICY "Admin manage staff overrides"
  ON public.staff_benefit_overrides FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. Catalogue avantages — champs mobile
-- -----------------------------------------------------------------------------
ALTER TABLE public.benefit_catalog
  ADD COLUMN IF NOT EXISTS local_id TEXT,
  ADD COLUMN IF NOT EXISTS offering_partners JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS benefit_kind TEXT NOT NULL DEFAULT 'unlimited',
  ADD COLUMN IF NOT EXISTS quantity_per_grant INT,
  ADD COLUMN IF NOT EXISTS max_uses_per_grant INT,
  ADD COLUMN IF NOT EXISTS country_code CHAR(2),
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS benefit_purpose TEXT NOT NULL DEFAULT 'standard';

CREATE UNIQUE INDEX IF NOT EXISTS idx_benefit_catalog_local_id
  ON public.benefit_catalog(local_id)
  WHERE local_id IS NOT NULL;

DROP POLICY IF EXISTS "Public read active benefit catalog" ON public.benefit_catalog;
CREATE POLICY "Public read active benefit catalog"
  ON public.benefit_catalog FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

-- -----------------------------------------------------------------------------
-- 4. Réglages app (pays contenu, packs équipe)
-- -----------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value)
VALUES
  ('enabled_content_countries', '["GN","SN"]'::jsonb),
  ('staff_team_pack_by_country', '{"byCountry":{},"updatedAt":"1970-01-01T00:00:00.000Z","updatedBy":null}'::jsonb)
ON CONFLICT (key) DO NOTHING;
