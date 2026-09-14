-- THE LOOP — Chronique Accueil (miroir Corner créateur)

CREATE TABLE IF NOT EXISTS public.chronique_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  person_name TEXT NOT NULL,
  person_role TEXT,
  location_label TEXT,
  hook TEXT NOT NULL,
  title TEXT NOT NULL,
  cta_label TEXT NOT NULL DEFAULT 'Lire',
  cover_image_url TEXT,
  portrait_url TEXT,
  story TEXT,
  journey TEXT,
  advice TEXT,
  favorite_pick TEXT,
  useful_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  period_label TEXT,
  period_start DATE,
  period_end DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  country_code TEXT NOT NULL DEFAULT 'GN',
  click_count INTEGER NOT NULL DEFAULT 0 CHECK (click_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chronique_links_array CHECK (jsonb_typeof(useful_links) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chronique_country_period_start
  ON public.chronique_features (country_code, period_start)
  WHERE period_start IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chronique_active
  ON public.chronique_features (is_active, period_start DESC);

ALTER TABLE public.chronique_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active chronique" ON public.chronique_features;
CREATE POLICY "Public read active chronique"
  ON public.chronique_features FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admin manage chronique" ON public.chronique_features;
CREATE POLICY "Admin manage chronique"
  ON public.chronique_features FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.increment_chronique_click(p_chronique_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chronique_features
  SET click_count = click_count + 1,
      updated_at = NOW()
  WHERE id = p_chronique_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_chronique_click(UUID) TO anon, authenticated;

COMMENT ON TABLE public.chronique_features IS
  'Chronique éditoriale Accueil — planification par pays, clics fiche détail.';
COMMENT ON COLUMN public.chronique_features.click_count IS
  'Ouvertures fiche Chronique (carte Accueil → détail).';

-- Visibilité bloc Accueil (clé pays)
UPDATE public.app_settings
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{accueil,chronique}',
  'true'::jsonb,
  true
),
updated_at = NOW()
WHERE key LIKE 'app_sections_ui%'
  AND (value->'accueil'->>'chronique') IS NULL;

INSERT INTO public.chronique_features (
  slug,
  person_name,
  person_role,
  location_label,
  hook,
  title,
  cta_label,
  cover_image_url,
  portrait_url,
  story,
  journey,
  advice,
  favorite_pick,
  useful_links,
  period_label,
  period_start,
  period_end,
  is_active,
  country_code
)
SELECT
  'chronique-conakry-aout-2026',
  'Rédaction THE LOOP',
  'Chronique urbaine',
  'Conakry · Guinée',
  'Une lecture courte pour sentir la ville autrement — spots, scènes et reco du moment.',
  'Conakry, mode d’emploi du mois',
  'Lire',
  'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1200&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
  'Chaque mois, THE LOOP raconte un fil de la ville : ce qui bouge, ce qui reste, ce qu’il faut goûter avant que ça change.',
  'Des balades, des tables, des scènes — toujours ancrées dans le réel conakryen.',
  'Gardez un créneau le week-end pour un lieu que vous n’avez jamais testé.',
  'Le coucher de soleil depuis un rooftop de Kaloum, un mardi sans foule.',
  '[{"label":"THE LOOP","url":"https://theloop.gn"}]'::jsonb,
  'Août 2026',
  DATE '2026-08-01',
  DATE '2026-08-31',
  true,
  'GN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.chronique_features WHERE country_code = 'GN' LIMIT 1
);
