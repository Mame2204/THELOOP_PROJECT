-- THE LOOP — Événements : créateur (master_id) vs organisateur affiché (organizer_name)
-- master_id = compte qui a créé l'événement dans l'app
-- organizer_name = nom saisi à la publication (Vista Bank, Conakry Events, etc.)

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS master_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS organizer_name TEXT;

-- Rétrocompat : si master_id absent, reprendre organizer_id (créateur historique)
UPDATE public.events
SET master_id = organizer_id
WHERE master_id IS NULL AND organizer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_master_id ON public.events(master_id);

COMMENT ON COLUMN public.events.master_id IS 'Utilisateur ayant créé l''événement (compte connecté).';
COMMENT ON COLUMN public.events.organizer_name IS 'Nom d''organisateur affiché publiquement (saisi à la création).';
