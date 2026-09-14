-- THE LOOP — Pays par indicatif téléphonique (ISO 3166-1 alpha-2)

-- Utilisateurs
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'GN';

CREATE INDEX IF NOT EXISTS idx_users_country_code ON public.users(country_code);

-- Événements (schéma production V1)
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'GN';

CREATE INDEX IF NOT EXISTS idx_events_country_code ON public.events(country_code);

-- Établissements / spots
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'GN';

CREATE INDEX IF NOT EXISTS idx_establishments_country_code ON public.establishments(country_code);

-- Quartiers / villes
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS country_code CHAR(2);

UPDATE public.locations
SET country_code = 'GN'
WHERE country_code IS NULL
  AND (country ILIKE '%guin%' OR country IS NULL OR country = '');

UPDATE public.locations
SET country_code = 'GN'
WHERE country_code IS NULL;

-- Invitations admin
ALTER TABLE public.admin_user_invites
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'GN';

-- Demandes de partenariat
ALTER TABLE public.partnership_requests
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'GN';

-- Inférence pays depuis E.164 (indicatifs Afrique de l'Ouest)
CREATE OR REPLACE FUNCTION public.infer_country_code_from_phone(p_phone TEXT)
RETURNS CHAR(2)
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  digits TEXT;
BEGIN
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RETURN 'GN';
  END IF;
  digits := regexp_replace(p_phone, '\D', '', 'g');
  IF digits LIKE '224%' THEN RETURN 'GN'; END IF;
  IF digits LIKE '221%' THEN RETURN 'SN'; END IF;
  IF digits LIKE '225%' THEN RETURN 'CI'; END IF;
  IF digits LIKE '223%' THEN RETURN 'ML'; END IF;
  IF digits LIKE '226%' THEN RETURN 'BF'; END IF;
  IF digits LIKE '229%' THEN RETURN 'BJ'; END IF;
  IF digits LIKE '228%' THEN RETURN 'TG'; END IF;
  IF digits LIKE '227%' THEN RETURN 'NE'; END IF;
  IF digits LIKE '222%' THEN RETURN 'MR'; END IF;
  IF digits LIKE '231%' THEN RETURN 'LR'; END IF;
  IF digits LIKE '232%' THEN RETURN 'SL'; END IF;
  IF digits LIKE '233%' THEN RETURN 'GH'; END IF;
  RETURN 'GN';
END;
$$;

-- Rétro-remplissage comptes existants
UPDATE public.users
SET country_code = public.infer_country_code_from_phone(phone_number)
WHERE phone_number IS NOT NULL
  AND phone_number <> ''
  AND phone_number <> 'non_renseigne';

UPDATE public.admin_user_invites
SET country_code = public.infer_country_code_from_phone(phone_number)
WHERE phone_number IS NOT NULL;

UPDATE public.partnership_requests
SET country_code = public.infer_country_code_from_phone(phone)
WHERE phone IS NOT NULL;
