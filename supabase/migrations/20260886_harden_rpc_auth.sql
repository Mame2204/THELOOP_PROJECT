-- THE LOOP — Durcissement RPC (prod interne)
-- Sans casser : validation QR partenaire (anon update grants existants),
-- soumissions partenaire (owner = auth.uid()), notify_user (admin / self / partner lié).

-- ---------------------------------------------------------------------------
-- 1) Helper : ownership soumission partenaire
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_partner_submission_actor(p_partner_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_partner_user_id IS NULL OR auth.uid() <> p_partner_user_id THEN
    RAISE EXCEPTION 'Non autorisé : soumission partenaire';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_partner_submission_actor(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_partner_submission_actor(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) upsert_partner_spot_submission — garde ownership
-- ---------------------------------------------------------------------------
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
  v_slugs TEXT[];
  v_sub TEXT;
  v_is_tool BOOLEAN;
  v_status TEXT;
  v_origin TEXT;
BEGIN
  PERFORM public.assert_partner_submission_actor(p_partner_user_id);

  v_slugs := public.extract_category_slugs(p_payload, 'sub_category', 'fine_dining');
  v_sub := COALESCE(NULLIF(trim(p_payload->>'sub_category'), ''), v_slugs[1], 'fine_dining');
  v_is_tool :=
    (v_sub = 'tools')
    OR ('tools' = ANY (v_slugs))
    OR (NULLIF(trim(p_payload->>'tool_category'), '') IS NOT NULL);

  IF v_is_tool THEN
    v_sub := 'tools';
    IF v_slugs IS NULL OR array_length(v_slugs, 1) IS NULL OR NOT ('tools' = ANY (v_slugs)) THEN
      v_slugs := ARRAY['tools'] || COALESCE(v_slugs, ARRAY[]::TEXT[]);
    END IF;
  END IF;

  v_status := COALESCE(NULLIF(trim(p_status), ''), 'pending');
  IF v_status NOT IN ('draft', 'pending', 'rejected') THEN
    v_status := 'pending';
  END IF;

  v_origin := COALESCE(NULLIF(trim(p_payload->>'content_origin'), ''), 'partner');
  IF v_origin NOT IN ('admin', 'loop', 'partner') THEN
    v_origin := 'partner';
  END IF;

  INSERT INTO public.partner_spot_submissions (
    local_id, partner_user_id, partner_name, name, description, address, district,
    sub_category, category_slugs, phone, website, logo_url, cover_image_url, gallery_images,
    opening_hours, price_label, instagram_url, facebook_url, cta_url, organizer_name,
    country_code, tool_category, developer, is_verified, partnership_status, content_origin,
    status, updated_at
  ) VALUES (
    p_local_id, p_partner_user_id, p_partner_name,
    COALESCE(p_payload->>'name', 'Sans nom'),
    COALESCE(p_payload->>'description', ''),
    COALESCE(p_payload->>'address', ''),
    p_payload->>'district', v_sub, v_slugs,
    p_payload->>'phone', p_payload->>'website', p_payload->>'logo_url',
    p_payload->>'cover_image_url', COALESCE(p_payload->'gallery_images', '[]'::jsonb),
    p_payload->>'opening_hours', p_payload->>'price_label',
    p_payload->>'instagram_url', p_payload->>'facebook_url', p_payload->>'cta_url',
    p_payload->>'organizer_name', COALESCE(p_payload->>'country_code', 'GN'),
    p_payload->>'tool_category', p_payload->>'developer',
    COALESCE((p_payload->>'is_verified')::boolean, FALSE),
    p_payload->>'partnership_status', v_origin, v_status, NOW()
  )
  ON CONFLICT (local_id) DO UPDATE SET
    partner_name = EXCLUDED.partner_name,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    address = EXCLUDED.address,
    district = EXCLUDED.district,
    sub_category = EXCLUDED.sub_category,
    category_slugs = EXCLUDED.category_slugs,
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
    content_origin = EXCLUDED.content_origin,
    status = CASE
      WHEN partner_spot_submissions.status = 'approved' THEN partner_spot_submissions.status
      ELSE EXCLUDED.status
    END,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) upsert_partner_event_submission — garde ownership
-- ---------------------------------------------------------------------------
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
  PERFORM public.assert_partner_submission_actor(p_partner_user_id);

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
    local_id, partner_user_id, partner_name, master_user_id, title, description, program,
    category, category_slugs, starts_at, ends_at, venue_name, venue_address, venue_location,
    guinea_location_id, spot_id, entry_price, is_invitation_only, currency, info_url,
    instagram_url, facebook_url, website_url, cover_image_url, gallery_images, organizer_name,
    country_code, content_origin, speakers, status, updated_at
  ) VALUES (
    p_local_id, p_partner_user_id, p_partner_name, p_master_user_id,
    COALESCE(p_payload->>'title', 'Sans titre'),
    COALESCE(p_payload->>'description', ''),
    p_payload->>'program',
    v_slugs[1], v_slugs,
    COALESCE((p_payload->>'starts_at')::timestamptz, NOW()),
    NULLIF(p_payload->>'ends_at', '')::timestamptz,
    COALESCE(p_payload->>'venue_name', ''),
    p_payload->>'venue_address',
    v_venue_location, v_guinea_id, p_payload->>'spot_id',
    NULLIF(p_payload->>'entry_price', '')::int,
    COALESCE((p_payload->>'is_invitation_only')::boolean, FALSE),
    COALESCE(p_payload->>'currency', 'GNF'),
    p_payload->>'info_url', p_payload->>'instagram_url', p_payload->>'facebook_url',
    p_payload->>'website_url', p_payload->>'cover_image_url',
    COALESCE(p_payload->'gallery_images', '[]'::jsonb),
    p_payload->>'organizer_name',
    COALESCE(p_payload->>'country_code', 'GN'),
    COALESCE(NULLIF(trim(p_payload->>'content_origin'), ''), 'partner'),
    v_speakers, COALESCE(p_status, 'pending'), NOW()
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

-- ---------------------------------------------------------------------------
-- 4) upsert_prime_benefit_grant
--    - authenticated : self ou admin
--    - anon (QR validation) : UPDATE d’un grant existant seulement (pas de création)
--    - service_role : full
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_prime_benefit_grant(
  p_local_id TEXT,
  p_user_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_partner_name TEXT,
  p_status TEXT,
  p_granted_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_used_at TIMESTAMPTZ,
  p_grant_audience TEXT,
  p_grant_country_code TEXT DEFAULT NULL,
  p_grant_city TEXT DEFAULT NULL,
  p_catalog_local_id TEXT DEFAULT NULL,
  p_role_entitlement TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_jwt_role TEXT := COALESCE(auth.role(), 'anon');
BEGIN
  IF v_jwt_role = 'service_role' THEN
    NULL;
  ELSIF auth.uid() IS NOT NULL THEN
    IF auth.uid() <> p_user_id AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  ELSE
    -- Client anon (validation partenaire) : jamais de création ex nihilo
    IF p_local_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.prime_benefit_grants g WHERE g.local_id = p_local_id
    ) THEN
      RAISE EXCEPTION 'forbidden: création d''octroi réservée';
    END IF;
    IF COALESCE(p_status, '') NOT IN ('used', 'active', 'pending_validation', 'expired_unused') THEN
      RAISE EXCEPTION 'forbidden: statut anon non autorisé';
    END IF;
  END IF;

  INSERT INTO public.prime_benefit_grants (
    local_id, user_id, title, description, partner_name,
    status, granted_at, expires_at, used_at, grant_audience,
    grant_country_code, grant_city, catalog_local_id, role_entitlement
  ) VALUES (
    p_local_id, p_user_id, p_title, p_description, p_partner_name,
    p_status, p_granted_at, p_expires_at, p_used_at, p_grant_audience,
    p_grant_country_code, p_grant_city, p_catalog_local_id, p_role_entitlement
  )
  ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    partner_name = EXCLUDED.partner_name,
    status = CASE
      WHEN public.prime_benefit_grants.status = 'used'
        AND EXCLUDED.status IN ('active', 'pending_validation')
        THEN public.prime_benefit_grants.status
      ELSE EXCLUDED.status
    END,
    expires_at = EXCLUDED.expires_at,
    used_at = COALESCE(EXCLUDED.used_at, public.prime_benefit_grants.used_at),
    grant_audience = EXCLUDED.grant_audience,
    grant_country_code = EXCLUDED.grant_country_code,
    grant_city = EXCLUDED.grant_city,
    catalog_local_id = COALESCE(EXCLUDED.catalog_local_id, public.prime_benefit_grants.catalog_local_id),
    role_entitlement = EXCLUDED.role_entitlement
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_prime_benefit_grant(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_prime_benefit_grant(
  TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5) notify_user — admin / self / partenaire avec lien redemption ou grant
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id UUID,
  p_title TEXT,
  p_message TEXT,
  p_audience TEXT DEFAULT 'individual',
  p_recipient_phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_role TEXT;
  v_ok BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requis';
  END IF;

  SELECT user_role INTO v_role FROM public.users WHERE id = auth.uid() LIMIT 1;

  IF public.is_admin() OR auth.uid() = p_user_id THEN
    v_ok := TRUE;
  ELSIF v_role IN ('partner', 'tool_partner') THEN
    -- Évite le spam arbitraire : uniquement si activité avantages récente sur ce membre
    SELECT EXISTS (
      SELECT 1
      FROM public.benefit_redemptions r
      WHERE r.user_id = p_user_id
        AND r.status IN ('pending', 'validated')
        AND r.created_at > NOW() - INTERVAL '30 days'
      LIMIT 1
    ) OR EXISTS (
      SELECT 1
      FROM public.prime_benefit_grants g
      WHERE g.user_id = p_user_id
        AND g.status IN ('pending_validation', 'used', 'active')
        AND COALESCE(g.used_at, g.granted_at) > NOW() - INTERVAL '30 days'
      LIMIT 1
    ) INTO v_ok;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Non autorisé';
  END IF;

  INSERT INTO public.user_notifications (
    user_id, recipient_phone, title, message, audience, sent_at
  ) VALUES (
    p_user_id,
    NULLIF(trim(COALESCE(p_recipient_phone, '')), ''),
    COALESCE(NULLIF(trim(p_title), ''), 'Notification'),
    COALESCE(p_message, ''),
    COALESCE(NULLIF(trim(p_audience), ''), 'individual'),
    NOW()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_user(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.assert_partner_submission_actor(UUID) IS
  'Garantit que seul le partenaire propriétaire (ou admin) peut upsert une soumission.';
