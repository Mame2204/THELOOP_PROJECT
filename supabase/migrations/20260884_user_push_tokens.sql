-- Tokens Expo Push pour notifications système (arrière-plan / app fermée).
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  expo_push_token text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web', 'unknown')),
  device_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_push_tokens_token_unique UNIQUE (expo_push_token)
);

CREATE INDEX IF NOT EXISTS user_push_tokens_user_id_idx
  ON public.user_push_tokens (user_id);

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_push_tokens_select_own ON public.user_push_tokens;
CREATE POLICY user_push_tokens_select_own
  ON public.user_push_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_push_tokens_insert_own ON public.user_push_tokens;
CREATE POLICY user_push_tokens_insert_own
  ON public.user_push_tokens
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_push_tokens_update_own ON public.user_push_tokens;
CREATE POLICY user_push_tokens_update_own
  ON public.user_push_tokens
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_push_tokens_delete_own ON public.user_push_tokens;
CREATE POLICY user_push_tokens_delete_own
  ON public.user_push_tokens
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Service role (Edge Function) lit tous les tokens.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_tokens TO authenticated;

COMMENT ON TABLE public.user_push_tokens IS
  'Tokens Expo Push (ExponentPushToken[…]) pour alertes OS hors premier plan.';
