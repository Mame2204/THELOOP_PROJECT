-- THE LOOP — Durcissement RLS (catalogue, utilisateurs, jetons SPOT, avantages Prime)
-- Corrige les alertes Supabase Security Advisor : tables ouvertes, fuite PII, contenu brouillon/prime.

-- =============================================================================
-- 1. Helpers rôle / catalogue
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_prime_member()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.user_role IN ('prime', 'admin', 'super_admin')
      AND u.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_partner_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.user_role IN ('partner', 'tool_partner', 'admin', 'super_admin')
      AND u.is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.partner_owns_master_id(p_master_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_master_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.partner_staff ps
      WHERE ps.id = p_master_id
        AND ps.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.partner_owns_content(p_master_id UUID, p_organizer_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.partner_owns_master_id(p_master_id)
    OR (p_organizer_id IS NOT NULL AND p_organizer_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_read_public_event(
  p_is_loop_x BOOLEAN,
  p_content_status TEXT,
  p_is_active BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(p_content_status, 'published') = 'published'
    AND COALESCE(p_is_active, TRUE) = TRUE
    AND (
      COALESCE(p_is_loop_x, FALSE) = FALSE
      OR public.is_prime_member()
      OR public.is_admin()
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_public_catalog_row(
  p_content_status TEXT,
  p_is_active BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(p_content_status, 'published') = 'published'
    AND COALESCE(p_is_active, TRUE) = TRUE;
$$;

CREATE OR REPLACE FUNCTION public.event_is_readable(p_event_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = p_event_id
      AND (
        public.can_read_public_event(e.is_loop_x, e.content_status, e.is_active)
        OR public.partner_owns_content(e.master_id, e.organizer_id)
        OR public.is_admin()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.establishment_is_readable(p_establishment_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.establishments e
    WHERE e.id = p_establishment_id
      AND (
        public.can_read_public_catalog_row(e.content_status, e.is_active)
        OR public.partner_owns_content(e.master_id, NULL)
        OR public.is_admin()
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.tool_is_readable(p_tool_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tools t
    WHERE t.id = p_tool_id
      AND (
        public.can_read_public_catalog_row(t.content_status, t.is_active)
        OR public.partner_owns_content(t.master_id, NULL)
        OR public.is_admin()
      )
  );
$$;

-- =============================================================================
-- 2. Catalogue — events / establishments / tools
-- =============================================================================

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read events" ON public.events;
DROP POLICY IF EXISTS "Public read published events" ON public.events;
CREATE POLICY "Members read published events"
  ON public.events FOR SELECT TO authenticated
  USING (public.can_read_public_event(is_loop_x, content_status, is_active));

DROP POLICY IF EXISTS "Partner read own events" ON public.events;
CREATE POLICY "Partner read own events"
  ON public.events FOR SELECT TO authenticated
  USING (public.partner_owns_content(master_id, organizer_id));

ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active establishments" ON public.establishments;
DROP POLICY IF EXISTS "Public read published establishments" ON public.establishments;
CREATE POLICY "Members read published establishments"
  ON public.establishments FOR SELECT TO authenticated
  USING (public.can_read_public_catalog_row(content_status, is_active));

DROP POLICY IF EXISTS "Partner read own establishments" ON public.establishments;
CREATE POLICY "Partner read own establishments"
  ON public.establishments FOR SELECT TO authenticated
  USING (public.partner_owns_content(master_id, NULL));

ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active tools" ON public.tools;
DROP POLICY IF EXISTS "Public read published tools" ON public.tools;
CREATE POLICY "Members read published tools"
  ON public.tools FOR SELECT TO authenticated
  USING (public.can_read_public_catalog_row(content_status, is_active));

DROP POLICY IF EXISTS "Partner read own tools" ON public.tools;
CREATE POLICY "Partner read own tools"
  ON public.tools FOR SELECT TO authenticated
  USING (public.partner_owns_content(master_id, NULL));

-- Tables enfants : visibles seulement si le parent est lisible
DO $$ BEGIN
  IF to_regclass('public.event_speakers') IS NOT NULL THEN
    ALTER TABLE public.event_speakers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read event speakers" ON public.event_speakers;
    CREATE POLICY "Read speakers for visible events"
      ON public.event_speakers FOR SELECT TO authenticated
      USING (public.event_is_readable(event_id));
  END IF;

  IF to_regclass('public.event_schedules') IS NOT NULL THEN
    ALTER TABLE public.event_schedules ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read event schedules" ON public.event_schedules;
    CREATE POLICY "Read schedules for visible events"
      ON public.event_schedules FOR SELECT TO authenticated
      USING (public.event_is_readable(event_id));
  END IF;

  IF to_regclass('public.event_categories') IS NOT NULL THEN
    ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read event categories" ON public.event_categories;
    CREATE POLICY "Read categories for visible events"
      ON public.event_categories FOR SELECT TO authenticated
      USING (public.event_is_readable(event_id));
  END IF;

  IF to_regclass('public.establishment_photos') IS NOT NULL THEN
    ALTER TABLE public.establishment_photos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read establishment photos" ON public.establishment_photos;
    CREATE POLICY "Read photos for visible establishments"
      ON public.establishment_photos FOR SELECT TO authenticated
      USING (public.establishment_is_readable(establishment_id));
  END IF;

  IF to_regclass('public.establishment_schedules') IS NOT NULL THEN
    ALTER TABLE public.establishment_schedules ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read establishment schedules" ON public.establishment_schedules;
    CREATE POLICY "Read schedules for visible establishments"
      ON public.establishment_schedules FOR SELECT TO authenticated
      USING (public.establishment_is_readable(establishment_id));
  END IF;

  IF to_regclass('public.establishment_categories') IS NOT NULL THEN
    ALTER TABLE public.establishment_categories ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read establishment categories" ON public.establishment_categories;
    CREATE POLICY "Read categories for visible establishments"
      ON public.establishment_categories FOR SELECT TO authenticated
      USING (public.establishment_is_readable(establishment_id));
  END IF;

  IF to_regclass('public.tool_photos') IS NOT NULL THEN
    ALTER TABLE public.tool_photos ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Public read tool photos" ON public.tool_photos;
    CREATE POLICY "Read photos for visible tools"
      ON public.tool_photos FOR SELECT TO authenticated
      USING (public.tool_is_readable(tool_id));
  END IF;
END $$;

-- =============================================================================
-- 3. Utilisateurs — propre ligne uniquement (+ admin). Pas d'annuaire global.
-- =============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read active user names" ON public.users;
DROP POLICY IF EXISTS "Users read public directory" ON public.users;
DROP POLICY IF EXISTS "Authenticated read partner directory" ON public.users;

-- =============================================================================
-- 4. Jetons SPOT — plus de lecture publique des codes
-- =============================================================================

ALTER TABLE public.partner_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read active partner tokens" ON public.partner_tokens;
DROP POLICY IF EXISTS "Admin manage partner tokens" ON public.partner_tokens;
CREATE POLICY "Admin manage partner tokens"
  ON public.partner_tokens FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.validate_partner_spot_token(p_code TEXT)
RETURNS TABLE (
  token_id UUID,
  partner_name TEXT,
  expires_at TIMESTAMPTZ,
  user_id UUID,
  linked_email TEXT,
  first_name TEXT,
  last_name TEXT,
  company TEXT,
  phone_number TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := upper(trim(COALESCE(p_code, '')));
BEGIN
  IF v_code = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pt.id,
    pt.partner_name,
    pt.expires_at,
    pt.user_id,
    u.email::TEXT,
    u.first_name::TEXT,
    u.last_name::TEXT,
    COALESCE(NULLIF(trim(u.company), ''), pt.partner_name)::TEXT,
    u.phone_number::TEXT
  FROM public.partner_tokens pt
  LEFT JOIN public.users u ON u.id = pt.user_id
  WHERE pt.token_code = v_code
    AND pt.status = 'active'
    AND pt.expires_at > NOW()
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_partner_token_directory()
RETURNS TABLE (
  user_id UUID,
  partner_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pt.user_id, pt.partner_name
  FROM public.partner_tokens pt
  WHERE pt.status = 'active'
    AND pt.expires_at > NOW()
    AND pt.user_id IS NOT NULL
  ORDER BY pt.partner_name
  LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.validate_partner_spot_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_partner_token_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_partner_spot_token(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_partner_token_directory() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_partner_token_user_id(p_token_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pt.user_id
  FROM public.partner_tokens pt
  WHERE pt.id = p_token_id
    AND pt.status = 'active'
    AND pt.expires_at > NOW()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_partner_token_user_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_partner_token_user_id(UUID) TO anon, authenticated, service_role;

-- =============================================================================
-- 5. Codes validation partenaire — RPC uniquement
-- =============================================================================

ALTER TABLE public.partner_validation_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read partner validation codes" ON public.partner_validation_codes;
DROP POLICY IF EXISTS "Service manage partner validation codes" ON public.partner_validation_codes;

DROP POLICY IF EXISTS "Admin manage partner validation codes" ON public.partner_validation_codes;
CREATE POLICY "Admin manage partner validation codes"
  ON public.partner_validation_codes FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- 6. Avantages Prime — retirer l'accès anon direct
-- =============================================================================

ALTER TABLE public.prime_benefit_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon read benefit grants by user" ON public.prime_benefit_grants;

CREATE OR REPLACE FUNCTION public.fetch_member_benefit_grants_public(p_user_id UUID)
RETURNS SETOF public.prime_benefit_grants
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.*
  FROM public.prime_benefit_grants g
  WHERE g.user_id = p_user_id
    AND g.status IN ('active', 'pending_validation')
  ORDER BY g.granted_at DESC
  LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.fetch_member_benefit_grants_public(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_member_benefit_grants_public(UUID) TO anon, authenticated, service_role;

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
  v_prev public.prime_benefit_grants%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_user_id
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_prev
  FROM public.prime_benefit_grants
  WHERE local_id = p_local_id
  LIMIT 1;

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
) TO authenticated, service_role;

-- benefit_redemptions : retirer l'accès anon direct (RPC SECURITY DEFINER existantes)
ALTER TABLE public.benefit_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon insert benefit redemptions" ON public.benefit_redemptions;
DROP POLICY IF EXISTS "Anon read pending benefit redemptions" ON public.benefit_redemptions;
DROP POLICY IF EXISTS "Anon update pending benefit redemptions" ON public.benefit_redemptions;

-- =============================================================================
-- 7. Contenus légaux + partner_staff
-- =============================================================================

ALTER TABLE public.app_legal_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read legal content" ON public.app_legal_content;
CREATE POLICY "Public read legal content"
  ON public.app_legal_content FOR SELECT TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "Admin manage legal content" ON public.app_legal_content;
CREATE POLICY "Admin manage legal content"
  ON public.app_legal_content FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DO $$ BEGIN
  IF to_regclass('public.partner_staff') IS NOT NULL THEN
    ALTER TABLE public.partner_staff ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Partner read own staff" ON public.partner_staff;
    CREATE POLICY "Partner read own staff"
      ON public.partner_staff FOR SELECT TO authenticated
      USING (user_id = auth.uid() OR public.is_admin());

    DROP POLICY IF EXISTS "Authenticated resolve partner staff" ON public.partner_staff;

    DROP POLICY IF EXISTS "Admin manage partner staff" ON public.partner_staff;
    CREATE POLICY "Admin manage partner staff"
      ON public.partner_staff FOR ALL TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.resolve_partner_staff_user_id(p_staff_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ps.user_id
  FROM public.partner_staff ps
  WHERE ps.id = p_staff_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_partner_staff_user_id(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_partner_staff_user_id(UUID) TO authenticated, service_role;

-- =============================================================================
-- 8. Attributions paliers partenaire
-- =============================================================================

DO $$ BEGIN
  IF to_regclass('public.partner_member_attributions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Service insert member attributions" ON public.partner_member_attributions;
    DROP POLICY IF EXISTS "Admin read member attributions" ON public.partner_member_attributions;

    CREATE POLICY "Admin read member attributions"
      ON public.partner_member_attributions FOR SELECT TO authenticated
      USING (public.is_admin());

    CREATE POLICY "Partners read own member attributions"
      ON public.partner_member_attributions FOR SELECT TO authenticated
      USING (
        public.is_admin()
        OR EXISTS (
          SELECT 1
          FROM public.partner_validation_codes pvc
          WHERE pvc.partner_key = partner_member_attributions.partner_key
            AND pvc.user_id = auth.uid()
        )
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_partner_member_attribution(
  p_partner_key TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_partner_key IS NULL OR trim(p_partner_key) = '' OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.partner_member_attributions (partner_key, user_id)
  VALUES (trim(p_partner_key), p_user_id)
  ON CONFLICT (partner_key, user_id) DO NOTHING;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_partner_member_attribution(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_partner_member_attribution(TEXT, UUID) TO anon, authenticated, service_role;

-- =============================================================================
-- 9. Storage content-media — upload dans son dossier, suppression admin
-- =============================================================================

DROP POLICY IF EXISTS "Authenticated upload content media" ON storage.objects;
CREATE POLICY "Authenticated upload own content media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-media'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[2] = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS "Authenticated delete content media" ON storage.objects;
CREATE POLICY "Admin delete content media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'content-media' AND public.is_admin());

DROP POLICY IF EXISTS "Authenticated update content media" ON storage.objects;
CREATE POLICY "Admin update content media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'content-media' AND public.is_admin())
  WITH CHECK (bucket_id = 'content-media' AND public.is_admin());
