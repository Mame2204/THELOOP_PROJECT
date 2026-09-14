-- THE LOOP — diffusion notifications serveur (tous types) + push tokens
-- À exécuter dans Supabase → SQL Editor (une seule fois).

-- ---------------------------------------------------------------------------
-- 1) Tokens push (si migration 20260884 absente)
-- ---------------------------------------------------------------------------
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
  ON public.user_push_tokens FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_push_tokens_insert_own ON public.user_push_tokens;
CREATE POLICY user_push_tokens_insert_own
  ON public.user_push_tokens FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_push_tokens_update_own ON public.user_push_tokens;
CREATE POLICY user_push_tokens_update_own
  ON public.user_push_tokens FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_push_tokens_delete_own ON public.user_push_tokens;
CREATE POLICY user_push_tokens_delete_own
  ON public.user_push_tokens FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_tokens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_push_tokens TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) notify_user (octroi, validation, individuel, etc.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_audience TEXT DEFAULT 'individual',
  p_recipient_phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requis';
  END IF;

  SELECT user_role INTO v_role FROM public.users WHERE id = auth.uid() LIMIT 1;

  IF NOT (
    public.is_admin()
    OR auth.uid() = p_user_id
    OR v_role IN ('partner', 'admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  INSERT INTO public.user_notifications (
    user_id,
    recipient_phone,
    title,
    message,
    audience,
    sent_at
  ) VALUES (
    p_user_id,
    NULLIF(trim(COALESCE(p_recipient_phone, '')), ''),
    COALESCE(NULLIF(trim(p_title), ''), 'Notification'),
    COALESCE(p_message, ''),
    COALESCE(NULLIF(trim(p_audience), ''), 'individual'),
    NOW()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Diffusion admin côté serveur (pas de limite 15/5000 côté app)
--    Couvre : all / everyone / members / prime / prime_members / partner / admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_distribute_notifications(
  p_title TEXT,
  p_message TEXT,
  p_audience TEXT DEFAULT 'everyone',
  p_country_code TEXT DEFAULT NULL,
  p_campaign_id UUID DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audience TEXT := lower(trim(COALESCE(p_audience, 'everyone')));
  v_country TEXT := NULLIF(upper(trim(COALESCE(p_country_code, ''))), '');
  v_title TEXT := COALESCE(NULLIF(trim(p_title), ''), 'THE LOOP');
  v_message TEXT := COALESCE(p_message, '');
  v_ids UUID[];
  v_has_campaign BOOLEAN := FALSE;
BEGIN
  -- App (JWT) : admin uniquement. SQL Editor (pas de JWT) : autorisé.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF v_audience IN ('all', 'tous') THEN
    v_audience := 'everyone';
  END IF;

  -- campaign_id optionnel selon schéma
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_notifications'
      AND column_name = 'campaign_id'
  ) INTO v_has_campaign;

  SELECT COALESCE(array_agg(u.id), ARRAY[]::UUID[])
  INTO v_ids
  FROM public.users u
  WHERE COALESCE(u.is_active, TRUE) = TRUE
    AND (
      v_country IS NULL
      OR u.country_code IS NULL
      OR upper(trim(u.country_code)) = v_country
    )
    AND (
      CASE v_audience
        WHEN 'everyone' THEN u.user_role IS NOT NULL
        WHEN 'members' THEN u.user_role IN ('member')
        WHEN 'prime' THEN u.user_role IN ('prime')
        WHEN 'prime_members' THEN u.user_role IN ('member', 'prime')
        WHEN 'partner' THEN u.user_role IN ('partner', 'tool_partner')
        WHEN 'admin' THEN u.user_role IN ('admin', 'super_admin')
        ELSE u.user_role IS NOT NULL
      END
    );

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN ARRAY[]::UUID[];
  END IF;

  IF v_has_campaign AND p_campaign_id IS NOT NULL THEN
    INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at, campaign_id)
    SELECT
      x,
      v_title,
      v_message,
      v_audience,
      NOW(),
      p_campaign_id
    FROM unnest(v_ids) AS x;
  ELSE
    INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at)
    SELECT
      x,
      v_title,
      v_message,
      v_audience,
      NOW()
    FROM unnest(v_ids) AS x;
  END IF;

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_distribute_notifications(TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_distribute_notifications(TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;

COMMENT ON FUNCTION public.admin_distribute_notifications IS
  'Insère une notif inbox pour tous les users actifs ciblés (audience). Retourne les UUID pour send-push.';

-- ---------------------------------------------------------------------------
-- 4) Contrôles rapides (lecture seule — optionnel)
-- ---------------------------------------------------------------------------
-- SELECT count(*) FROM public.user_push_tokens;
-- SELECT count(*) FROM public.users WHERE COALESCE(is_active, true);
-- SELECT public.admin_distribute_notifications('Test THE LOOP', 'Ping serveur', 'everyone', 'GN', NULL);
