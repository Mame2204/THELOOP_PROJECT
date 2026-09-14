-- THE LOOP — Corner créateur (mise en avant bi-mensuelle / mensuelle)

CREATE TABLE IF NOT EXISTS public.creator_corner_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  person_name TEXT NOT NULL,
  person_role TEXT,
  location_label TEXT,
  hook TEXT NOT NULL,
  title TEXT NOT NULL,
  cta_label TEXT NOT NULL DEFAULT 'Découvrir',
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT creator_corner_links_array CHECK (jsonb_typeof(useful_links) = 'array')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_corner_one_active
  ON public.creator_corner_features (country_code)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_creator_corner_active
  ON public.creator_corner_features (is_active, period_start DESC);

ALTER TABLE public.creator_corner_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active creator corner" ON public.creator_corner_features;
CREATE POLICY "Public read active creator corner"
  ON public.creator_corner_features FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admin manage creator corner" ON public.creator_corner_features;
CREATE POLICY "Admin manage creator corner"
  ON public.creator_corner_features FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.creator_corner_features (
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
  'aissatou-diallo-august-2026',
  'Aïssatou Diallo',
  'Fondatrice · Culture & impact',
  'Conakry · Guinée',
  'Elle transforme les reco urbaines en expériences qui font vibrer la ville.',
  'Le regard qui ouvre Conakry autrement',
  'Découvrir',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80',
  'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=400&q=80',
  'Aïssatou a grandi entre Kaloum et Dixinn. Passionnée de scènes indépendantes, elle cartographie les lieux où la créativité guinéenne s’exprime vraiment — hors des circuits trop lisses.',
  'Journaliste culturelle, puis productrice de formats courts, elle lance aujourd’hui un studio qui relie artistes, spots et public curieux. Son fil conducteur : rendre visible ce qui mérite d’être vécu.',
  'Ne cherchez pas le “lieu parfait”. Cherchez le lieu juste pour ce soir — et laissez-vous surprendre.',
  'Le rooftop du Sky Lounge un mardi hors rush, quand Conakry respire encore.',
  '[
    {"label":"Instagram","url":"https://instagram.com"},
    {"label":"Portfolio","url":"https://theloop.gn"}
  ]'::jsonb,
  'Août 2026',
  DATE '2026-08-01',
  DATE '2026-08-31',
  true,
  'GN'
WHERE NOT EXISTS (
  SELECT 1 FROM public.creator_corner_features WHERE is_active = true AND country_code = 'GN'
);
