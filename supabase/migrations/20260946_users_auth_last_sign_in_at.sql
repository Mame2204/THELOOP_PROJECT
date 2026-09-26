-- Miroir du last_sign_in_at Auth sur public.users (liste admin sans lecture auth.users).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS auth_last_sign_in_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.auth_last_sign_in_at IS
  'Dernière connexion Auth (copiée depuis session.user.last_sign_in_at à l’ouverture de session app / admin-web).';
