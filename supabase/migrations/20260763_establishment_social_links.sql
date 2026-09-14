-- Liens sociaux + site web persistés sur establishments (affichage fiche spot).

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS instagram_url TEXT,
  ADD COLUMN IF NOT EXISTS facebook_url TEXT;

COMMENT ON COLUMN public.establishments.website_url IS 'Site web du spot (formulaire partenaire).';
COMMENT ON COLUMN public.establishments.instagram_url IS 'Profil Instagram du spot.';
COMMENT ON COLUMN public.establishments.facebook_url IS 'Page Facebook du spot.';

-- Rétro-remplissage depuis les soumissions déjà publiées
UPDATE public.establishments e
SET
  website_url = COALESCE(NULLIF(trim(e.website_url), ''), NULLIF(trim(s.website), '')),
  instagram_url = COALESCE(NULLIF(trim(e.instagram_url), ''), NULLIF(trim(s.instagram_url), '')),
  facebook_url = COALESCE(NULLIF(trim(e.facebook_url), ''), NULLIF(trim(s.facebook_url), '')),
  action_link = COALESCE(NULLIF(trim(e.action_link), ''), NULLIF(trim(s.cta_url), ''), NULLIF(trim(s.website), ''))
FROM public.partner_spot_submissions s
WHERE s.published_establishment_id = e.id;

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
  v_slugs := CASE
    WHEN s.category_slugs IS NOT NULL AND array_length(s.category_slugs, 1) > 0 THEN s.category_slugs
    ELSE ARRAY[s.sub_category]
  END;
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
