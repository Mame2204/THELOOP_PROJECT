-- Référentiel guinea_locations sur les soumissions / événements « autre lieu »
-- venue_name = nom libre (ex. Radisson) ; venue_location = hiérarchie complète ; guinea_location_id = FK

ALTER TABLE public.partner_event_submissions
  ADD COLUMN IF NOT EXISTS guinea_location_id BIGINT REFERENCES public.guinea_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS venue_location JSONB;

ALTER TABLE public.partner_spot_submissions
  ADD COLUMN IF NOT EXISTS guinea_location_id BIGINT REFERENCES public.guinea_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS venue_location JSONB;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS guinea_location_id BIGINT REFERENCES public.guinea_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS venue_location JSONB;

COMMENT ON COLUMN public.partner_event_submissions.venue_location IS
  'Hiérarchie GN : region, prefecture, commune, district, country_code, label (COMMUNE · QUARTIER).';
COMMENT ON COLUMN public.partner_event_submissions.guinea_location_id IS
  'Référence vers public.guinea_locations (4549 quartiers).';

CREATE OR REPLACE FUNCTION public.resolve_guinea_location_id(
  p_commune TEXT,
  p_district TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id BIGINT;
  v_commune TEXT := trim(COALESCE(p_commune, ''));
  v_district TEXT := NULLIF(trim(COALESCE(p_district, '')), '');
BEGIN
  IF v_commune = '' THEN
    RETURN NULL;
  END IF;

  IF v_district IS NOT NULL THEN
    SELECT gl.id INTO v_id
    FROM public.guinea_locations gl
    WHERE lower(gl.commune) = lower(v_commune)
      AND lower(gl.district) = lower(v_district)
    LIMIT 1;
    RETURN v_id;
  END IF;

  SELECT gl.id INTO v_id
  FROM public.guinea_locations gl
  WHERE lower(gl.commune) = lower(v_commune)
  ORDER BY gl.district
  LIMIT 1;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_guinea_location_from_payload(p_payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  IF p_payload ? 'guinea_location_id'
     AND NULLIF(trim(p_payload->>'guinea_location_id'), '') ~ '^\d+$' THEN
    RETURN (p_payload->>'guinea_location_id')::bigint;
  END IF;

  IF p_payload ? 'venue_location' AND jsonb_typeof(p_payload->'venue_location') = 'object' THEN
    v_id := public.resolve_guinea_location_id(
      p_payload->'venue_location'->>'commune',
      p_payload->'venue_location'->>'district'
    );
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_submission_neighborhood(
  p_venue_address TEXT,
  p_venue_location JSONB DEFAULT NULL,
  p_guinea_location_id BIGINT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_district TEXT;
BEGIN
  IF p_guinea_location_id IS NOT NULL THEN
    SELECT gl.district INTO v_district
    FROM public.guinea_locations gl
    WHERE gl.id = p_guinea_location_id
    LIMIT 1;
    IF v_district IS NOT NULL THEN
      RETURN v_district;
    END IF;
  END IF;

  IF p_venue_location IS NOT NULL AND jsonb_typeof(p_venue_location) = 'object' THEN
    v_district := NULLIF(trim(p_venue_location->>'district'), '');
    IF v_district IS NOT NULL THEN
      RETURN v_district;
    END IF;
    RETURN NULLIF(trim(p_venue_location->>'commune'), '');
  END IF;

  IF position(' · ' IN COALESCE(p_venue_address, '')) > 0 THEN
    RETURN trim(split_part(p_venue_address, ' · ', 2));
  END IF;

  RETURN NULLIF(trim(COALESCE(p_venue_address, '')), '');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_guinea_location_id(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_guinea_location_from_payload(JSONB) TO authenticated;

-- ─── upsert soumission événement (venue_location + guinea_location_id) ─────────
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
  v_guinea_id BIGINT;
  v_venue_location JSONB;
BEGIN
  v_slugs := public.extract_category_slugs(p_payload, 'category', 'corporate');
  v_guinea_id := public.resolve_guinea_location_from_payload(p_payload);
  v_venue_location := CASE
    WHEN p_payload ? 'venue_location' AND jsonb_typeof(p_payload->'venue_location') = 'object'
      THEN p_payload->'venue_location'
    ELSE NULL
  END;

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
    venue_location,
    guinea_location_id,
    spot_id,
    entry_price,
    is_invitation_only,
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
    v_venue_location,
    v_guinea_id,
    p_payload->>'spot_id',
    NULLIF(p_payload->>'entry_price', '')::int,
    COALESCE((p_payload->>'is_invitation_only')::boolean, FALSE),
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
    venue_location = EXCLUDED.venue_location,
    guinea_location_id = EXCLUDED.guinea_location_id,
    spot_id = EXCLUDED.spot_id,
    entry_price = EXCLUDED.entry_price,
    is_invitation_only = EXCLUDED.is_invitation_only,
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

-- ─── publication modération → events ───────────────────────────────────────
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
  v_neighborhood TEXT;
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
    category_id,
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
    is_active
  ) VALUES (
    s.title,
    v_category_id,
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
