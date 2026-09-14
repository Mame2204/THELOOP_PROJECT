-- Octrois rôle admin + colonnes notifications manquantes sur certains projets

ALTER TABLE public.prime_benefit_grants
  DROP CONSTRAINT IF EXISTS prime_benefit_grants_role_entitlement_check;

ALTER TABLE public.prime_benefit_grants
  ADD CONSTRAINT prime_benefit_grants_role_entitlement_check
  CHECK (role_entitlement IS NULL OR role_entitlement IN ('member', 'prime', 'admin'));

COMMENT ON COLUMN public.prime_benefit_grants.role_entitlement IS
  'Origine rôle automatique : member, prime ou admin (équipe). NULL = octroi manuel.';

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'individual';

ALTER TABLE public.user_notifications
  ADD COLUMN IF NOT EXISTS recipient_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_user_notifications_phone
  ON public.user_notifications (recipient_phone, sent_at DESC)
  WHERE recipient_phone IS NOT NULL;
