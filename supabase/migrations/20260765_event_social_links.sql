-- Liens sociaux + site web persistés sur events (affichage fiche événement).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT;

COMMENT ON COLUMN public.events.website_url IS 'Site web de l''événement.';
COMMENT ON COLUMN public.events.instagram_url IS 'Profil Instagram de l''événement.';
COMMENT ON COLUMN public.events.facebook_url IS 'Page Facebook de l''événement.';

UPDATE public.events e
SET
  website_url = COALESCE(NULLIF(trim(e.website_url), ''), NULLIF(trim(s.website_url), '')),
  instagram_url = COALESCE(NULLIF(trim(e.instagram_url), ''), NULLIF(trim(s.instagram_url), '')),
  facebook_url = COALESCE(NULLIF(trim(e.facebook_url), ''), NULLIF(trim(s.facebook_url), '')),
  action_link = COALESCE(
    NULLIF(trim(e.action_link), ''),
    NULLIF(trim(s.info_url), ''),
    NULLIF(trim(s.website_url), '')
  )
FROM public.partner_event_submissions s
WHERE s.published_event_id = e.id;

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

CREATE OR REPLACE FUNCTION public.sync_published_event_links_from_submission()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.published_event_id IS NOT NULL THEN
    UPDATE public.events e
    SET
      website_url = NULLIF(trim(NEW.website_url), ''),
      instagram_url = NULLIF(trim(NEW.instagram_url), ''),
      facebook_url = NULLIF(trim(NEW.facebook_url), ''),
      action_link = COALESCE(
        NULLIF(trim(NEW.info_url), ''),
        NULLIF(trim(NEW.website_url), ''),
        e.action_link
      )
    WHERE e.id = NEW.published_event_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_event_links_on_submission ON public.partner_event_submissions;
CREATE TRIGGER trg_sync_event_links_on_submission
  AFTER INSERT OR UPDATE OF published_event_id, info_url, website_url, instagram_url, facebook_url
  ON public.partner_event_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_published_event_links_from_submission();

UPDATE public.events e
SET
  website_url = COALESCE(NULLIF(trim(e.website_url), ''), NULLIF(trim(s.website_url), '')),
  instagram_url = COALESCE(NULLIF(trim(e.instagram_url), ''), NULLIF(trim(s.instagram_url), '')),
  facebook_url = COALESCE(NULLIF(trim(e.facebook_url), ''), NULLIF(trim(s.facebook_url), '')),
  action_link = COALESCE(
    NULLIF(trim(e.action_link), ''),
    NULLIF(trim(s.info_url), ''),
    NULLIF(trim(s.website_url), '')
  )
FROM public.partner_event_submissions s
WHERE s.published_event_id = e.id;
