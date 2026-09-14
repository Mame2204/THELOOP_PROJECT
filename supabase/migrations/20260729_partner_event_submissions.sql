-- THE LOOP — Soumissions événements partenaire → sync mobile ↔ events

CREATE TABLE IF NOT EXISTS public.partner_event_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id TEXT NOT NULL UNIQUE,
  partner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  partner_name TEXT NOT NULL,
  master_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  program TEXT,
  category TEXT NOT NULL DEFAULT 'corporate',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  venue_name TEXT NOT NULL DEFAULT '',
  venue_address TEXT,
  spot_id TEXT,
  entry_price INT,
  currency TEXT DEFAULT 'GNF',
  info_url TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  website_url TEXT,
  cover_image_url TEXT,
  organizer_name TEXT,
  country_code TEXT NOT NULL DEFAULT 'GN',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  published_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_event_submissions_status
  ON public.partner_event_submissions(status, country_code);

CREATE OR REPLACE FUNCTION public.resolve_event_category_id(p_category TEXT)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id INT;
  v_slug TEXT := COALESCE(NULLIF(trim(p_category), ''), 'corporate');
BEGIN
  SELECT id INTO v_id FROM public.event_categories WHERE slug = v_slug LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT id INTO v_id FROM public.event_categories ORDER BY id LIMIT 1;
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
  v_category_id INT;
  v_location_id INT;
  v_organizer_id UUID;
  v_master_id UUID;
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

  v_organizer_id := COALESCE(s.master_user_id, s.partner_user_id);
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'organizer_id manquant pour %', p_local_id;
  END IF;

  v_master_id := COALESCE(s.master_user_id, s.partner_user_id);
  v_category_id := public.resolve_event_category_id(s.category);
  v_location_id := public.resolve_location_id(s.venue_address, 'Conakry', 'Guinée');

  v_establishment_id := NULL;
  IF s.spot_id IS NOT NULL AND s.spot_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_establishment_id := s.spot_id::uuid;
  END IF;

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
    action_link
  ) VALUES (
    s.title,
    v_category_id,
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
    COALESCE(s.info_url, s.website_url)
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

GRANT EXECUTE ON FUNCTION public.resolve_event_category_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_partner_event_submission(TEXT) TO authenticated;

ALTER TABLE public.partner_event_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partners manage own event submissions" ON public.partner_event_submissions;
CREATE POLICY "Partners manage own event submissions"
  ON public.partner_event_submissions FOR ALL TO authenticated
  USING (
    partner_user_id = auth.uid()
    OR master_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.user_role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    partner_user_id = auth.uid()
    OR master_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.user_role IN ('admin', 'super_admin'))
  );

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
BEGIN
  INSERT INTO public.partner_event_submissions (
    local_id,
    partner_user_id,
    partner_name,
    master_user_id,
    title,
    description,
    program,
    category,
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
    COALESCE(p_payload->>'category', 'corporate'),
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
    status = EXCLUDED.status,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_partner_event_submission(TEXT, UUID, TEXT, UUID, JSONB, TEXT) TO anon, authenticated;
