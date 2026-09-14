-- THE LOOP — Source unique catégories : content_categories + category_slugs
-- Supprime event_categories, establishment_categories, category_id et tools.tool_category

-- ─── 1. Helper validation ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_content_category_slugs(
  p_kind TEXT,
  p_slugs TEXT[],
  p_fallback TEXT DEFAULT NULL
)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fallback TEXT;
  v_slug TEXT;
  v_out TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_kind NOT IN ('event', 'spot', 'tool') THEN
    RAISE EXCEPTION 'invalid_content_category_kind: %', p_kind;
  END IF;

  v_fallback := COALESCE(NULLIF(trim(p_fallback), ''), CASE p_kind
    WHEN 'event' THEN 'corporate'
    WHEN 'spot' THEN 'fine_dining'
    ELSE 'tool-autre'
  END);

  IF p_slugs IS NOT NULL THEN
    FOREACH v_slug IN ARRAY p_slugs
    LOOP
      v_slug := NULLIF(trim(v_slug), '');
      IF v_slug IS NULL OR v_slug = ANY (v_out) THEN
        CONTINUE;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.content_categories cc
        WHERE cc.kind = p_kind AND cc.slug = v_slug AND cc.is_active = TRUE
      ) THEN
        v_out := array_append(v_out, v_slug);
      END IF;
    END LOOP;
  END IF;

  IF array_length(v_out, 1) IS NULL OR array_length(v_out, 1) = 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.content_categories cc
      WHERE cc.kind = p_kind AND cc.slug = v_fallback AND cc.is_active = TRUE
    ) THEN
      RETURN ARRAY[v_fallback];
    END IF;
    SELECT cc.slug INTO v_fallback
    FROM public.content_categories cc
    WHERE cc.kind = p_kind AND cc.is_active = TRUE
    ORDER BY cc.sort_order, cc.slug
    LIMIT 1;
    IF v_fallback IS NULL THEN
      RAISE EXCEPTION 'no_content_category_available_for_kind: %', p_kind;
    END IF;
    RETURN ARRAY[v_fallback];
  END IF;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_content_category_slugs(TEXT, TEXT[], TEXT) TO authenticated;

COMMENT ON FUNCTION public.normalize_content_category_slugs IS
  'Valide et normalise les slugs catégories depuis content_categories (kind event|spot|tool).';

-- ─── 2. Rétro-remplissage category_slugs (source : content_categories) ────────
-- Les slugs valides viennent uniquement de content_categories (kind event|spot|tool).
-- Legacy event_categories / establishment_categories : migration optionnelle si encore présentes.

DO $$
BEGIN
  IF to_regclass('public.event_categories') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'category_id'
     ) THEN
    UPDATE public.events e
    SET category_slugs = public.normalize_content_category_slugs('event', ARRAY[ec.slug], 'corporate')
    FROM public.event_categories ec
    WHERE ec.id = e.category_id
      AND (e.category_slugs IS NULL OR e.category_slugs = '{}');
  END IF;
END $$;

UPDATE public.events e
SET category_slugs = public.normalize_content_category_slugs('event', e.category_slugs, 'corporate')
WHERE e.category_slugs IS NULL OR e.category_slugs = '{}';

DO $$
BEGIN
  IF to_regclass('public.establishment_categories') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'establishments' AND column_name = 'category_id'
     ) THEN
    UPDATE public.establishments est
    SET category_slugs = public.normalize_content_category_slugs('spot', ARRAY[esc.slug], 'fine_dining')
    FROM public.establishment_categories esc
    WHERE esc.id = est.category_id
      AND (est.category_slugs IS NULL OR est.category_slugs = '{}');
  END IF;
END $$;

UPDATE public.establishments est
SET category_slugs = public.normalize_content_category_slugs('spot', est.category_slugs, 'fine_dining')
WHERE est.category_slugs IS NULL OR est.category_slugs = '{}';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tools' AND column_name = 'tool_category'
  ) THEN
    UPDATE public.tools t
    SET category_slugs = public.normalize_content_category_slugs(
      'tool',
      CASE
        WHEN NULLIF(trim(t.tool_category), '') IS NOT NULL THEN ARRAY[trim(t.tool_category)]
        ELSE NULL
      END,
      'tool-autre'
    )
    WHERE t.category_slugs IS NULL OR t.category_slugs = '{}';
  END IF;
END $$;

UPDATE public.tools t
SET category_slugs = public.normalize_content_category_slugs('tool', t.category_slugs, 'tool-autre')
WHERE t.category_slugs IS NULL OR t.category_slugs = '{}';

-- ─── 3. RPC admin / modération (sans category_id) ────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_event_direct(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_location_id INT;
  v_establishment_id UUID;
  v_event_id UUID;
  v_starts TIMESTAMPTZ;
  v_ends TIMESTAMPTZ;
  v_status TEXT;
  v_slugs TEXT[];
  v_is_invitation BOOLEAN;
  v_entry_price NUMERIC;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  v_slugs := public.normalize_content_category_slugs(
    'event',
    public.extract_category_slugs(p_payload, 'category', 'corporate'),
    'corporate'
  );
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
  v_is_invitation := COALESCE((p_payload->>'is_invitation_only')::boolean, FALSE);
  v_entry_price := NULLIF((p_payload->>'entry_price')::numeric, 0);

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
    content_status,
    content_origin,
    is_active
  ) VALUES (
    COALESCE(p_payload->>'title', 'Sans titre'),
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
    NOT v_is_invitation AND COALESCE(v_entry_price, 0) = 0,
    v_is_invitation,
    CASE WHEN v_is_invitation THEN NULL ELSE v_entry_price END,
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
  v_establishment_id UUID;
  v_photo TEXT;
  v_status TEXT;
  v_origin TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  v_staff_id := public.ensure_partner_staff(v_admin_id);
  v_slugs := public.normalize_content_category_slugs(
    'spot',
    public.extract_category_slugs(p_payload, 'sub_category', 'fine_dining'),
    'fine_dining'
  );
  v_location_id := public.resolve_location_id(
    COALESCE(NULLIF(trim(p_payload->>'district'), ''), NULLIF(trim(p_payload->>'address'), ''), 'Conakry'),
    'Conakry',
    'Guinée'
  );
  v_status := CASE WHEN COALESCE(p_payload->>'content_status', 'published') = 'draft' THEN 'draft' ELSE 'published' END;
  v_origin := COALESCE(NULLIF(trim(p_payload->>'content_origin'), ''), 'admin');
  IF v_origin NOT IN ('admin', 'loop', 'partner') THEN
    v_origin := 'admin';
  END IF;

  INSERT INTO public.establishments (
    master_id,
    name,
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
    content_status,
    content_origin,
    opening_hours_label,
    is_active
  ) VALUES (
    v_staff_id,
    COALESCE(p_payload->>'name', 'Sans nom'),
    v_slugs,
    COALESCE(p_payload->>'description', ''),
    COALESCE(NULLIF(p_payload->>'price_label', ''), '€€'),
    COALESCE(NULLIF(p_payload->>'phone', ''), 'non_renseigne'),
    NULLIF(trim(COALESCE(p_payload->>'cta_url', p_payload->>'website')), ''),
    NULLIF(trim(p_payload->>'website'), ''),
    NULLIF(trim(p_payload->>'instagram_url'), ''),
    NULLIF(trim(p_payload->>'facebook_url'), ''),
    v_location_id,
    COALESCE(p_payload->>'country_code', 'GN'),
    v_status,
    v_origin,
    NULLIF(trim(p_payload->>'opening_hours'), ''),
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

CREATE OR REPLACE FUNCTION public.admin_create_tool_direct(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_staff_id UUID;
  v_tool_id UUID;
  v_status TEXT;
  v_photo TEXT;
  v_origin TEXT;
  v_slugs TEXT[];
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  v_staff_id := public.ensure_partner_staff(v_admin_id);
  v_status := CASE WHEN COALESCE(p_payload->>'content_status', 'published') = 'draft' THEN 'draft' ELSE 'published' END;
  v_origin := COALESCE(NULLIF(trim(p_payload->>'content_origin'), ''), 'admin');
  IF v_origin NOT IN ('admin', 'loop', 'partner') THEN
    v_origin := 'admin';
  END IF;

  v_slugs := CASE
    WHEN jsonb_typeof(p_payload->'categories') = 'array'
      THEN ARRAY(
        SELECT trim(both '"' from elem::text)
        FROM jsonb_array_elements(p_payload->'categories') elem
        WHERE trim(both '"' from elem::text) <> '' AND trim(both '"' from elem::text) <> 'tools'
      )
    WHEN NULLIF(trim(p_payload->>'tool_category'), '') IS NOT NULL
      THEN ARRAY[trim(p_payload->>'tool_category')]
    ELSE ARRAY[]::TEXT[]
  END;
  v_slugs := public.normalize_content_category_slugs('tool', v_slugs, 'tool-autre');

  INSERT INTO public.tools (
    master_id,
    name,
    description,
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
    COALESCE(p_payload->>'name', 'Sans nom'),
    COALESCE(p_payload->>'description', ''),
    v_slugs,
    NULLIF(trim(COALESCE(p_payload->>'logo_url', p_payload->>'cover_image_url')), ''),
    NULLIF(trim(p_payload->>'website'), ''),
    NULLIF(trim(COALESCE(p_payload->>'cta_url', p_payload->>'website')), ''),
    NULLIF(trim(p_payload->>'instagram_url'), ''),
    NULLIF(trim(p_payload->>'facebook_url'), ''),
    NULLIF(trim(p_payload->>'phone'), ''),
    NULLIF(trim(COALESCE(p_payload->>'developer', p_payload->>'organizer_name')), ''),
    COALESCE((p_payload->>'is_verified')::boolean, FALSE),
    NULLIF(trim(p_payload->>'partnership_status'), ''),
    COALESCE(p_payload->>'country_code', 'GN'),
    v_status,
    v_origin,
    TRUE
  )
  RETURNING id INTO v_tool_id;

  v_photo := COALESCE(p_payload->>'cover_image_url', p_payload->>'logo_url');
  IF v_photo IS NOT NULL AND v_photo <> '' THEN
    INSERT INTO public.tool_photos (tool_id, photo_url, is_primary)
    VALUES (v_tool_id, v_photo, TRUE);
  END IF;

  IF p_payload->'gallery_images' IS NOT NULL THEN
    FOR v_photo IN SELECT jsonb_array_elements_text(p_payload->'gallery_images')
    LOOP
      IF v_photo IS NOT NULL AND v_photo <> '' THEN
        INSERT INTO public.tool_photos (tool_id, photo_url, is_primary)
        VALUES (v_tool_id, v_photo, FALSE);
      END IF;
    END LOOP;
  END IF;

  RETURN v_tool_id;
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
  v_tool_slugs TEXT[];
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
    v_tool_slugs := public.normalize_content_category_slugs(
      'tool',
      CASE
        WHEN NULLIF(trim(s.tool_category), '') IS NOT NULL THEN ARRAY[trim(s.tool_category)]
        ELSE array_remove(v_slugs, 'tools')
      END,
      'tool-autre'
    );

    INSERT INTO public.tools (
      master_id,
      name,
      description,
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
      v_tool_slugs,
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

  v_slugs := public.normalize_content_category_slugs('spot', v_slugs, 'fine_dining');
  v_location_id := public.resolve_location_id(s.district, 'Conakry', 'Guinée');

  INSERT INTO public.establishments (
    master_id,
    name,
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

CREATE OR REPLACE FUNCTION public.admin_users_with_favorite_categories(
  p_event_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_spot_categories TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_tool_categories TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS TABLE(user_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  RETURN QUERY
  SELECT DISTINCT u.id
  FROM public.users u
  WHERE u.is_active = TRUE
    AND u.user_role NOT IN ('admin', 'super_admin', 'partner', 'tool_partner')
    AND (
      (
        COALESCE(cardinality(p_event_categories), 0) > 0
        AND EXISTS (
          SELECT 1
          FROM public.favorite_events fe
          JOIN public.events e ON e.id = fe.event_id
          WHERE fe.user_id = u.id
            AND COALESCE(e.category_slugs, '{}'::TEXT[]) && p_event_categories
        )
      )
      OR (
        COALESCE(cardinality(p_spot_categories), 0) > 0
        AND EXISTS (
          SELECT 1
          FROM public.favorite_spots fs
          JOIN public.establishments est ON est.id = fs.establishment_id
          WHERE fs.user_id = u.id
            AND COALESCE(est.category_slugs, '{}'::TEXT[]) && p_spot_categories
        )
      )
      OR (
        COALESCE(cardinality(p_tool_categories), 0) > 0
        AND EXISTS (
          SELECT 1
          FROM public.favorite_tools ft
          JOIN public.tools t ON t.id = ft.tool_id
          WHERE ft.user_id = u.id
            AND COALESCE(t.category_slugs, '{}'::TEXT[]) && p_tool_categories
        )
      )
    );
END;
$$;

-- ─── 4. Suppression legacy ────────────────────────────────────────────────────
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS events_category_id_fkey;
ALTER TABLE public.establishments DROP CONSTRAINT IF EXISTS establishments_category_id_fkey;

ALTER TABLE public.events DROP COLUMN IF EXISTS category_id;
ALTER TABLE public.establishments DROP COLUMN IF EXISTS category_id;

DROP INDEX IF EXISTS public.idx_tools_tool_category;
ALTER TABLE public.tools DROP COLUMN IF EXISTS tool_category;

DROP FUNCTION IF EXISTS public.resolve_event_category_id(TEXT);
DROP FUNCTION IF EXISTS public.resolve_establishment_category_id(TEXT);

DROP TABLE IF EXISTS public.event_categories CASCADE;
DROP TABLE IF EXISTS public.establishment_categories CASCADE;

-- ─── 5. Contraintes : catégorie obligatoire ───────────────────────────────────
ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_category_slugs_required;
ALTER TABLE public.events
  ADD CONSTRAINT events_category_slugs_required
  CHECK (array_length(category_slugs, 1) >= 1);

ALTER TABLE public.establishments
  DROP CONSTRAINT IF EXISTS establishments_category_slugs_required;
ALTER TABLE public.establishments
  ADD CONSTRAINT establishments_category_slugs_required
  CHECK (array_length(category_slugs, 1) >= 1);

ALTER TABLE public.tools
  DROP CONSTRAINT IF EXISTS tools_category_slugs_required;
ALTER TABLE public.tools
  ADD CONSTRAINT tools_category_slugs_required
  CHECK (array_length(category_slugs, 1) >= 1);

COMMENT ON COLUMN public.events.category_slugs IS
  'Slugs catégories (content_categories kind=event) — source unique.';
COMMENT ON COLUMN public.establishments.category_slugs IS
  'Slugs catégories (content_categories kind=spot) — source unique.';
COMMENT ON COLUMN public.tools.category_slugs IS
  'Slugs catégories (content_categories kind=tool) — source unique.';

GRANT EXECUTE ON FUNCTION public.admin_create_event_direct(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_establishment_direct(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_tool_direct(JSONB) TO authenticated;
