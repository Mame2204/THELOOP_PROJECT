-- Intervenants événements : politiques RLS admin + RPC sync + création directe

-- ─── RLS lecture publique + écriture admin ───────────────────────────────────
ALTER TABLE public.event_speakers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read event speakers" ON public.event_speakers;
CREATE POLICY "Public read event speakers" ON public.event_speakers
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage speakers" ON public.event_speakers;
DROP POLICY IF EXISTS "Admin manage event speakers" ON public.event_speakers;
CREATE POLICY "Admin manage event speakers" ON public.event_speakers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

ALTER TABLE public.event_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read event schedules" ON public.event_schedules;
CREATE POLICY "Public read event schedules" ON public.event_schedules
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin manage event schedules" ON public.event_schedules;
CREATE POLICY "Admin manage event schedules" ON public.event_schedules
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── RPC : synchroniser les intervenants d'un événement ──────────────────────
CREATE OR REPLACE FUNCTION public.sync_event_speakers(p_event_id UUID, p_speakers JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_speaker JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
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

GRANT EXECUTE ON FUNCTION public.sync_event_speakers(UUID, JSONB) TO authenticated;

-- ─── admin_create_event_direct : persister les speakers à la création ────────
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
    PERFORM public.sync_event_speakers(v_event_id, p_payload->'speakers');
  END IF;

  RETURN v_event_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_event_direct(JSONB) TO authenticated;
