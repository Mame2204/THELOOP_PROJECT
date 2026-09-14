-- Validation modération : le contenu publié appartient au partenaire créateur
-- (partner_user_id), jamais au super admin qui valide.
-- content_origin forcé à 'partner' + content_status = published.

-- ─── Events ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.publish_partner_event_submission(p_local_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.partner_event_submissions%ROWTYPE;
  v_slugs TEXT[];
  v_category_id INT;
  v_location_id INT;
  v_owner_id UUID;
  v_establishment_id UUID;
  v_event_id UUID;
BEGIN
  SELECT * INTO s
  FROM public.partner_event_submissions
  WHERE local_id = p_local_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission événement introuvable: %', p_local_id;
  END IF;

  IF s.published_event_id IS NOT NULL THEN
    RETURN s.published_event_id;
  END IF;

  -- Propriétaire = partenaire soumissionnaire (pas l'admin qui valide)
  v_owner_id := COALESCE(s.partner_user_id, s.master_user_id);
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'partner_user_id manquant pour %', p_local_id;
  END IF;

  v_slugs := CASE
    WHEN s.category_slugs IS NOT NULL AND array_length(s.category_slugs, 1) > 0 THEN s.category_slugs
    ELSE ARRAY[s.category]
  END;
  v_category_id := public.resolve_event_category_id(v_slugs[1]);
  v_location_id := public.resolve_location_id(s.venue_address, 'Conakry', 'Guinée');

  v_establishment_id := NULL;
  IF s.spot_id IS NOT NULL AND s.spot_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_establishment_id := s.spot_id::uuid;
  END IF;

  INSERT INTO public.events (
    title,
    category_id,
    category_slugs,
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
    website_url,
    instagram_url,
    facebook_url,
    country_code,
    content_status,
    content_origin,
    is_active
  ) VALUES (
    s.title,
    v_category_id,
    v_slugs,
    COALESCE(s.description, ''),
    s.cover_image_url,
    v_owner_id,
    v_owner_id,
    COALESCE(NULLIF(trim(s.organizer_name), ''), NULLIF(trim(s.partner_name), '')),
    v_establishment_id IS NULL,
    v_establishment_id,
    CASE WHEN v_establishment_id IS NULL THEN s.venue_name ELSE NULL END,
    v_location_id,
    s.starts_at,
    COALESCE(s.ends_at, s.starts_at + INTERVAL '3 hours'),
    COALESCE(s.entry_price, 0) = 0,
    NULLIF(s.entry_price, 0),
    COALESCE(s.info_url, s.website_url),
    NULLIF(trim(s.website_url), ''),
    NULLIF(trim(s.instagram_url), ''),
    NULLIF(trim(s.facebook_url), ''),
    COALESCE(s.country_code, 'GN'),
    'published',
    'partner',
    TRUE
  )
  RETURNING id INTO v_event_id;

  IF s.program IS NOT NULL AND trim(s.program) <> '' THEN
    INSERT INTO public.event_schedules (event_id, time_label, activity_title, order_index)
    VALUES (v_event_id, 'Programme', left(s.program, 255), 1);
  END IF;

  UPDATE public.partner_event_submissions
  SET
    status = 'approved',
    published_event_id = v_event_id,
    content_origin = 'partner',
    partner_user_id = COALESCE(partner_user_id, v_owner_id),
    master_user_id = COALESCE(master_user_id, v_owner_id),
    updated_at = NOW()
  WHERE local_id = p_local_id;

  RETURN v_event_id;
END;
$$;

-- ─── Spots / Outils ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.publish_partner_spot_submission(p_local_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.partner_spot_submissions%ROWTYPE;
  v_staff_id UUID;
  v_location_id INT;
  v_slugs TEXT[];
  v_category_id INT;
  v_establishment_id UUID;
  v_tool_id UUID;
  v_photo TEXT;
  v_is_tool BOOLEAN;
BEGIN
  SELECT * INTO s
  FROM public.partner_spot_submissions
  WHERE local_id = p_local_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission introuvable: %', p_local_id;
  END IF;

  IF s.published_tool_id IS NOT NULL THEN
    RETURN s.published_tool_id;
  END IF;

  IF s.published_establishment_id IS NOT NULL THEN
    RETURN s.published_establishment_id;
  END IF;

  IF s.partner_user_id IS NULL THEN
    RAISE EXCEPTION 'partner_user_id manquant pour la soumission %', p_local_id;
  END IF;

  v_slugs := CASE
    WHEN s.category_slugs IS NOT NULL AND array_length(s.category_slugs, 1) > 0 THEN s.category_slugs
    ELSE ARRAY[s.sub_category]
  END;
  v_is_tool := (s.sub_category = 'tools') OR ('tools' = ANY (v_slugs));

  -- Staff lié au compte partenaire (pas à l'admin connecté)
  v_staff_id := public.ensure_partner_staff(s.partner_user_id);

  IF v_is_tool THEN
    INSERT INTO public.tools (
      master_id,
      name,
      description,
      tool_category,
      category_slugs,
      logo_url,
      website_url,
      action_link,
      instagram_url,
      facebook_url,
      phone_contact,
      developer,
      is_verified,
      partnership_status,
      country_code,
      content_status,
      content_origin,
      is_active
    ) VALUES (
      v_staff_id,
      s.name,
      COALESCE(s.description, ''),
      NULLIF(trim(s.tool_category), ''),
      array_remove(v_slugs, 'tools'),
      NULLIF(trim(s.logo_url), ''),
      NULLIF(trim(s.website), ''),
      NULLIF(trim(COALESCE(s.cta_url, s.website)), ''),
      NULLIF(trim(s.instagram_url), ''),
      NULLIF(trim(s.facebook_url), ''),
      NULLIF(trim(s.phone), ''),
      NULLIF(trim(COALESCE(s.developer, s.organizer_name)), ''),
      COALESCE(s.is_verified, FALSE),
      NULLIF(trim(s.partnership_status), ''),
      COALESCE(s.country_code, 'GN'),
      'published',
      'partner',
      TRUE
    )
    RETURNING id INTO v_tool_id;

    v_photo := COALESCE(s.cover_image_url, s.logo_url);
    IF v_photo IS NOT NULL AND v_photo <> '' THEN
      INSERT INTO public.tool_photos (tool_id, photo_url, is_primary)
      VALUES (v_tool_id, v_photo, TRUE);
    END IF;

    IF s.gallery_images IS NOT NULL THEN
      FOR v_photo IN SELECT jsonb_array_elements_text(s.gallery_images)
      LOOP
        IF v_photo IS NOT NULL AND v_photo <> '' THEN
          INSERT INTO public.tool_photos (tool_id, photo_url, is_primary)
          VALUES (v_tool_id, v_photo, FALSE);
        END IF;
      END LOOP;
    END IF;

    UPDATE public.partner_spot_submissions
    SET
      status = 'approved',
      published_tool_id = v_tool_id,
      published_establishment_id = NULL,
      content_origin = 'partner',
      updated_at = NOW()
    WHERE local_id = p_local_id;

    RETURN v_tool_id;
  END IF;

  v_location_id := public.resolve_location_id(s.district, 'Conakry', 'Guinée');
  v_category_id := public.resolve_establishment_category_id(v_slugs[1]);

  INSERT INTO public.establishments (
    master_id,
    name,
    category_id,
    category_slugs,
    description,
    price_indicator,
    phone_contact,
    action_link,
    website_url,
    instagram_url,
    facebook_url,
    location_id,
    country_code,
    opening_hours_label,
    content_status,
    content_origin,
    is_active
  ) VALUES (
    v_staff_id,
    s.name,
    v_category_id,
    v_slugs,
    COALESCE(s.description, ''),
    COALESCE(NULLIF(s.price_label, ''), '€€'),
    COALESCE(NULLIF(s.phone, ''), 'non_renseigne'),
    NULLIF(trim(COALESCE(s.cta_url, s.website)), ''),
    NULLIF(trim(s.website), ''),
    NULLIF(trim(s.instagram_url), ''),
    NULLIF(trim(s.facebook_url), ''),
    v_location_id,
    COALESCE(s.country_code, 'GN'),
    NULLIF(trim(s.opening_hours), ''),
    'published',
    'partner',
    TRUE
  )
  RETURNING id INTO v_establishment_id;

  v_photo := COALESCE(s.cover_image_url, s.logo_url);
  IF v_photo IS NOT NULL AND v_photo <> '' THEN
    INSERT INTO public.establishment_photos (establishment_id, photo_url, is_primary)
    VALUES (v_establishment_id, v_photo, TRUE);
  END IF;

  IF s.gallery_images IS NOT NULL THEN
    FOR v_photo IN SELECT jsonb_array_elements_text(s.gallery_images)
    LOOP
      IF v_photo IS NOT NULL AND v_photo <> '' THEN
        INSERT INTO public.establishment_photos (establishment_id, photo_url, is_primary)
        VALUES (v_establishment_id, v_photo, FALSE);
      END IF;
    END LOOP;
  END IF;

  UPDATE public.partner_spot_submissions
  SET
    status = 'approved',
    published_establishment_id = v_establishment_id,
    content_origin = 'partner',
    updated_at = NOW()
  WHERE local_id = p_local_id;

  RETURN v_establishment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_partner_event_submission(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_partner_spot_submission(TEXT) TO authenticated;
