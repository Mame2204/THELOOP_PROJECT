-- THE LOOP — Étoiles spots : paramètres, paliers, engagement, override admin
-- Exécuter après 20260722_country_codes.sql

-- -----------------------------------------------------------------------------
-- 1. Paramètres de calcul (par pays ou global)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spot_star_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT,
  click_weight INTEGER NOT NULL DEFAULT 1 CHECK (click_weight >= 0),
  favorite_weight INTEGER NOT NULL DEFAULT 5 CHECK (favorite_weight >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spot_star_settings_country
  ON public.spot_star_settings (COALESCE(country_code, '__GLOBAL__'));

-- Paliers score → nombre d'étoiles (1 à 5)
CREATE TABLE IF NOT EXISTS public.spot_star_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_id UUID NOT NULL REFERENCES public.spot_star_settings(id) ON DELETE CASCADE,
  min_score INTEGER NOT NULL DEFAULT 0 CHECK (min_score >= 0),
  max_score INTEGER CHECK (max_score IS NULL OR max_score >= min_score),
  star_count INTEGER NOT NULL CHECK (star_count BETWEEN 1 AND 5),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spot_star_tiers_settings
  ON public.spot_star_tiers(settings_id, sort_order);

-- Journal des calculs quotidiens (une passe par pays et par jour)
CREATE TABLE IF NOT EXISTS public.spot_star_calc_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  spots_updated INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (country_code, run_date)
);

-- -----------------------------------------------------------------------------
-- 2. Colonnes engagement sur establishments
-- -----------------------------------------------------------------------------
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorite_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_score INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS star_count INTEGER NOT NULL DEFAULT 0 CHECK (star_count BETWEEN 0 AND 5),
  ADD COLUMN IF NOT EXISTS stars_source TEXT NOT NULL DEFAULT 'auto'
    CHECK (stars_source IN ('auto', 'admin')),
  ADD COLUMN IF NOT EXISTS admin_star_override INTEGER
    CHECK (admin_star_override IS NULL OR admin_star_override BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS admin_star_override_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_star_override_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_star_calc_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_establishments_star_count ON public.establishments(star_count DESC);
CREATE INDEX IF NOT EXISTS idx_establishments_engagement ON public.establishments(engagement_score DESC);

-- -----------------------------------------------------------------------------
-- 3. Seed paramètres par défaut (Guinée + global)
-- -----------------------------------------------------------------------------
INSERT INTO public.spot_star_settings (country_code, click_weight, favorite_weight)
SELECT NULL, 1, 5
WHERE NOT EXISTS (
  SELECT 1 FROM public.spot_star_settings WHERE country_code IS NULL
);

INSERT INTO public.spot_star_settings (country_code, click_weight, favorite_weight)
SELECT 'GN', 1, 5
WHERE NOT EXISTS (
  SELECT 1 FROM public.spot_star_settings WHERE country_code = 'GN'
);

DO $$
DECLARE
  global_id UUID;
  gn_id UUID;
BEGIN
  SELECT id INTO global_id FROM public.spot_star_settings WHERE country_code IS NULL LIMIT 1;
  SELECT id INTO gn_id FROM public.spot_star_settings WHERE country_code = 'GN' LIMIT 1;

  IF global_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.spot_star_tiers WHERE settings_id = global_id) THEN
    INSERT INTO public.spot_star_tiers (settings_id, min_score, max_score, star_count, sort_order) VALUES
      (global_id, 0, 50, 1, 1),
      (global_id, 51, 200, 2, 2),
      (global_id, 201, 500, 3, 3),
      (global_id, 501, 1000, 4, 4),
      (global_id, 1001, NULL, 5, 5);
  END IF;

  IF gn_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.spot_star_tiers WHERE settings_id = gn_id) THEN
    INSERT INTO public.spot_star_tiers (settings_id, min_score, max_score, star_count, sort_order) VALUES
      (gn_id, 0, 50, 1, 1),
      (gn_id, 51, 200, 2, 2),
      (gn_id, 201, 500, 3, 3),
      (gn_id, 501, 1000, 4, 4),
      (gn_id, 1001, NULL, 5, 5);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. RPC : incrémenter un clic spot
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_spot_click(p_establishment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.establishments
  SET click_count = click_count + 1
  WHERE id = p_establishment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_spot_click(UUID) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.spot_star_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spot_star_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spot_star_calc_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spot_star_settings_read" ON public.spot_star_settings
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "spot_star_settings_admin_write" ON public.spot_star_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.user_role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.user_role = 'admin'));

CREATE POLICY "spot_star_tiers_read" ON public.spot_star_tiers
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "spot_star_tiers_admin_write" ON public.spot_star_tiers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.user_role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.user_role = 'admin'));

CREATE POLICY "spot_star_calc_runs_admin" ON public.spot_star_calc_runs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.user_role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.user_role = 'admin'));
