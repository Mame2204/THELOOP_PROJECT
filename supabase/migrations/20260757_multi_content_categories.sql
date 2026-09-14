-- Catégories multiples pour événements et spots (category_id = primaire, category_slugs = toutes).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS category_slugs TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS category_slugs TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.partner_event_submissions
  ADD COLUMN IF NOT EXISTS category_slugs TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.partner_spot_submissions
  ADD COLUMN IF NOT EXISTS category_slugs TEXT[] NOT NULL DEFAULT '{}';

UPDATE public.events e
SET category_slugs = ARRAY[ec.slug]
FROM public.event_categories ec
WHERE ec.id = e.category_id
  AND (e.category_slugs IS NULL OR e.category_slugs = '{}');

UPDATE public.establishments est
SET category_slugs = ARRAY[ec.slug]
FROM public.establishment_categories ec
WHERE ec.id = est.category_id
  AND (est.category_slugs IS NULL OR est.category_slugs = '{}');

CREATE OR REPLACE FUNCTION public.extract_category_slugs(
  p_payload JSONB,
  p_single_key TEXT,
  p_fallback TEXT
)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_slugs TEXT[];
BEGIN
  IF jsonb_typeof(p_payload->'categories') = 'array' AND jsonb_array_length(p_payload->'categories') > 0 THEN
    SELECT COALESCE(array_agg(trim(both '"' from elem::text)), ARRAY[]::TEXT[])
    INTO v_slugs
    FROM jsonb_array_elements(p_payload->'categories') AS elem
    WHERE trim(both '"' from elem::text) <> '';
    IF array_length(v_slugs, 1) > 0 THEN
      RETURN v_slugs;
    END IF;
  END IF;

  IF p_payload->>p_single_key IS NOT NULL AND trim(p_payload->>p_single_key) <> '' THEN
    RETURN ARRAY[trim(p_payload->>p_single_key)];
  END IF;

  RETURN ARRAY[COALESCE(NULLIF(trim(p_fallback), ''), 'corporate')];
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_event_direct(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_slugs TEXT[];
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

  v_slugs := public.extract_category_slugs(p_payload, 'category', 'corporate');
  v_category_id := public.resolve_event_category_id(v_slugs[1]);
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
    country_code,
    content_status,
    content_origin,
    is_active
  ) VALUES (
    COALESCE(p_payload->>'title', 'Sans titre'),
    v_category_id,
    v_slugs,
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
    COALESCE(NULLIF(trim(p_payload->>'content_origin'), ''), 'admin'),
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
  v_slugs TEXT[];
  v_category_id INT;
  v_establishment_id UUID;
  v_photo TEXT;
  v_status TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  v_staff_id := public.ensure_partner_staff(v_admin_id);
  v_slugs := public.extract_category_slugs(p_payload, 'sub_category', 'fine_dining');
  v_category_id := public.resolve_establishment_category_id(v_slugs[1]);
  v_location_id := public.resolve_location_id(
    COALESCE(NULLIF(trim(p_payload->>'district'), ''), NULLIF(trim(p_payload->>'address'), ''), 'Conakry'),
    'Conakry',
    'Guinée'
  );
  v_status := CASE WHEN COALESCE(p_payload->>'content_status', 'published') = 'draft' THEN 'draft' ELSE 'published' END;

  INSERT INTO public.establishments (
    master_id,
    name,
    category_id,
    category_slugs,
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
    v_slugs,
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
    FOR v_photo IN SELECT jsonb_array_elements_text(p_payload->'gallery_images')
    LOOP
      IF v_photo IS NOT NULL AND v_photo <> '' THEN
        INSERT INTO public.establishment_photos (establishment_id, photo_url, is_primary)
        VALUES (v_establishment_id, v_photo, FALSE);
      END IF;
    END LOOP;
  END IF;

  RETURN v_establishment_id;
END;
$$;

UPDATE public.partner_event_submissions
SET category_slugs = ARRAY[category]
WHERE category_slugs IS NULL OR category_slugs = '{}';

UPDATE public.partner_spot_submissions
SET category_slugs = ARRAY[sub_category]
WHERE category_slugs IS NULL OR category_slugs = '{}';

CREATE OR REPLACE FUNCTION public.upsert_partner_event_submission(
  p_local_id TEXT,
  p_partner_user_id UUID,
  p_partner_name TEXT,
  p_master_user_id UUID,
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
BEGIN
  v_slugs := public.extract_category_slugs(p_payload, 'category', 'corporate');

  INSERT INTO public.partner_event_submissions (
    local_id,
    partner_user_id,
    partner_name,
    master_user_id,
    title,
    description,
    program,
    category,
    category_slugs,
    starts_at,
    ends_at,
    venue_name,
    venue_address,
    spot_id,
    entry_price,
    currency,
    info_url,
    instagram_url,
    facebook_url,
    website_url,
    cover_image_url,
    organizer_name,
    country_code,
    content_origin,
    status,
    updated_at
  ) VALUES (
    p_local_id,
    p_partner_user_id,
    p_partner_name,
    p_master_user_id,
    COALESCE(p_payload->>'title', 'Sans titre'),
    COALESCE(p_payload->>'description', ''),
    p_payload->>'program',
    v_slugs[1],
    v_slugs,
    COALESCE((p_payload->>'starts_at')::timestamptz, NOW()),
    NULLIF(p_payload->>'ends_at', '')::timestamptz,
    COALESCE(p_payload->>'venue_name', ''),
    p_payload->>'venue_address',
    p_payload->>'spot_id',
    NULLIF(p_payload->>'entry_price', '')::int,
    COALESCE(p_payload->>'currency', 'GNF'),
    p_payload->>'info_url',
    p_payload->>'instagram_url',
    p_payload->>'facebook_url',
    p_payload->>'website_url',
    p_payload->>'cover_image_url',
    p_payload->>'organizer_name',
    COALESCE(p_payload->>'country_code', 'GN'),
    COALESCE(NULLIF(trim(p_payload->>'content_origin'), ''), 'partner'),
    COALESCE(p_status, 'pending'),
    NOW()
  )
  ON CONFLICT (local_id) DO UPDATE SET
    partner_name = EXCLUDED.partner_name,
    master_user_id = EXCLUDED.master_user_id,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    program = EXCLUDED.program,
    category = EXCLUDED.category,
    category_slugs = EXCLUDED.category_slugs,
    starts_at = EXCLUDED.starts_at,
    ends_at = EXCLUDED.ends_at,
    venue_name = EXCLUDED.venue_name,
    venue_address = EXCLUDED.venue_address,
    spot_id = EXCLUDED.spot_id,
    entry_price = EXCLUDED.entry_price,
    currency = EXCLUDED.currency,
    info_url = EXCLUDED.info_url,
    instagram_url = EXCLUDED.instagram_url,
    facebook_url = EXCLUDED.facebook_url,
    website_url = EXCLUDED.website_url,
    cover_image_url = EXCLUDED.cover_image_url,
    organizer_name = EXCLUDED.organizer_name,
    country_code = EXCLUDED.country_code,
    content_origin = EXCLUDED.content_origin,
    status = EXCLUDED.status,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

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
BEGIN
  v_slugs := public.extract_category_slugs(p_payload, 'sub_category', 'fine_dining');

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
    v_slugs[1],
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
    COALESCE(p_status, 'pending'),
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
    status = EXCLUDED.status,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

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
  v_organizer_id UUID;
  v_master_id UUID;
  v_establishment_id UUID;
  v_event_id UUID;
  v_origin TEXT;
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

  v_organizer_id := COALESCE(s.master_user_id, s.partner_user_id);
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'organizer_id manquant pour %', p_local_id;
  END IF;

  v_master_id := COALESCE(s.master_user_id, s.partner_user_id);
  v_slugs := CASE
    WHEN s.category_slugs IS NOT NULL AND array_length(s.category_slugs, 1) > 0 THEN s.category_slugs
    ELSE ARRAY[s.category]
  END;
  v_category_id := public.resolve_event_category_id(v_slugs[1]);
  v_location_id := public.resolve_location_id(s.venue_address, 'Conakry', 'Guinée');
  v_origin := COALESCE(NULLIF(trim(s.content_origin), ''), 'partner');

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
    country_code,
    content_origin,
    is_active
  ) VALUES (
    s.title,
    v_category_id,
    v_slugs,
    COALESCE(s.description, ''),
    s.cover_image_url,
    v_organizer_id,
    v_master_id,
    s.organizer_name,
    v_establishment_id IS NULL,
    v_establishment_id,
    CASE WHEN v_establishment_id IS NULL THEN s.venue_name ELSE NULL END,
    v_location_id,
    s.starts_at,
    COALESCE(s.ends_at, s.starts_at + INTERVAL '3 hours'),
    COALESCE(s.entry_price, 0) = 0,
    NULLIF(s.entry_price, 0),
    COALESCE(s.info_url, s.website_url),
    COALESCE(s.country_code, 'GN'),
    v_origin,
    TRUE
  )
  RETURNING id INTO v_event_id;

  IF s.program IS NOT NULL AND trim(s.program) <> '' THEN
    INSERT INTO public.event_schedules (event_id, time_label, activity_title, order_index)
    VALUES (v_event_id, 'Programme', left(s.program, 255), 1);
  END IF;

  UPDATE public.partner_event_submissions
  SET status = 'approved',
      published_event_id = v_event_id,
      updated_at = NOW()
  WHERE local_id = p_local_id;

  RETURN v_event_id;
END;
$$;

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
  v_photo TEXT;
BEGIN
  SELECT * INTO s
  FROM public.partner_spot_submissions
  WHERE local_id = p_local_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Soumission introuvable: %', p_local_id;
  END IF;

  IF s.published_establishment_id IS NOT NULL THEN
    RETURN s.published_establishment_id;
  END IF;

  IF s.partner_user_id IS NULL THEN
    RAISE EXCEPTION 'partner_user_id manquant pour la soumission %', p_local_id;
  END IF;

  v_staff_id := public.ensure_partner_staff(s.partner_user_id);
  v_location_id := public.resolve_location_id(s.district, 'Conakry', 'Guinée');
  v_slugs := CASE
    WHEN s.category_slugs IS NOT NULL AND array_length(s.category_slugs, 1) > 0 THEN s.category_slugs
    ELSE ARRAY[s.sub_category]
  END;
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
    location_id,
    country_code,
    is_active
  ) VALUES (
    v_staff_id,
    s.name,
    v_category_id,
    v_slugs,
    COALESCE(s.description, ''),
    COALESCE(NULLIF(s.price_label, ''), '€€'),
    COALESCE(NULLIF(s.phone, ''), 'non_renseigne'),
    COALESCE(s.cta_url, s.website),
    v_location_id,
    COALESCE(s.country_code, 'GN'),
    TRUE
  )
  RETURNING id INTO v_establishment_id;

  v_photo := COALESCE(s.cover_image_url, s.logo_url);
  IF v_photo IS NOT NULL AND v_photo <> '' THEN
    INSERT INTO public.establishment_photos (establishment_id, photo_url, is_primary)
    VALUES (v_establishment_id, v_photo, TRUE);
  END IF;

  IF s.gallery_images IS NOT NULL THEN
    FOR v_photo IN
      SELECT jsonb_array_elements_text(s.gallery_images)
    LOOP
      IF v_photo IS NOT NULL AND v_photo <> '' THEN
        INSERT INTO public.establishment_photos (establishment_id, photo_url, is_primary)
        VALUES (v_establishment_id, v_photo, FALSE);
      END IF;
    END LOOP;
  END IF;

  UPDATE public.partner_spot_submissions
  SET status = 'approved',
      published_establishment_id = v_establishment_id,
      updated_at = NOW()
  WHERE local_id = p_local_id;

  RETURN v_establishment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.extract_category_slugs(JSONB, TEXT, TEXT) TO authenticated;
