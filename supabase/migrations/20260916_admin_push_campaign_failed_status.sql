-- Statut failed pour campagnes push (cron serveur + admin-web).
ALTER TABLE public.admin_push_campaigns
  DROP CONSTRAINT IF EXISTS admin_push_campaigns_status_check;

ALTER TABLE public.admin_push_campaigns
  ADD CONSTRAINT admin_push_campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'sent', 'cancelled', 'failed'));

COMMENT ON COLUMN public.admin_push_campaigns.status IS
  'draft | scheduled | sent | cancelled | failed (échec distribution ou push)';
