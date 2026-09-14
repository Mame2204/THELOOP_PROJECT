-- Monitoring admin : dernière activité + détails Djomy sur payment_intents

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.last_seen_at IS
  'Dernière activité app (session valide) — pour détecter les comptes inactifs.';

ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS djomy_status TEXT,
  ADD COLUMN IF NOT EXISTS djomy_provider_reference TEXT,
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_webhook_event TEXT,
  ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMPTZ;

COMMENT ON COLUMN public.payment_intents.djomy_status IS
  'Dernier statut renvoyé par Djomy verify (SUCCESS, FAILED, PENDING…).';
COMMENT ON COLUMN public.payment_intents.djomy_provider_reference IS
  'Référence opérateur (OM/MOMO…) si fournie par Djomy.';
COMMENT ON COLUMN public.payment_intents.last_checked_at IS
  'Horodatage du dernier verify / reconcile serveur.';
COMMENT ON COLUMN public.payment_intents.last_webhook_event IS
  'Dernier eventType webhook reçu (payment.success, payment.failed…).';
COMMENT ON COLUMN public.payment_intents.last_webhook_at IS
  'Horodatage du dernier webhook Djomy reçu pour cet intent.';
