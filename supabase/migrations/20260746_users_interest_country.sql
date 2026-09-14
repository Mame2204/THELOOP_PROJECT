-- Pays d'intérêt : contenu catalogue (Agenda, Spots, Outils) distinct du pays du compte.
-- NULL = même pays que country_code (comportement par défaut).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS interest_country_code CHAR(2);

COMMENT ON COLUMN public.users.interest_country_code IS
  'Pays THE LOOP exploré temporairement (vacances, déplacement). NULL = pays du compte.';

CREATE INDEX IF NOT EXISTS idx_users_interest_country_code
  ON public.users(interest_country_code)
  WHERE interest_country_code IS NOT NULL;
