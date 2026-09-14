-- Campagnes push admin : métadonnées complètes pour sync app mobile

ALTER TABLE public.admin_push_campaigns
  ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'GN',
  ADD COLUMN IF NOT EXISTS favorite_event_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS favorite_spot_categories JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.admin_push_campaigns.country_code IS
  'Pays cible de la campagne (filtre admin).';
COMMENT ON COLUMN public.admin_push_campaigns.favorite_event_categories IS
  'Slugs catégories événement (audience favorites).';
COMMENT ON COLUMN public.admin_push_campaigns.favorite_spot_categories IS
  'Slugs catégories spot (audience favorites).';
