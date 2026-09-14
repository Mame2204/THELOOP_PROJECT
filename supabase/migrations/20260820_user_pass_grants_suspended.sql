-- Statut « suspended » pour PASS mis en pause lors d'un bascule admin Prime → membre
-- (date expires_at conservée — réactivation possible)

ALTER TABLE public.user_pass_grants
  DROP CONSTRAINT IF EXISTS user_pass_grants_status_check;

ALTER TABLE public.user_pass_grants
  ADD CONSTRAINT user_pass_grants_status_check
  CHECK (status IN ('active', 'expired', 'revoked', 'suspended'));

COMMENT ON COLUMN public.user_pass_grants.status IS
  'active = en cours ; suspended = pause admin (rôle membre) ; revoked/expired = terminé.';
