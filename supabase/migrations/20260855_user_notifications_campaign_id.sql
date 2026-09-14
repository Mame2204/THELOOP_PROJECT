-- user_notifications.campaign_id : legacy notifications_campaigns → admin_push_campaigns
--
-- Contexte Production V1.0 : campaign_id référençait notifications_campaigns.
-- L'app mobile enregistre désormais les campagnes dans admin_push_campaigns.

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS campaign_id UUID;

-- Retirer l'ancienne FK (notifications_campaigns ou autre)
ALTER TABLE public.user_notifications
  DROP CONSTRAINT IF EXISTS user_notifications_campaign_id_fkey;

-- Les UUID legacy ne correspondent pas à admin_push_campaigns
UPDATE public.user_notifications un
SET campaign_id = NULL
WHERE campaign_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_push_campaigns apc WHERE apc.id = un.campaign_id
  );

ALTER TABLE public.user_notifications
  ALTER COLUMN campaign_id DROP NOT NULL;

ALTER TABLE public.user_notifications
  ADD CONSTRAINT user_notifications_campaign_id_fkey
  FOREIGN KEY (campaign_id)
  REFERENCES public.admin_push_campaigns(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_campaign
  ON public.user_notifications (campaign_id)
  WHERE campaign_id IS NOT NULL;

COMMENT ON COLUMN public.user_notifications.campaign_id IS
  'Campagne push admin (admin_push_campaigns) à l''origine de la notification. NULL = notification système ou individuelle.';
