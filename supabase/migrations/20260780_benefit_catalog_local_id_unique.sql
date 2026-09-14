-- Fix upsert benefit_catalog : ON CONFLICT (local_id) exige un index UNIQUE non partiel.
-- L'index partiel (WHERE local_id IS NOT NULL) n'est pas utilisable par PostgREST onConflict.

DROP INDEX IF EXISTS public.idx_benefit_catalog_local_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_benefit_catalog_local_id
  ON public.benefit_catalog (local_id);
