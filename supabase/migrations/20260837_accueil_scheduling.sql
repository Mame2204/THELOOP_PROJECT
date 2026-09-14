-- Planification Accueil : dates corner + sondage, chevauchement interdit sur period_start

ALTER TABLE public.home_polls
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE;

COMMENT ON COLUMN public.home_polls.period_start IS
  'Date de début d''affichage (optionnelle). Une seule par pays si renseignée.';
COMMENT ON COLUMN public.home_polls.period_end IS
  'Date de fin d''affichage (optionnelle).';

DROP INDEX IF EXISTS public.idx_home_polls_one_active;
DROP INDEX IF EXISTS public.idx_creator_corner_one_active;

CREATE UNIQUE INDEX IF NOT EXISTS idx_home_polls_country_period_start
  ON public.home_polls (country_code, period_start)
  WHERE period_start IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_corner_country_period_start
  ON public.creator_corner_features (country_code, period_start)
  WHERE period_start IS NOT NULL;
