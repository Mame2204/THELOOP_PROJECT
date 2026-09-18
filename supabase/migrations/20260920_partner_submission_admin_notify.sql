-- Soumission partenaire (événement / spot / outil) : inbox admin + push depuis la session partenaire.
-- Même modèle que notify_admins_for_partnership_request (SECURITY DEFINER, pas is_admin()).

CREATE OR REPLACE FUNCTION public.notify_admins_for_partner_submission(
  p_kind TEXT DEFAULT 'event',
  p_title TEXT DEFAULT NULL,
  p_partner_name TEXT DEFAULT NULL,
  p_country_code TEXT DEFAULT NULL,
  p_local_id TEXT DEFAULT NULL,
  p_notif_title TEXT DEFAULT NULL,
  p_message_override TEXT DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_kind TEXT := lower(trim(COALESCE(p_kind, 'event')));
  v_kind_label TEXT;
  v_title TEXT := COALESCE(NULLIF(trim(p_title), ''), 'Sans titre');
  v_partner TEXT := COALESCE(NULLIF(trim(p_partner_name), ''), 'Partenaire');
  v_country TEXT := NULLIF(upper(trim(COALESCE(p_country_code, ''))), '');
  v_notif_title TEXT := COALESCE(NULLIF(trim(p_notif_title), ''), 'Contenu à modérer');
  v_message TEXT;
  v_ids UUID[];
  v_has_campaign BOOLEAN := FALSE;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT u.user_role INTO v_role
  FROM public.users u
  WHERE u.id = v_uid
  LIMIT 1;

  IF NOT (
    public.is_admin()
    OR v_role IN ('partner', 'tool_partner')
  ) THEN
    RAISE EXCEPTION 'Réservé aux partenaires ou administrateurs';
  END IF;

  IF p_message_override IS NULL AND p_local_id IS NOT NULL AND trim(p_local_id) <> '' THEN
    IF v_kind = 'event' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.partner_event_submissions s
        WHERE s.local_id = trim(p_local_id)
          AND s.partner_user_id = v_uid
          AND s.status = 'pending'
      ) THEN
        RAISE EXCEPTION 'Soumission événement introuvable ou non modérable';
      END IF;
    ELSIF v_kind <> 'withdrawal' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.partner_spot_submissions s
        WHERE s.local_id = trim(p_local_id)
          AND s.partner_user_id = v_uid
          AND s.status = 'pending'
      ) THEN
        RAISE EXCEPTION 'Soumission spot/outil introuvable ou non modérable';
      END IF;
    END IF;
  END IF;

  IF p_message_override IS NOT NULL AND trim(p_message_override) <> '' THEN
    v_message := trim(p_message_override);
  ELSE
    v_kind_label := CASE v_kind
      WHEN 'event' THEN 'événement'
      WHEN 'tool' THEN 'outil'
      ELSE 'spot'
    END;
    v_message := v_partner || ' a soumis un ' || v_kind_label || ' : « ' || v_title || ' ». Consultez Modération.';
  END IF;

  SELECT COALESCE(array_agg(u.id), ARRAY[]::UUID[])
  INTO v_ids
  FROM public.users u
  WHERE COALESCE(u.is_active, TRUE) = TRUE
    AND u.user_role IN ('admin', 'super_admin')
    AND (
      v_country IS NULL
      OR u.country_code IS NULL
      OR upper(trim(u.country_code)) = v_country
    );

  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
    RETURN ARRAY[]::UUID[];
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_notifications'
      AND column_name = 'campaign_id'
  ) INTO v_has_campaign;

  IF v_has_campaign THEN
    INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at, campaign_id)
    SELECT x, v_notif_title, v_message, 'admin', NOW(), NULL
    FROM unnest(v_ids) AS x;
  ELSE
    INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at)
    SELECT x, v_notif_title, v_message, 'admin', NOW()
    FROM unnest(v_ids) AS x;
  END IF;

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_admins_for_partner_submission(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_admins_for_partner_submission(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.notify_admins_for_partner_submission IS
  'Inbox admin pour soumission partenaire pending (appel depuis session partenaire). Retourne les UUID pour push Expo.';
