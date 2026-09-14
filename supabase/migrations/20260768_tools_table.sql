-- Outils : tables dédiées (sortie de establishments).
-- Les spots restent dans establishments ; les outils dans tools + tool_photos.

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id UUID,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tool_category TEXT,
  category_slugs TEXT[] NOT NULL DEFAULT '{}',
  logo_url TEXT,
  website_url TEXT,
  action_link TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  phone_contact TEXT,
  developer TEXT,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  partnership_status TEXT,
  country_code TEXT NOT NULL DEFAULT 'GN',
  content_status TEXT NOT NULL DEFAULT 'published'
    CHECK (content_status IN ('draft', 'published', 'deactivated')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  featured_start_date TIMESTAMPTZ,
  featured_end_date TIMESTAMPTZ,
  click_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  engagement_score NUMERIC NOT NULL DEFAULT 0,
  star_count INTEGER NOT NULL DEFAULT 0,
  stars_source TEXT NOT NULL DEFAULT 'auto',
  admin_star_override INTEGER,
  admin_star_override_at TIMESTAMPTZ,
  admin_star_override_by UUID,
  rating_avg NUMERIC NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tools_active ON public.tools(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_tools_country ON public.tools(country_code);
CREATE INDEX IF NOT EXISTS idx_tools_content_status ON public.tools(content_status);
CREATE INDEX IF NOT EXISTS idx_tools_tool_category ON public.tools(tool_category);

CREATE TABLE IF NOT EXISTS public.tool_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id UUID NOT NULL REFERENCES public.tools(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_photos_tool ON public.tool_photos(tool_id);

COMMENT ON TABLE public.tools IS 'Catalogue outils THE LOOP (séparé des spots / establishments).';
COMMENT ON TABLE public.tool_photos IS 'Photos / logo des outils.';

-- Lien soumission partenaire → outil publié
ALTER TABLE public.partner_spot_submissions
  ADD COLUMN IF NOT EXISTS published_tool_id UUID REFERENCES public.tools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partner_spot_submissions_tool
  ON public.partner_spot_submissions(published_tool_id)
  WHERE published_tool_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Migration des lignes outils depuis establishments
-- -----------------------------------------------------------------------------
WITH tool_rows AS (
  SELECT e.id
  FROM public.establishments e
  LEFT JOIN public.establishment_categories ec ON ec.id = e.category_id
  WHERE ec.slug = 'tools'
     OR (e.category_slugs IS NOT NULL AND 'tools' = ANY (e.category_slugs))
),
inserted AS (
  INSERT INTO public.tools (
    id,
    master_id,
    name,
    description,
    category_slugs,
    action_link,
    phone_contact,
    country_code,
    content_status,
    is_active,
    is_featured,
    click_count,
    favorite_count,
    created_at
  )
  SELECT
    e.id,
    e.master_id,
    e.name,
    COALESCE(e.description, ''),
    CASE
      WHEN e.category_slugs IS NOT NULL AND array_length(e.category_slugs, 1) > 0
        THEN array_remove(e.category_slugs, 'tools')
      ELSE '{}'::TEXT[]
    END,
    e.action_link,
    NULLIF(e.phone_contact, 'non_renseigne'),
    COALESCE(e.country_code, 'GN'),
    COALESCE(e.content_status, 'published'),
    COALESCE(e.is_active, TRUE),
    COALESCE(e.is_featured, FALSE),
    COALESCE(e.click_count, 0),
    COALESCE(e.favorite_count, 0),
    e.created_at
  FROM public.establishments e
  WHERE e.id IN (SELECT id FROM tool_rows)
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
INSERT INTO public.tool_photos (tool_id, photo_url, is_primary)
SELECT ep.establishment_id, ep.photo_url, ep.is_primary
FROM public.establishment_photos ep
WHERE ep.establishment_id IN (SELECT id FROM tool_rows)
  AND NOT EXISTS (
    SELECT 1 FROM public.tool_photos tp
    WHERE tp.tool_id = ep.establishment_id AND tp.photo_url = ep.photo_url
  );

-- Rétro-remplissage métadonnées depuis soumissions
UPDATE public.tools t
SET
  tool_category = COALESCE(NULLIF(trim(t.tool_category), ''), NULLIF(trim(s.tool_category), '')),
  developer = COALESCE(NULLIF(trim(t.developer), ''), NULLIF(trim(s.developer), ''), NULLIF(trim(s.organizer_name), '')),
  logo_url = COALESCE(NULLIF(trim(t.logo_url), ''), NULLIF(trim(s.logo_url), ''), NULLIF(trim(s.cover_image_url), '')),
  website_url = COALESCE(NULLIF(trim(t.website_url), ''), NULLIF(trim(s.website), '')),
  action_link = COALESCE(NULLIF(trim(t.action_link), ''), NULLIF(trim(s.cta_url), ''), NULLIF(trim(s.website), '')),
  instagram_url = COALESCE(NULLIF(trim(t.instagram_url), ''), NULLIF(trim(s.instagram_url), '')),
  facebook_url = COALESCE(NULLIF(trim(t.facebook_url), ''), NULLIF(trim(s.facebook_url), '')),
  is_verified = COALESCE(t.is_verified, FALSE) OR COALESCE(s.is_verified, FALSE),
  partnership_status = COALESCE(NULLIF(trim(t.partnership_status), ''), NULLIF(trim(s.partnership_status), ''))
FROM public.partner_spot_submissions s
WHERE s.published_establishment_id = t.id
   OR s.published_tool_id = t.id;

UPDATE public.partner_spot_submissions s
SET published_tool_id = s.published_establishment_id,
    published_establishment_id = NULL
WHERE s.published_establishment_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.tools t WHERE t.id = s.published_establishment_id);

-- Logo depuis photo primaire si manquant
UPDATE public.tools t
SET logo_url = tp.photo_url
FROM public.tool_photos tp
WHERE tp.tool_id = t.id
  AND tp.is_primary = TRUE
  AND (t.logo_url IS NULL OR trim(t.logo_url) = '');

-- Suppression des anciennes lignes outils dans establishments (+ photos en cascade si FK)
DELETE FROM public.establishment_photos ep
WHERE ep.establishment_id IN (SELECT id FROM public.tools);

DELETE FROM public.establishments e
WHERE e.id IN (SELECT id FROM public.tools);

-- -----------------------------------------------------------------------------
-- 3. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active tools" ON public.tools;
CREATE POLICY "Public read active tools"
  ON public.tools FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "Admin manage tools" ON public.tools;
CREATE POLICY "Admin manage tools"
  ON public.tools FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Public read tool photos" ON public.tool_photos;
CREATE POLICY "Public read tool photos"
  ON public.tool_photos FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admin manage tool photos" ON public.tool_photos;
CREATE POLICY "Admin manage tool photos"
  ON public.tool_photos FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. RPC création admin outil
-- -----------------------------------------------------------------------------
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
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  v_staff_id := public.ensure_partner_staff(v_admin_id);
  v_status := CASE WHEN COALESCE(p_payload->>'content_status', 'published') = 'draft' THEN 'draft' ELSE 'published' END;

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
    is_active
  ) VALUES (
    v_staff_id,
    COALESCE(p_payload->>'name', 'Sans nom'),
    COALESCE(p_payload->>'description', ''),
    NULLIF(trim(p_payload->>'tool_category'), ''),
    CASE
      WHEN jsonb_typeof(p_payload->'categories') = 'array'
        THEN ARRAY(SELECT trim(both '"' from elem::text) FROM jsonb_array_elements(p_payload->'categories') elem WHERE trim(both '"' from elem::text) <> '' AND trim(both '"' from elem::text) <> 'tools')
      ELSE '{}'::TEXT[]
    END,
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

GRANT EXECUTE ON FUNCTION public.admin_create_tool_direct(JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Publication partenaire : tools vs establishments
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
  v_slugs TEXT[];
  v_category_id INT;
  v_establishment_id UUID;
  v_tool_id UUID;
  v_photo TEXT;
  v_is_tool BOOLEAN;
BEGIN
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

  IF s.partner_user_id IS NULL THEN
    RAISE EXCEPTION 'partner_user_id manquant pour la soumission %', p_local_id;
  END IF;

  v_slugs := CASE
    WHEN s.category_slugs IS NOT NULL AND array_length(s.category_slugs, 1) > 0 THEN s.category_slugs
    ELSE ARRAY[s.sub_category]
  END;
  v_is_tool := (s.sub_category = 'tools') OR ('tools' = ANY (v_slugs));

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
    SET status = 'approved',
        published_tool_id = v_tool_id,
        published_establishment_id = NULL,
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
  SET status = 'approved',
      published_establishment_id = v_establishment_id,
      updated_at = NOW()
  WHERE local_id = p_local_id;

  RETURN v_establishment_id;
END;
$$;

-- Clics : establishments OU tools
CREATE OR REPLACE FUNCTION public.increment_spot_click(p_establishment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tools
  SET click_count = click_count + 1
  WHERE id = p_establishment_id;

  IF FOUND THEN
    RETURN;
  END IF;

  UPDATE public.establishments
  SET click_count = click_count + 1
  WHERE id = p_establishment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_spot_click(UUID) TO anon, authenticated;
