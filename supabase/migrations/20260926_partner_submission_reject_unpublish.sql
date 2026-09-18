-- THE LOOP — Rejet modération : dépublie le catalogue + garde publish événement

CREATE OR REPLACE FUNCTION public.reject_partner_event_submission(
  p_local_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.partner_event_submissions%ROWTYPE;
  v_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Refusé par l''admin');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT * INTO s
  FROM public.partner_event_submissions
  WHERE local_id = p_local_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission événement introuvable: %', p_local_id;
  END IF;

  IF s.published_event_id IS NOT NULL THEN
    DELETE FROM public.events WHERE id = s.published_event_id;
  END IF;

  UPDATE public.partner_event_submissions
  SET
    status = 'rejected',
    rejection_reason = v_reason,
    published_event_id = NULL,
    updated_at = NOW()
  WHERE local_id = p_local_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_partner_spot_submission(
  p_local_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.partner_spot_submissions%ROWTYPE;
  v_reason TEXT := COALESCE(NULLIF(trim(p_reason), ''), 'Refusé par l''admin');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT * INTO s
  FROM public.partner_spot_submissions
  WHERE local_id = p_local_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission spot introuvable: %', p_local_id;
  END IF;

  IF s.published_tool_id IS NOT NULL THEN
    DELETE FROM public.tools WHERE id = s.published_tool_id;
  ELSIF s.published_establishment_id IS NOT NULL THEN
    DELETE FROM public.establishments WHERE id = s.published_establishment_id;
  END IF;

  UPDATE public.partner_spot_submissions
  SET
    status = 'rejected',
    rejection_reason = v_reason,
    published_tool_id = NULL,
    published_establishment_id = NULL,
    updated_at = NOW()
  WHERE local_id = p_local_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_partner_event_submission(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_partner_event_submission(TEXT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reject_partner_spot_submission(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_partner_spot_submission(TEXT, TEXT) TO authenticated, service_role;

-- Garde-fous publish événement (aligné spots)
CREATE OR REPLACE FUNCTION public.publish_partner_event_submission(p_local_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.partner_event_submissions%ROWTYPE;
  v_slugs TEXT[];
  v_location_id INT;
  v_neighborhood TEXT;
  v_owner_id UUID;
  v_establishment_id UUID;
  v_event_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT * INTO s
  FROM public.partner_event_submissions
  WHERE local_id = p_local_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission événement introuvable: %', p_local_id;
  END IF;

  IF s.status = 'rejected' THEN
    RAISE EXCEPTION 'Soumission refusée: %', p_local_id;
  END IF;

  IF s.published_event_id IS NOT NULL THEN
    PERFORM public.sync_event_speakers_core(s.published_event_id, COALESCE(s.speakers, '[]'::jsonb));
    RETURN s.published_event_id;
  END IF;

  IF s.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'Soumission non modérable (statut=%): %', s.status, p_local_id;
  END IF;

  v_owner_id := COALESCE(s.partner_user_id, s.master_user_id);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'partner_user_id manquant pour %', p_local_id;
  END IF;

  v_slugs := public.normalize_content_category_slugs(
    'event',
    CASE
      WHEN s.category_slugs IS NOT NULL AND array_length(s.category_slugs, 1) > 0 THEN s.category_slugs
      ELSE ARRAY[s.category]
    END,
    'corporate'
  );

  v_neighborhood := public.resolve_submission_neighborhood(
    s.venue_address,
    s.venue_location,
    s.guinea_location_id
  );
  v_location_id := public.resolve_location_id(
    COALESCE(v_neighborhood, s.venue_address, s.venue_name, 'Conakry'),
    'Conakry',
    'Guinée'
  );

  v_establishment_id := NULL;
  IF s.spot_id IS NOT NULL AND s.spot_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_establishment_id := s.spot_id::uuid;
  END IF;

  INSERT INTO public.events (
    title,
    category_slugs,
    description,
    banner_url,
    gallery_images,
    organizer_id,
    master_id,
    organizer_name,
    is_external_location,
    establishment_id,
    custom_location_name,
    location_id,
    guinea_location_id,
    venue_location,
    start_date,
    end_date,
    is_free,
    is_invitation_only,
    ticket_price,
    action_link,
    website_url,
    instagram_url,
    facebook_url,
    country_code,
    content_origin,
    content_status,
    is_active
  ) VALUES (
    s.title,
    v_slugs,
    COALESCE(s.description, ''),
    s.cover_image_url,
    COALESCE(s.gallery_images, '[]'::jsonb),
    v_owner_id,
    COALESCE(s.master_user_id, s.partner_user_id),
    s.organizer_name,
    v_establishment_id IS NULL,
    v_establishment_id,
    CASE WHEN v_establishment_id IS NULL THEN s.venue_name ELSE NULL END,
    v_location_id,
    s.guinea_location_id,
    s.venue_location,
    s.starts_at,
    COALESCE(s.ends_at, s.starts_at + INTERVAL '3 hours'),
    NOT COALESCE(s.is_invitation_only, FALSE) AND COALESCE(s.entry_price, 0) = 0,
    COALESCE(s.is_invitation_only, FALSE),
    CASE WHEN COALESCE(s.is_invitation_only, FALSE) THEN NULL ELSE NULLIF(s.entry_price, 0) END,
    COALESCE(s.info_url, s.website_url),
    s.website_url,
    s.instagram_url,
    s.facebook_url,
    COALESCE(s.country_code, 'GN'),
    COALESCE(NULLIF(trim(s.content_origin), ''), 'partner'),
    'published',
    TRUE
  )
  RETURNING id INTO v_event_id;

  IF s.program IS NOT NULL AND trim(s.program) <> '' THEN
    INSERT INTO public.event_schedules (event_id, time_label, activity_title, order_index)
    VALUES (v_event_id, 'Programme', left(s.program, 255), 1);
  END IF;

  PERFORM public.sync_event_speakers_core(v_event_id, COALESCE(s.speakers, '[]'::jsonb));

  UPDATE public.partner_event_submissions
  SET
    status = 'approved',
    published_event_id = v_event_id,
    updated_at = NOW()
  WHERE local_id = p_local_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_partner_event_submission(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_partner_event_submission(TEXT) TO authenticated, service_role;
