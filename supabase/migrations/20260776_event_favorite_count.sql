-- Compteur de favoris dénormalisé sur les événements (comme spots / outils)

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS favorite_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.events.favorite_count IS 'Nombre de favoris (favorite_events) — mis à jour par trigger.';

CREATE OR REPLACE FUNCTION public.refresh_event_favorite_count(p_event_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.events e
  SET favorite_count = (
    SELECT COUNT(*)::INTEGER FROM public.favorite_events f WHERE f.event_id = p_event_id
  )
  WHERE e.id = p_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_favorite_events_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_event_favorite_count(OLD.event_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_event_favorite_count(NEW.event_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_favorite_events_count ON public.favorite_events;
CREATE TRIGGER trg_favorite_events_count
  AFTER INSERT OR DELETE ON public.favorite_events
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_favorite_events_count();

-- Backfill
UPDATE public.events e
SET favorite_count = (
  SELECT COUNT(*)::INTEGER FROM public.favorite_events f WHERE f.event_id = e.id
);
