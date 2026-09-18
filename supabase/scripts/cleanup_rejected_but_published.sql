-- THE LOOP — Nettoyage : soumissions refusées mais catalogue encore live
-- + orphelins withdrawal (complète 20260924)
-- Exécuter dans Supabase SQL Editor après migrations 20260925 + 20260926

BEGIN;

-- 1) Événements : rejected + published_event_id → supprimer le catalogue
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT local_id, published_event_id
    FROM public.partner_event_submissions
    WHERE status = 'rejected'
      AND published_event_id IS NOT NULL
  LOOP
    DELETE FROM public.events WHERE id = r.published_event_id;
    UPDATE public.partner_event_submissions
    SET published_event_id = NULL, updated_at = NOW()
    WHERE local_id = r.local_id;
  END LOOP;
END $$;

-- 2) Spots : rejected + published_establishment_id
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT local_id, published_establishment_id
    FROM public.partner_spot_submissions
    WHERE status = 'rejected'
      AND published_establishment_id IS NOT NULL
      AND COALESCE(sub_category, '') <> 'tools'
  LOOP
    DELETE FROM public.establishments WHERE id = r.published_establishment_id;
    UPDATE public.partner_spot_submissions
    SET published_establishment_id = NULL, updated_at = NOW()
    WHERE local_id = r.local_id;
  END LOOP;
END $$;

-- 3) Outils : rejected + published_tool_id
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT local_id, published_tool_id
    FROM public.partner_spot_submissions
    WHERE status = 'rejected'
      AND published_tool_id IS NOT NULL
  LOOP
    DELETE FROM public.tools WHERE id = r.published_tool_id;
    UPDATE public.partner_spot_submissions
    SET published_tool_id = NULL, updated_at = NOW()
    WHERE local_id = r.local_id;
  END LOOP;
END $$;

-- 4) Pending fantômes déjà publiés (file modération incohérente)
UPDATE public.partner_event_submissions
SET status = 'approved', updated_at = NOW()
WHERE status = 'pending'
  AND published_event_id IS NOT NULL;

UPDATE public.partner_spot_submissions
SET status = 'approved', updated_at = NOW()
WHERE status = 'pending'
  AND (published_establishment_id IS NOT NULL OR published_tool_id IS NOT NULL);

-- 5) Retraits orphelins (catalogue déjà supprimé)
DELETE FROM public.partner_event_submissions
WHERE status = 'withdrawal_requested'
  AND published_event_id IS NULL;

DELETE FROM public.partner_spot_submissions
WHERE status = 'withdrawal_requested'
  AND published_establishment_id IS NULL
  AND published_tool_id IS NULL;

COMMIT;

-- Vérification
SELECT 'rejected_with_published_event' AS check_name, count(*) AS n
FROM public.partner_event_submissions
WHERE status = 'rejected' AND published_event_id IS NOT NULL
UNION ALL
SELECT 'rejected_with_published_spot', count(*)
FROM public.partner_spot_submissions
WHERE status = 'rejected'
  AND (published_establishment_id IS NOT NULL OR published_tool_id IS NOT NULL)
UNION ALL
SELECT 'pending_with_published_event', count(*)
FROM public.partner_event_submissions
WHERE status = 'pending' AND published_event_id IS NOT NULL
UNION ALL
SELECT 'pending_with_published_spot', count(*)
FROM public.partner_spot_submissions
WHERE status = 'pending'
  AND (published_establishment_id IS NOT NULL OR published_tool_id IS NOT NULL);
