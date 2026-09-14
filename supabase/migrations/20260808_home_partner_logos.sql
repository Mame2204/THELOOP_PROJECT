-- THE LOOP — Ruban logos partenaires (Accueil)

CREATE TABLE IF NOT EXISTS public.home_partner_logos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT NOT NULL,
  website_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  country_code TEXT NOT NULL DEFAULT 'GN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_partner_logos_active
  ON public.home_partner_logos (is_active, sort_order);

ALTER TABLE public.home_partner_logos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active partner logos" ON public.home_partner_logos;
CREATE POLICY "Public read active partner logos"
  ON public.home_partner_logos FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Admin manage partner logos" ON public.home_partner_logos;
CREATE POLICY "Admin manage partner logos"
  ON public.home_partner_logos FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

INSERT INTO public.home_partner_logos (name, logo_url, website_url, sort_order, is_active, country_code)
SELECT * FROM (VALUES
  ('Vista Bank', 'https://ui-avatars.com/api/?name=Vista+Bank&background=1A237E&color=fff&size=128&bold=true', 'https://theloop.gn', 1, true, 'GN'),
  ('Ecobank', 'https://ui-avatars.com/api/?name=Ecobank&background=006B3F&color=fff&size=128&bold=true', NULL, 2, true, 'GN'),
  ('Hôtel Noom', 'https://ui-avatars.com/api/?name=Noom&background=C9A84C&color=111&size=128&bold=true', NULL, 3, true, 'GN'),
  ('L''Avenue', 'https://ui-avatars.com/api/?name=L+Avenue&background=8E1631&color=fff&size=128&bold=true', NULL, 4, true, 'GN'),
  ('Sky Lounge', 'https://ui-avatars.com/api/?name=Sky+Lounge&background=0D9488&color=fff&size=128&bold=true', NULL, 5, true, 'GN'),
  ('Palm Camayenne', 'https://ui-avatars.com/api/?name=Palm&background=2E7D32&color=fff&size=128&bold=true', NULL, 6, true, 'GN')
) AS v(name, logo_url, website_url, sort_order, is_active, country_code)
WHERE NOT EXISTS (SELECT 1 FROM public.home_partner_logos LIMIT 1);
