-- THE LOOP — 3 étoiles par défaut + statut archived en base

-- ─── 1. Statut archived (distinct de deactivated) ───────────────────────────
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_content_status_check;
ALTER TABLE public.events
  ADD CONSTRAINT events_content_status_check
  CHECK (content_status IN ('draft', 'published', 'deactivated', 'archived'));

ALTER TABLE public.establishments DROP CONSTRAINT IF EXISTS establishments_content_status_check;
ALTER TABLE public.establishments
  ADD CONSTRAINT establishments_content_status_check
  CHECK (content_status IN ('draft', 'published', 'deactivated', 'archived'));

ALTER TABLE public.tools DROP CONSTRAINT IF EXISTS tools_content_status_check;
ALTER TABLE public.tools
  ADD CONSTRAINT tools_content_status_check
  CHECK (content_status IN ('draft', 'published', 'deactivated', 'archived'));

-- ─── 2. Étoiles par défaut à la création ────────────────────────────────────
ALTER TABLE public.establishments
  ALTER COLUMN star_count SET DEFAULT 3;

ALTER TABLE public.tools
  ALTER COLUMN star_count SET DEFAULT 3;

ALTER TABLE public.loop_walks
  ALTER COLUMN star_count SET DEFAULT 3;

COMMENT ON COLUMN public.establishments.star_count IS
  'Nombre d''étoiles affiché (défaut 3 à la création, puis calcul auto ou override admin).';
COMMENT ON COLUMN public.tools.star_count IS
  'Nombre d''étoiles affiché (défaut 3 à la création, puis calcul auto ou override admin).';
COMMENT ON COLUMN public.loop_walks.star_count IS
  'Nombre d''étoiles affiché (défaut 3 à la création, puis calcul auto ou override admin).';
