-- Décision modération admin → inbox partenaire (+ push Expo côté app).
-- Même modèle que notify_admins_for_partner_submission : SECURITY DEFINER, appel admin.

CREATE OR REPLACE FUNCTION public.notify_partner_user(
  p_partner_user_id UUID DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_message TEXT DEFAULT NULL,
  p_audience TEXT DEFAULT 'partner',
  p_local_id TEXT DEFAULT NULL,
  p_submission_kind TEXT DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner UUID;
  v_kind TEXT := lower(trim(COALESCE(p_submission_kind, '')));
  v_title TEXT := COALESCE(NULLIF(trim(p_title), ''), 'THE LOOP');
  v_message TEXT := COALESCE(p_message, '');
  v_audience TEXT := COALESCE(NULLIF(trim(p_audience), ''), 'partner');
  v_has_campaign BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Réservé aux administrateurs';
  END IF;

  IF p_local_id IS NOT NULL AND trim(p_local_id) <> '' THEN
    IF v_kind = 'event' THEN
      SELECT s.partner_user_id INTO v_partner
      FROM public.partner_event_submissions s
      WHERE s.local_id = trim(p_local_id)
      LIMIT 1;
    ELSE
      SELECT s.partner_user_id INTO v_partner
      FROM public.partner_spot_submissions s
      WHERE s.local_id = trim(p_local_id)
      LIMIT 1;
    END IF;
  END IF;

  IF v_partner IS NULL AND p_partner_user_id IS NOT NULL THEN
    v_partner := p_partner_user_id;
  END IF;

  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Partenaire introuvable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = v_partner
      AND COALESCE(u.is_active, TRUE) = TRUE
      AND u.user_role IN ('partner', 'tool_partner')
  ) THEN
    RAISE EXCEPTION 'Compte partenaire invalide';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_notifications'
      AND column_name = 'campaign_id'
  ) INTO v_has_campaign;

  IF v_has_campaign THEN
    INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at, campaign_id)
    VALUES (v_partner, v_title, v_message, v_audience, NOW(), NULL);
  ELSE
    INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at)
    VALUES (v_partner, v_title, v_message, v_audience, NOW());
  END IF;

  RETURN ARRAY[v_partner];
END;
$$;

REVOKE ALL ON FUNCTION public.notify_partner_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_partner_user(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.notify_partner_user IS
  'Inbox partenaire pour décision modération admin. Retourne [partner_user_id] pour push Expo.';
