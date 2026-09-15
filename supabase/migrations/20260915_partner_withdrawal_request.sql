-- Demande de retrait contenu partenaire (publié → retrait admin)

ALTER TABLE public.partner_event_submissions
  DROP CONSTRAINT IF EXISTS partner_event_submissions_status_check;

ALTER TABLE public.partner_event_submissions
  ADD CONSTRAINT partner_event_submissions_status_check
  CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'withdrawal_requested'));

ALTER TABLE public.partner_spot_submissions
  DROP CONSTRAINT IF EXISTS partner_spot_submissions_status_check;

ALTER TABLE public.partner_spot_submissions
  ADD CONSTRAINT partner_spot_submissions_status_check
  CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'withdrawal_requested'));

COMMENT ON COLUMN public.partner_event_submissions.status IS
  'withdrawal_requested = le partenaire demande le retrait d''un contenu publié.';

COMMENT ON COLUMN public.partner_spot_submissions.status IS
  'withdrawal_requested = le partenaire demande le retrait d''un contenu publié.';
