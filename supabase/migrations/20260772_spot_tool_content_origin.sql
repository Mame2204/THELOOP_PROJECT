-- Origine contenu spots / outils (admin | loop | partner) — aligné sur events.content_origin

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS content_origin TEXT;

ALTER TABLE public.tools
  ADD COLUMN IF NOT EXISTS content_origin TEXT;

COMMENT ON COLUMN public.establishments.content_origin IS 'Canal de création : admin, loop, partner.';
COMMENT ON COLUMN public.tools.content_origin IS 'Canal de création : admin, loop, partner.';

-- Rétro-remplissage partenaires
UPDATE public.establishments e
SET content_origin = 'partner'
FROM public.partner_spot_submissions s
WHERE s.published_establishment_id = e.id
  AND COALESCE(NULLIF(trim(e.content_origin), ''), '') = '';

UPDATE public.tools t
SET content_origin = 'partner'
FROM public.partner_spot_submissions s
WHERE s.published_tool_id = t.id
  AND COALESCE(NULLIF(trim(t.content_origin), ''), '') = '';

-- Le reste (créations équipe / seed) → admin
UPDATE public.establishments
SET content_origin = 'admin'
WHERE COALESCE(NULLIF(trim(content_origin), ''), '') = '';

UPDATE public.tools
SET content_origin = 'admin'
WHERE COALESCE(NULLIF(trim(content_origin), ''), '') = '';

-- Admin create establishment : persiste content_origin
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
  v_origin TEXT;
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
  v_origin := COALESCE(NULLIF(trim(p_payload->>'content_origin'), ''), 'admin');
  IF v_origin NOT IN ('admin', 'loop', 'partner') THEN
    v_origin := 'admin';
  END IF;

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
    content_status,
    content_origin,
    opening_hours_label,
    is_active
  ) VALUES (
    v_staff_id,
    COALESCE(p_payload->>'name', 'Sans nom'),
    v_category_id,
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

GRANT EXECUTE ON FUNCTION public.admin_create_establishment_direct(JSONB) TO authenticated;

-- Admin create tool : persiste content_origin
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
    content_origin,
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

GRANT EXECUTE ON FUNCTION public.admin_create_tool_direct(JSONB) TO authenticated;

-- Ne pas écraser une origine équipe (admin/loop) déjà posée
CREATE OR REPLACE FUNCTION public.trg_partner_spot_set_origin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.published_establishment_id IS NOT NULL THEN
    UPDATE public.establishments
    SET content_origin = 'partner'
    WHERE id = NEW.published_establishment_id
      AND COALESCE(content_origin, '') NOT IN ('admin', 'loop');
  END IF;
  IF NEW.published_tool_id IS NOT NULL THEN
    UPDATE public.tools
    SET content_origin = 'partner'
    WHERE id = NEW.published_tool_id
      AND COALESCE(content_origin, '') NOT IN ('admin', 'loop');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_spot_set_origin ON public.partner_spot_submissions;
CREATE TRIGGER trg_partner_spot_set_origin
  AFTER INSERT OR UPDATE OF published_establishment_id, published_tool_id
  ON public.partner_spot_submissions
  FOR EACH ROW
  WHEN (NEW.published_establishment_id IS NOT NULL OR NEW.published_tool_id IS NOT NULL)
  EXECUTE FUNCTION public.trg_partner_spot_set_origin();
