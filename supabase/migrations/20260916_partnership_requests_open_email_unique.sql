-- Partenariat : une demande « ouverte » par e-mail (pas de blocage après rejet / approbation).
-- Remplace d’éventuelles contraintes UNIQUE(email) trop strictes en prod.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'partnership_requests'
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) ILIKE '%email%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.partnership_requests DROP CONSTRAINT IF EXISTS %I',
      r.conname
    );
  END LOOP;
END $$;

DROP INDEX IF EXISTS partnership_requests_email_unique;
DROP INDEX IF EXISTS idx_partnership_requests_email_unique;
DROP INDEX IF EXISTS partnership_requests_one_open_email;

CREATE UNIQUE INDEX partnership_requests_one_open_email
  ON public.partnership_requests (lower(trim(email)))
  WHERE status IN ('pending', 'to_contact', 'in_discussion');

COMMENT ON INDEX public.partnership_requests_one_open_email IS
  'Une seule candidature en cours par e-mail ; nouvelle demande possible après rejet ou validation.';
