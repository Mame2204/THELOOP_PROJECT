-- THE LOOP — Soumissions partenaire (spots & événements) → sync mobile ↔ Supabase
-- Compatible schéma Production V1.0 (establishments, partner_staff, locations)

-- -----------------------------------------------------------------------------
-- 1. Table soumissions spots (miroir du staging mobile)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.partner_spot_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id TEXT NOT NULL UNIQUE,
  partner_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  partner_name TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  district TEXT,
  sub_category TEXT NOT NULL DEFAULT 'fine_dining',
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  gallery_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  opening_hours TEXT,
  price_label TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  cta_url TEXT,
  organizer_name TEXT,
  country_code TEXT NOT NULL DEFAULT 'GN',
  tool_category TEXT,
  developer TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  partnership_status TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('draft', 'pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  published_establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_spot_submissions_status
  ON public.partner_spot_submissions(status, country_code);

CREATE INDEX IF NOT EXISTS idx_partner_spot_submissions_partner
  ON public.partner_spot_submissions(partner_user_id);

-- -----------------------------------------------------------------------------
-- 2. Helpers : partner_staff, location, catégorie
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_partner_staff(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  SELECT id INTO v_staff_id FROM public.partner_staff WHERE user_id = p_user_id LIMIT 1;
  IF v_staff_id IS NOT NULL THEN
    RETURN v_staff_id;
  END IF;

  INSERT INTO public.partner_staff (user_id, staff_role)
  VALUES (p_user_id, 'master')
  RETURNING id INTO v_staff_id;

  RETURN v_staff_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_location_id(
  p_neighborhood TEXT,
  p_city TEXT DEFAULT 'Conakry',
  p_country TEXT DEFAULT 'Guinée'
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id INT;
  v_name TEXT := COALESCE(NULLIF(trim(p_neighborhood), ''), 'Conakry');
BEGIN
  SELECT id INTO v_id
  FROM public.locations
  WHERE lower(neighborhood_name) = lower(v_name)
    AND lower(city) = lower(p_city)
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.locations (neighborhood_name, city, country)
  VALUES (v_name, p_city, p_country)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_establishment_category_id(p_sub_category TEXT)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id INT;
  v_slug TEXT := COALESCE(NULLIF(trim(p_sub_category), ''), 'fine_dining');
BEGIN
  SELECT id INTO v_id FROM public.establishment_categories WHERE slug = v_slug LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT id INTO v_id FROM public.establishment_categories ORDER BY id LIMIT 1;
  RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Publier une soumission spot → establishments
-- -----------------------------------------------------------------------------
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
  v_category_id := public.resolve_establishment_category_id(s.sub_category);

  INSERT INTO public.establishments (
    master_id,
    name,
    category_id,
    description,
    price_indicator,
    phone_contact,
    action_link,
    location_id,
    is_active
  ) VALUES (
    v_staff_id,
    s.name,
    v_category_id,
    COALESCE(s.description, ''),
    COALESCE(NULLIF(s.price_label, ''), '€€'),
    COALESCE(NULLIF(s.phone, ''), 'non_renseigne'),
    COALESCE(s.cta_url, s.website),
    v_location_id,
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

GRANT EXECUTE ON FUNCTION public.ensure_partner_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_location_id(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_establishment_category_id(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_partner_spot_submission(TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. RLS soumissions spots
-- -----------------------------------------------------------------------------
ALTER TABLE public.partner_spot_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partners manage own spot submissions" ON public.partner_spot_submissions;
CREATE POLICY "Partners manage own spot submissions"
  ON public.partner_spot_submissions FOR ALL TO authenticated
  USING (
    partner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.user_role IN ('admin', 'super_admin'))
  )
  WITH CHECK (
    partner_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.user_role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "Admin read all spot submissions" ON public.partner_spot_submissions;
CREATE POLICY "Admin read all spot submissions"
  ON public.partner_spot_submissions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.user_role IN ('admin', 'super_admin'))
  );

-- Permettre upsert via RPC sécurisée (partenaire sans session Auth utilise le flux local)
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
BEGIN
  INSERT INTO public.partner_spot_submissions (
    local_id,
    partner_user_id,
    partner_name,
    name,
    description,
    address,
    district,
    sub_category,
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
    COALESCE(p_payload->>'sub_category', 'fine_dining'),
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

GRANT EXECUTE ON FUNCTION public.upsert_partner_spot_submission(TEXT, UUID, TEXT, JSONB, TEXT) TO anon, authenticated;
