-- THE LOOP — Référentiel géographique Guinée (région → préfecture → commune → quartier)
-- Données : supabase/scripts/seed_guinea_locations.sql (4549 entrées depuis guinea-locations.json)

CREATE TABLE IF NOT EXISTS public.guinea_locations (
  id BIGSERIAL PRIMARY KEY,
  region TEXT NOT NULL,
  prefecture TEXT NOT NULL,
  commune TEXT NOT NULL,
  district TEXT NOT NULL,
  country_code CHAR(2) NOT NULL DEFAULT 'GN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT guinea_locations_unique_hierarchy
    UNIQUE (region, prefecture, commune, district)
);

CREATE INDEX IF NOT EXISTS idx_guinea_locations_region
  ON public.guinea_locations (region);

CREATE INDEX IF NOT EXISTS idx_guinea_locations_prefecture
  ON public.guinea_locations (region, prefecture);

CREATE INDEX IF NOT EXISTS idx_guinea_locations_commune
  ON public.guinea_locations (region, prefecture, commune);

CREATE INDEX IF NOT EXISTS idx_guinea_locations_commune_district
  ON public.guinea_locations (commune, district);

COMMENT ON TABLE public.guinea_locations IS
  'Référentiel admin Guinée : région → préfecture → commune → quartier (district).';

-- Libellé canonique app : "COMMUNE · QUARTIER"
CREATE OR REPLACE FUNCTION public.format_guinea_location_label(
  p_commune TEXT,
  p_district TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN NULLIF(trim(p_district), '') IS NULL THEN trim(p_commune)
    ELSE trim(p_commune) || ' · ' || trim(p_district)
  END;
$$;

ALTER TABLE public.guinea_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read guinea locations" ON public.guinea_locations;
CREATE POLICY "Public read guinea locations"
  ON public.guinea_locations
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin manage guinea locations" ON public.guinea_locations;
CREATE POLICY "Admin manage guinea locations"
  ON public.guinea_locations
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.guinea_locations TO anon, authenticated;
