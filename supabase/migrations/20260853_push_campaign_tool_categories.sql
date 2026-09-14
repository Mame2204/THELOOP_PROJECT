-- Catégories outils pour campagnes favoris

ALTER TABLE public.admin_push_campaigns
  ADD COLUMN IF NOT EXISTS favorite_tool_categories JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.admin_push_campaigns.favorite_tool_categories IS
  'Slugs catégories outils (audience favorites).';
