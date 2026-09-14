-- Colonnes contenu sur les demandes de validation avantage (lien event / spot / outil)
-- Exécution via SECURITY DEFINER pour éviter 42501 « must be owner » dans le SQL Editor.

CREATE OR REPLACE FUNCTION public.apply_benefit_redemption_content_columns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  ALTER TABLE public.benefit_redemptions
    ADD COLUMN IF NOT EXISTS content_id TEXT,
    ADD COLUMN IF NOT EXISTS content_type TEXT CHECK (content_type IS NULL OR content_type IN ('event', 'spot', 'tool')),
    ADD COLUMN IF NOT EXISTS content_title TEXT;

  CREATE INDEX IF NOT EXISTS idx_benefit_redemptions_content
    ON public.benefit_redemptions(content_id)
    WHERE content_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_benefit_redemption_content_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_benefit_redemption_content_columns() TO postgres, service_role;

SELECT public.apply_benefit_redemption_content_columns();

DROP FUNCTION IF EXISTS public.apply_benefit_redemption_content_columns();
