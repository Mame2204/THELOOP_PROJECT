-- Outils partenaire : même circuit de modération que spots / events.
-- 1) upsert force sub_category = 'tools' quand c'est un outil
-- 2) publish réservé aux admins (plus d'auto-publication côté partenaire)

CREATE OR REPLACE FUNCTION public.upsert_partner_spot_submission(
  p_local_id TEXT,
  p_partner_user_id UUID,
  p_partner_name TEXT,
  p_payload JSONB,
  p_status TEXT DEFAULT 'pending'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_slugs TEXT[];
  v_sub TEXT;
  v_is_tool BOOLEAN;
  v_status TEXT;
  v_origin TEXT;
BEGIN
  v_slugs := public.extract_category_slugs(p_payload, 'sub_category', 'fine_dining');
  v_sub := COALESCE(NULLIF(trim(p_payload->>'sub_category'), ''), v_slugs[1], 'fine_dining');
  v_is_tool :=
    (v_sub = 'tools')
    OR ('tools' = ANY (v_slugs))
    OR (NULLIF(trim(p_payload->>'tool_category'), '') IS NOT NULL);

  IF v_is_tool THEN
    v_sub := 'tools';
    IF v_slugs IS NULL OR array_length(v_slugs, 1) IS NULL OR NOT ('tools' = ANY (v_slugs)) THEN
      v_slugs := ARRAY['tools'] || COALESCE(v_slugs, ARRAY[]::TEXT[]);
    END IF;
  END IF;

  -- Jamais d'auto-publication : le partenaire ne peut soumettre que draft / pending / rejected
  v_status := COALESCE(NULLIF(trim(p_status), ''), 'pending');
  IF v_status NOT IN ('draft', 'pending', 'rejected') THEN
    v_status := 'pending';
  END IF;

  v_origin := COALESCE(NULLIF(trim(p_payload->>'content_origin'), ''), 'partner');
  IF v_origin NOT IN ('admin', 'loop', 'partner') THEN
    v_origin := 'partner';
  END IF;

  INSERT INTO public.partner_spot_submissions (
    local_id,
    partner_user_id,
    partner_name,
    name,
    description,
    address,
    district,
    sub_category,
    category_slugs,
    phone,
    website,
    logo_url,
    cover_image_url,
    gallery_images,
    opening_hours,
    price_label,
    instagram_url,
    facebook_url,
    cta_url,
    organizer_name,
    country_code,
    tool_category,
    developer,
    is_verified,
    partnership_status,
    content_origin,
    status,
    updated_at
  ) VALUES (
    p_local_id,
    p_partner_user_id,
    p_partner_name,
    COALESCE(p_payload->>'name', 'Sans nom'),
    COALESCE(p_payload->>'description', ''),
    COALESCE(p_payload->>'address', ''),
    p_payload->>'district',
    v_sub,
    v_slugs,
    p_payload->>'phone',
    p_payload->>'website',
    p_payload->>'logo_url',
    p_payload->>'cover_image_url',
    COALESCE(p_payload->'gallery_images', '[]'::jsonb),
    p_payload->>'opening_hours',
    p_payload->>'price_label',
    p_payload->>'instagram_url',
    p_payload->>'facebook_url',
    p_payload->>'cta_url',
    p_payload->>'organizer_name',
    COALESCE(p_payload->>'country_code', 'GN'),
    p_payload->>'tool_category',
    p_payload->>'developer',
    COALESCE((p_payload->>'is_verified')::boolean, FALSE),
    p_payload->>'partnership_status',
    v_origin,
    v_status,
    NOW()
  )
  ON CONFLICT (local_id) DO UPDATE SET
    partner_name = EXCLUDED.partner_name,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    address = EXCLUDED.address,
    district = EXCLUDED.district,
    sub_category = EXCLUDED.sub_category,
    category_slugs = EXCLUDED.category_slugs,
    phone = EXCLUDED.phone,
    website = EXCLUDED.website,
    logo_url = EXCLUDED.logo_url,
    cover_image_url = EXCLUDED.cover_image_url,
    gallery_images = EXCLUDED.gallery_images,
    opening_hours = EXCLUDED.opening_hours,
    price_label = EXCLUDED.price_label,
    instagram_url = EXCLUDED.instagram_url,
    facebook_url = EXCLUDED.facebook_url,
    cta_url = EXCLUDED.cta_url,
    organizer_name = EXCLUDED.organizer_name,
    country_code = EXCLUDED.country_code,
    tool_category = EXCLUDED.tool_category,
    developer = EXCLUDED.developer,
    is_verified = EXCLUDED.is_verified,
    partnership_status = EXCLUDED.partnership_status,
    content_origin = EXCLUDED.content_origin,
    -- Ne pas écraser un statut déjà publié côté serveur
    status = CASE
      WHEN partner_spot_submissions.status = 'approved' THEN partner_spot_submissions.status
      ELSE EXCLUDED.status
    END,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Publication = modération admin uniquement
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
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

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

  IF s.status NOT IN ('pending', 'approved') THEN
    RAISE EXCEPTION 'Soumission non modérable (statut=%): %', s.status, p_local_id;
  END IF;

  IF s.partner_user_id IS NULL THEN
    RAISE EXCEPTION 'partner_user_id manquant pour la soumission %', p_local_id;
  END IF;

  v_slugs := CASE
    WHEN s.category_slugs IS NOT NULL AND array_length(s.category_slugs, 1) > 0 THEN s.category_slugs
    ELSE ARRAY[s.sub_category]
  END;
  v_is_tool := (s.sub_category = 'tools')
    OR ('tools' = ANY (v_slugs))
    OR (NULLIF(trim(s.tool_category), '') IS NOT NULL);

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
      sub_category = 'tools',
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

GRANT EXECUTE ON FUNCTION public.upsert_partner_spot_submission(TEXT, UUID, TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_partner_spot_submission(TEXT) TO authenticated;

-- Reclasser les soumissions outils mal étiquetées (encore en attente)
UPDATE public.partner_spot_submissions
SET
  sub_category = 'tools',
  category_slugs = CASE
    WHEN category_slugs IS NULL OR category_slugs = '{}' THEN ARRAY['tools']
    WHEN 'tools' = ANY (category_slugs) THEN category_slugs
    ELSE array_prepend('tools', category_slugs)
  END,
  updated_at = NOW()
WHERE status IN ('draft', 'pending', 'rejected')
  AND published_establishment_id IS NULL
  AND published_tool_id IS NULL
  AND (
    sub_category = 'tools'
    OR NULLIF(trim(tool_category), '') IS NOT NULL
    OR (category_slugs IS NOT NULL AND 'tools' = ANY (category_slugs))
  );
