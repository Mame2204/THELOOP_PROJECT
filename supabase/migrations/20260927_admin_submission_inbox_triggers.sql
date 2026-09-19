-- THE LOOP — Inbox admin générée côté serveur pour toute soumission partenaire.
-- Remplace l'insert client (fragile : session partenaire, kind, local_id) par des triggers
-- sur partner_event_submissions / partner_spot_submissions.
-- Couvre : soumission, resoumission après refus, demande de retrait après publication.

CREATE OR REPLACE FUNCTION public.admin_inbox_broadcast(
  p_notif_title TEXT,
  p_message TEXT,
  p_country_code TEXT DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country TEXT := NULLIF(upper(trim(COALESCE(p_country_code, ''))), '');
  v_title TEXT := COALESCE(NULLIF(trim(p_notif_title), ''), 'Notification');
  v_message TEXT := COALESCE(NULLIF(trim(p_message), ''), v_title);
  v_ids UUID[];
  v_has_campaign BOOLEAN := FALSE;
BEGIN
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

  -- Anti-doublon : même message au même admin dans les 2 dernières minutes.
  IF v_has_campaign THEN
    INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at, campaign_id)
    SELECT x, v_title, v_message, 'admin', NOW(), NULL
    FROM unnest(v_ids) AS x
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_notifications n
      WHERE n.user_id = x
        AND n.title = v_title
        AND n.message = v_message
        AND n.sent_at > NOW() - INTERVAL '2 minutes'
    );
  ELSE
    INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at)
    SELECT x, v_title, v_message, 'admin', NOW()
    FROM unnest(v_ids) AS x
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_notifications n
      WHERE n.user_id = x
        AND n.title = v_title
        AND n.message = v_message
        AND n.sent_at > NOW() - INTERVAL '2 minutes'
    );
  END IF;

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_inbox_broadcast(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_inbox_broadcast(TEXT, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_partner_event_submission_admin_inbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner TEXT := COALESCE(NULLIF(trim(NEW.partner_name), ''), 'Partenaire');
  v_title TEXT := COALESCE(NULLIF(trim(NEW.title), ''), 'Sans titre');
  v_notif_title TEXT;
  v_message TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'withdrawal_requested' THEN
    v_notif_title := 'Demande de retrait';
    v_message := v_partner || ' demande le retrait de l''événement publié « ' || v_title
      || ' ». Consultez Modération › Demandes de retrait.';
  ELSIF NEW.status = 'pending' THEN
    IF TG_OP = 'UPDATE' AND OLD.status = 'rejected' THEN
      v_notif_title := 'Contenu resoumis';
      v_message := v_partner || ' a resoumis l''événement « ' || v_title || ' ». Consultez Modération.';
    ELSE
      v_notif_title := 'Contenu à modérer';
      v_message := v_partner || ' a soumis un événement : « ' || v_title || ' ». Consultez Modération.';
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.admin_inbox_broadcast(v_notif_title, v_message, NEW.country_code);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_partner_spot_submission_admin_inbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner TEXT := COALESCE(NULLIF(trim(NEW.partner_name), ''), 'Partenaire');
  v_title TEXT := COALESCE(NULLIF(trim(NEW.name), ''), 'Sans titre');
  v_kind_label TEXT := CASE WHEN NEW.sub_category = 'tools' THEN 'outil' ELSE 'spot' END;
  v_notif_title TEXT;
  v_message TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'withdrawal_requested' THEN
    v_notif_title := 'Demande de retrait';
    v_message := v_partner || ' demande le retrait de l''' || v_kind_label || ' publié « ' || v_title
      || ' ». Consultez Modération › Demandes de retrait.';
  ELSIF NEW.status = 'pending' THEN
    IF TG_OP = 'UPDATE' AND OLD.status = 'rejected' THEN
      v_notif_title := 'Contenu resoumis';
      v_message := v_partner || ' a resoumis l''' || v_kind_label || ' « ' || v_title || ' ». Consultez Modération.';
    ELSE
      v_notif_title := 'Contenu à modérer';
      v_message := v_partner || ' a soumis un ' || v_kind_label || ' : « ' || v_title || ' ». Consultez Modération.';
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.admin_inbox_broadcast(v_notif_title, v_message, NEW.country_code);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_event_submission_admin_inbox ON public.partner_event_submissions;
CREATE TRIGGER partner_event_submission_admin_inbox
AFTER INSERT OR UPDATE OF status ON public.partner_event_submissions
FOR EACH ROW
EXECUTE FUNCTION public.tg_partner_event_submission_admin_inbox();

DROP TRIGGER IF EXISTS partner_spot_submission_admin_inbox ON public.partner_spot_submissions;
CREATE TRIGGER partner_spot_submission_admin_inbox
AFTER INSERT OR UPDATE OF status ON public.partner_spot_submissions
FOR EACH ROW
EXECUTE FUNCTION public.tg_partner_spot_submission_admin_inbox();

-- Garde-fou : un contenu déjà publié ne peut pas retomber en « en attente »
-- (resync client avec un staging local périmé = soumission fantôme invisible en modération).
CREATE OR REPLACE FUNCTION public.tg_partner_event_submission_keep_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' AND NEW.published_event_id IS NOT NULL THEN
    NEW.status := 'approved';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_partner_spot_submission_keep_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending'
    AND (NEW.published_establishment_id IS NOT NULL OR NEW.published_tool_id IS NOT NULL)
  THEN
    NEW.status := 'approved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_event_submission_keep_published ON public.partner_event_submissions;
CREATE TRIGGER partner_event_submission_keep_published
BEFORE INSERT OR UPDATE ON public.partner_event_submissions
FOR EACH ROW
EXECUTE FUNCTION public.tg_partner_event_submission_keep_published();

DROP TRIGGER IF EXISTS partner_spot_submission_keep_published ON public.partner_spot_submissions;
CREATE TRIGGER partner_spot_submission_keep_published
BEFORE INSERT OR UPDATE ON public.partner_spot_submissions
FOR EACH ROW
EXECUTE FUNCTION public.tg_partner_spot_submission_keep_published();

-- L'inbox est désormais écrite par les triggers : la RPC ne sert plus qu'à résoudre
-- les destinataires du push OS. Plus aucune exception ne doit bloquer ce chemin.
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
  v_country TEXT := NULLIF(upper(trim(COALESCE(p_country_code, ''))), '');
  v_uid UUID := auth.uid();
  v_ids UUID[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;

  SELECT u.user_role INTO v_role
  FROM public.users u
  WHERE u.id = v_uid
  LIMIT 1;

  IF NOT (public.is_admin() OR v_role IN ('partner', 'tool_partner')) THEN
    RETURN ARRAY[]::UUID[];
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

  RETURN COALESCE(v_ids, ARRAY[]::UUID[]);
END;
$$;

COMMENT ON FUNCTION public.notify_admins_for_partner_submission IS
  'Retourne les admins destinataires du push OS. L''inbox est écrite par les triggers *_admin_inbox.';
