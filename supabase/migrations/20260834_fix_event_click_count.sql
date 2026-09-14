-- THE LOOP — Colonne click_count manquante sur events (Production V1.0)
-- Sans cette colonne, increment_event_click (20260832) ne met rien à jour.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0 CHECK (click_count >= 0);

COMMENT ON COLUMN public.events.click_count IS
  'Nombre d''ouvertures fiche événement — incrémenté par increment_event_click.';

CREATE OR REPLACE FUNCTION public.increment_event_click(p_event_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.events
  SET click_count = click_count + 1
  WHERE id = p_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_event_click(UUID) TO anon, authenticated;
