-- Corrige l'absence de content_origin sur partner_event_submissions
-- (RPC upsert_partner_event_submission / publish_partner_event_submission en dépendent).
-- Idempotent : safe si 20260753 a déjà été appliqué.

ALTER TABLE public.partner_event_submissions
  ADD COLUMN IF NOT EXISTS content_origin TEXT;

COMMENT ON COLUMN public.partner_event_submissions.content_origin IS
  'Canal de création : admin, loop, partner.';

UPDATE public.partner_event_submissions
SET content_origin = 'partner'
WHERE COALESCE(NULLIF(trim(content_origin), ''), '') = '';

-- Spots staging : colonne alignée si absente (utilisée par reassign / sync outil)
ALTER TABLE public.partner_spot_submissions
  ADD COLUMN IF NOT EXISTS content_origin TEXT;

COMMENT ON COLUMN public.partner_spot_submissions.content_origin IS
  'Canal de création : admin, loop, partner.';

UPDATE public.partner_spot_submissions
SET content_origin = 'partner'
WHERE COALESCE(NULLIF(trim(content_origin), ''), '') = '';
