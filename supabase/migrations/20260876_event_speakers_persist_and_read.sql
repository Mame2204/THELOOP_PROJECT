-- THE LOOP — Intervenants événements : sync fiable + lecture publique + staging

-- Colonne JSONB sur soumissions partenaire (miroir avant publication)
ALTER TABLE public.partner_event_submissions
  ADD COLUMN IF NOT EXISTS speakers JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.partner_event_submissions.speakers IS
  'Intervenants [{name, title, company}] — synchronisés vers event_speakers à la publication.';

-- Sync interne (pas de contrôle auth) — appelée par RPC admin / publish
CREATE OR REPLACE FUNCTION public.sync_event_speakers_core(
  p_event_id UUID,
  p_speakers JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speaker JSONB;
BEGIN
  IF p_event_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.event_speakers WHERE event_id = p_event_id;

  IF p_speakers IS NULL OR jsonb_typeof(p_speakers) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_speaker IN SELECT value FROM jsonb_array_elements(p_speakers)
  LOOP
    IF COALESCE(
      NULLIF(trim(v_speaker->>'name'), ''),
      NULLIF(trim(v_speaker->>'full_name'), '')
    ) IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.event_speakers (event_id, full_name, professional_title, company_name)
    VALUES (
      p_event_id,
      COALESCE(NULLIF(trim(v_speaker->>'name'), ''), NULLIF(trim(v_speaker->>'full_name'), '')),
      NULLIF(trim(COALESCE(v_speaker->>'title', v_speaker->>'professional_title', '')), ''),
      NULLIF(trim(COALESCE(v_speaker->>'company', v_speaker->>'company_name', '')), '')
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_event_speakers_core(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_event_speakers_core(UUID, JSONB) TO service_role;

-- RPC publique admin : garde le contrôle, délègue au core
CREATE OR REPLACE FUNCTION public.sync_event_speakers(p_event_id UUID, p_speakers JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  PERFORM public.sync_event_speakers_core(p_event_id, p_speakers);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_event_speakers(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_event_speakers(UUID, JSONB) TO authenticated, service_role;

-- Lecture speakers pour événements lisibles (anon + connectés)
DO $$ BEGIN
  IF to_regclass('public.event_speakers') IS NOT NULL THEN
    ALTER TABLE public.event_speakers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read event speakers" ON public.event_speakers;
    DROP POLICY IF EXISTS "Read speakers for visible events" ON public.event_speakers;
    CREATE POLICY "Read speakers for visible events"
      ON public.event_speakers FOR SELECT TO anon, authenticated
      USING (public.event_is_readable(event_id));
  END IF;

  IF to_regclass('public.event_schedules') IS NOT NULL THEN
    ALTER TABLE public.event_schedules ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read event schedules" ON public.event_schedules;
    DROP POLICY IF EXISTS "Read schedules for visible events" ON public.event_schedules;
    CREATE POLICY "Read schedules for visible events"
      ON public.event_schedules FOR SELECT TO anon, authenticated
      USING (public.event_is_readable(event_id));
  END IF;
END $$;

-- Upsert soumission : inclure speakers (RETURNS UUID — signature historique)
DROP FUNCTION IF EXISTS public.upsert_partner_event_submission(TEXT, UUID, TEXT, UUID, JSONB, TEXT);

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
  v_guinea_id INT;
  v_venue_location JSONB;
  v_speakers JSONB;
BEGIN
  v_slugs := public.normalize_content_category_slugs(
    'event',
    public.extract_category_slugs(p_payload, 'category', 'corporate'),
    'corporate'
  );

  v_guinea_id := public.resolve_guinea_location_from_payload(p_payload);

  v_venue_location := CASE
    WHEN p_payload ? 'venue_location' AND jsonb_typeof(p_payload->'venue_location') = 'object'
      THEN p_payload->'venue_location'
    ELSE NULL
  END;

  v_speakers := CASE
    WHEN p_payload ? 'speakers' AND jsonb_typeof(p_payload->'speakers') = 'array'
      THEN p_payload->'speakers'
    ELSE '[]'::jsonb
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
    speakers,
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
    v_speakers,
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
    speakers = EXCLUDED.speakers,
    status = EXCLUDED.status,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_partner_event_submission(TEXT, UUID, TEXT, UUID, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_partner_event_submission(TEXT, UUID, TEXT, UUID, JSONB, TEXT) TO authenticated, service_role;

-- Publication partenaire : sync speakers vers event_speakers
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
    -- Republier / resync speakers si déjà publié
    PERFORM public.sync_event_speakers_core(s.published_event_id, COALESCE(s.speakers, '[]'::jsonb));
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

-- admin_create_event_direct : utiliser le core (évite échec silencieux nested auth)
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

  IF p_payload ? 'speakers' THEN
    PERFORM public.sync_event_speakers_core(v_event_id, p_payload->'speakers');
  END IF;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_event_direct(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_event_direct(JSONB) TO authenticated, service_role;
