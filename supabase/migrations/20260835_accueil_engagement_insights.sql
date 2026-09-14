-- THE LOOP — Engagement Accueil : clics Corner + vues sondage (Insights)

ALTER TABLE public.creator_corner_features
  ADD COLUMN IF NOT EXISTS click_count INTEGER NOT NULL DEFAULT 0 CHECK (click_count >= 0);

COMMENT ON COLUMN public.creator_corner_features.click_count IS
  'Ouvertures fiche Corner créateur (carte Accueil + détail).';

ALTER TABLE public.home_polls
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0 CHECK (view_count >= 0);

COMMENT ON COLUMN public.home_polls.view_count IS
  'Affichages du bloc sondage sur Accueil — dénominateur du taux de réponse.';

CREATE OR REPLACE FUNCTION public.increment_creator_corner_click(p_corner_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.creator_corner_features
  SET click_count = click_count + 1,
      updated_at = NOW()
  WHERE id = p_corner_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_home_poll_view(p_poll_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.home_polls
  SET view_count = view_count + 1,
      updated_at = NOW()
  WHERE id = p_poll_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_creator_corner_click(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_home_poll_view(UUID) TO anon, authenticated;
