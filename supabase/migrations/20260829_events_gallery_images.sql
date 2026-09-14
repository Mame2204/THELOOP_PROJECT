-- THE LOOP — Galeries photos événements (JSONB, aligné spots/tools staging)
-- Permet le swipe multi-photos côté mobile (DetailPhotoGallery / galleryImages).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS gallery_images JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.partner_event_submissions
  ADD COLUMN IF NOT EXISTS gallery_images JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.events.gallery_images IS
  'URLs photos supplémentaires (hors banner_url / couverture).';

COMMENT ON COLUMN public.partner_event_submissions.gallery_images IS
  'Galerie soumise par le partenaire avant publication.';

-- ─── Admin : création directe ───────────────────────────────────────────────
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
  v_slugs TEXT[];
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
    gallery_images,
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
    COALESCE(p_payload->>'title', 'Sans titre'),
    v_category_id,
    v_slugs,
    COALESCE(p_payload->>'description', ''),
    p_payload->>'cover_image_url',
    COALESCE(p_payload->'gallery_images', '[]'::jsonb),
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
    NULLIF(trim(COALESCE(p_payload->>'info_url', p_payload->>'website_url')), ''),
    NULLIF(trim(p_payload->>'website_url'), ''),
    NULLIF(trim(p_payload->>'instagram_url'), ''),
    NULLIF(trim(p_payload->>'facebook_url'), ''),
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

-- ─── Partenaire : upsert soumission ─────────────────────────────────────────
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
    gallery_images,
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
    COALESCE(p_payload->'gallery_images', '[]'::jsonb),
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
    gallery_images = EXCLUDED.gallery_images,
    organizer_name = EXCLUDED.organizer_name,
    country_code = EXCLUDED.country_code,
    content_origin = EXCLUDED.content_origin,
    status = EXCLUDED.status,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─── Modération : publication vers events ───────────────────────────────────
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
    gallery_images,
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
    COALESCE(s.gallery_images, '[]'::jsonb),
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
