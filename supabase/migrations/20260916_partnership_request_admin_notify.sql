-- Partenariat : notifier tous les admins (inbox + push) depuis une candidature publique (anon).

ALTER TABLE public.partnership_requests
  ADD COLUMN IF NOT EXISTS admin_notified_at timestamptz;

COMMENT ON COLUMN public.partnership_requests.admin_notified_at IS
  'Horodatage de la diffusion inbox admin (évite les doublons push).';

CREATE OR REPLACE FUNCTION public.notify_admins_for_partnership_request(
  p_request_id UUID DEFAULT NULL,
  p_email TEXT DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.partnership_requests%ROWTYPE;
  v_ids UUID[];
  v_title TEXT := 'Nouvelle demande de partenariat';
  v_message TEXT;
  v_country TEXT;
  v_has_campaign BOOLEAN := FALSE;
BEGIN
  IF p_request_id IS NOT NULL THEN
    SELECT * INTO v_req
    FROM public.partnership_requests
    WHERE id = p_request_id;
  ELSIF NULLIF(trim(COALESCE(p_email, '')), '') IS NOT NULL THEN
    SELECT * INTO v_req
    FROM public.partnership_requests
    WHERE lower(trim(email)) = lower(trim(p_email))
      AND admin_notified_at IS NULL
      AND created_at >= (NOW() - INTERVAL '15 minutes')
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    RAISE EXCEPTION 'request_id ou email requis';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable';
  END IF;

  IF v_req.admin_notified_at IS NOT NULL THEN
    RETURN ARRAY[]::UUID[];
  END IF;

  IF v_req.created_at < (NOW() - INTERVAL '15 minutes') THEN
    RAISE EXCEPTION 'Demande trop ancienne pour notification';
  END IF;

  v_country := NULLIF(upper(trim(COALESCE(v_req.country_code, ''))), '');
  v_message := trim(
    COALESCE(NULLIF(trim(v_req.establishment_name), ''), NULLIF(trim(v_req.manager_name), ''), 'Établissement')
    || ' — '
    || COALESCE(v_req.email, '')
    || ' · '
    || COALESCE(NULLIF(trim(v_req.phone), ''), '—')
  );

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
    UPDATE public.partnership_requests
    SET admin_notified_at = NOW()
    WHERE id = v_req.id;
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
    SELECT x, v_title, v_message, 'admin', NOW(), NULL
    FROM unnest(v_ids) AS x;
  ELSE
    INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at)
    SELECT x, v_title, v_message, 'admin', NOW()
    FROM unnest(v_ids) AS x;
  END IF;

  UPDATE public.partnership_requests
  SET admin_notified_at = NOW()
  WHERE id = v_req.id;

  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_admins_for_partnership_request(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_admins_for_partnership_request(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.notify_admins_for_partnership_request(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.notify_admins_for_partnership_request IS
  'Inbox admin pour une candidature partenariat (appel public après INSERT). Retourne les UUID pour push Expo.';
