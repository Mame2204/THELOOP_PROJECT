-- Admin : publication directe dans events / establishments (pas partner_*_submissions).
CREATE OR REPLACE FUNCTION public.admin_create_event_direct(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_category_id INT;
  v_location_id INT;
  v_establishment_id UUID;
  v_event_id UUID;
  v_starts TIMESTAMPTZ;
  v_ends TIMESTAMPTZ;
  v_status TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  v_category_id := public.resolve_event_category_id(COALESCE(p_payload->>'category', 'corporate'));
  v_location_id := public.resolve_location_id(
    COALESCE(NULLIF(trim(p_payload->>'venue_address'), ''), NULLIF(trim(p_payload->>'venue_name'), ''), 'Conakry'),
    'Conakry',
    'Guinée'
  );

  v_establishment_id := NULL;
  IF p_payload->>'spot_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_establishment_id := (p_payload->>'spot_id')::uuid;
  END IF;

  v_starts := COALESCE((p_payload->>'starts_at')::timestamptz, NOW());
  v_ends := COALESCE((p_payload->>'ends_at')::timestamptz, v_starts + INTERVAL '3 hours');
  v_status := CASE WHEN COALESCE(p_payload->>'content_status', 'published') = 'draft' THEN 'draft' ELSE 'published' END;

  INSERT INTO public.events (
    title,
    category_id,
    description,
    banner_url,
    organizer_id,
    master_id,
    organizer_name,
    is_external_location,
    establishment_id,
    custom_location_name,
    location_id,
    start_date,
    end_date,
    is_free,
    ticket_price,
    action_link,
    country_code,
    content_status,
    is_active
  ) VALUES (
    COALESCE(p_payload->>'title', 'Sans titre'),
    v_category_id,
    COALESCE(p_payload->>'description', ''),
    p_payload->>'cover_image_url',
    v_admin_id,
    v_admin_id,
    p_payload->>'organizer_name',
    v_establishment_id IS NULL,
    v_establishment_id,
    CASE WHEN v_establishment_id IS NULL THEN COALESCE(p_payload->>'venue_name', 'Lieu') ELSE NULL END,
    v_location_id,
    v_starts,
    v_ends,
    COALESCE((p_payload->>'entry_price')::numeric, 0) = 0,
    NULLIF((p_payload->>'entry_price')::numeric, 0),
    COALESCE(p_payload->>'info_url', p_payload->>'website_url'),
    COALESCE(p_payload->>'country_code', 'GN'),
    v_status,
    TRUE
  )
  RETURNING id INTO v_event_id;

  IF p_payload->>'program' IS NOT NULL AND trim(p_payload->>'program') <> '' THEN
    INSERT INTO public.event_schedules (event_id, time_label, activity_title, order_index)
    VALUES (v_event_id, 'Programme', left(p_payload->>'program', 255), 1);
  END IF;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_establishment_direct(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_staff_id UUID;
  v_location_id INT;
  v_category_id INT;
  v_establishment_id UUID;
  v_photo TEXT;
  v_status TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  v_staff_id := public.ensure_partner_staff(v_admin_id);
  v_location_id := public.resolve_location_id(
    COALESCE(NULLIF(trim(p_payload->>'district'), ''), 'Conakry'),
    'Conakry',
    'Guinée'
  );
  v_category_id := public.resolve_establishment_category_id(COALESCE(p_payload->>'sub_category', 'fine_dining'));
  v_status := CASE WHEN COALESCE(p_payload->>'content_status', 'published') = 'draft' THEN 'draft' ELSE 'published' END;

  INSERT INTO public.establishments (
    master_id,
    name,
    category_id,
    description,
    price_indicator,
    phone_contact,
    action_link,
    location_id,
    country_code,
    content_status,
    is_active
  ) VALUES (
    v_staff_id,
    COALESCE(p_payload->>'name', 'Sans nom'),
    v_category_id,
    COALESCE(p_payload->>'description', ''),
    COALESCE(NULLIF(p_payload->>'price_label', ''), '€€'),
    COALESCE(NULLIF(p_payload->>'phone', ''), 'non_renseigne'),
    COALESCE(p_payload->>'cta_url', p_payload->>'website'),
    v_location_id,
    COALESCE(p_payload->>'country_code', 'GN'),
    v_status,
    TRUE
  )
  RETURNING id INTO v_establishment_id;

  v_photo := COALESCE(p_payload->>'cover_image_url', p_payload->>'logo_url');
  IF v_photo IS NOT NULL AND v_photo <> '' THEN
    INSERT INTO public.establishment_photos (establishment_id, photo_url, is_primary)
    VALUES (v_establishment_id, v_photo, TRUE);
  END IF;

  IF p_payload->'gallery_images' IS NOT NULL THEN
    FOR v_photo IN SELECT jsonb_array_elements_text(p_payload->'gallery_images') LOOP
      IF v_photo IS NOT NULL AND v_photo <> '' AND v_photo <> COALESCE(p_payload->>'cover_image_url', p_payload->>'logo_url', '') THEN
        INSERT INTO public.establishment_photos (establishment_id, photo_url, is_primary)
        VALUES (v_establishment_id, v_photo, FALSE);
      END IF;
    END LOOP;
  END IF;

  RETURN v_establishment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_event_direct(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_establishment_direct(JSONB) TO authenticated;
