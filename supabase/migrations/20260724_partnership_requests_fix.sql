-- THE LOOP — partnership_requests : colonne updated_at manquante en prod
ALTER TABLE public.partnership_requests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.partnership_requests
SET updated_at = COALESCE(created_at, NOW())
WHERE updated_at IS NULL;

-- Rétro-remplissage pays depuis téléphone
UPDATE public.partnership_requests
SET country_code = public.infer_country_code_from_phone(phone)
WHERE country_code IS NULL OR country_code = '';

CREATE OR REPLACE FUNCTION public.set_partnership_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partnership_requests_updated_at ON public.partnership_requests;
CREATE TRIGGER trg_partnership_requests_updated_at
  BEFORE UPDATE ON public.partnership_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_partnership_requests_updated_at();
