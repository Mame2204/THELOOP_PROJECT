-- THE LOOP — Durcissement Security Advisor (WARN)
-- 1. Retire EXECUTE anon sur RPC sensibles (allowlist flux guest)
-- 2. Bloque RPC trigger/internal pour anon + authenticated
-- 3. Corrige search_path mutable (7 fonctions)
-- 4. RLS home_poll_votes + partner_milestone_rewards
-- 5. Storage content-media : pas de listing global
-- 6. Policies referral (INFO)
--
-- NOTE dashboard (hors SQL) : Auth → Email → activer « Leaked password protection »

-- =============================================================================
-- 1. Allowlist RPC anon (validation avantage, inscription, invitation invité)
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  v_allow_anon TEXT[] := ARRAY[
    'check_signup_email_available',
    'assert_signup_email_allowed',
    'find_pending_admin_invite_by_email',
    'mark_admin_user_invite_activated',
    'apply_partner_benefit_validation',
    'list_partner_pending_validations',
    'list_member_pending_benefit_redemptions',
    'request_benefit_redemption',
    'verify_member_qr_payload',
    'verify_member_qr_partner',
    'find_partner_by_validation_code',
    'validate_partner_spot_token',
    'fetch_member_benefit_grants_public',
    'record_partner_member_attribution',
    'resolve_partner_token_user_id',
    'upsert_prime_benefit_grant'
  ];
  v_block_api TEXT[] := ARRAY[
    'handle_new_auth_user',
    'sync_published_event_links_from_submission',
    'trg_favorite_events_count',
    'trg_favorite_spots_count',
    'trg_favorite_tools_count',
    'trg_favorite_walks_count',
    'trg_partner_spot_set_origin'
  ];
BEGIN
  FOR r IN
    SELECT
      p.oid,
      p.proname AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.oid::regprocedure);

    IF r.name = ANY(v_block_api) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', r.oid::regprocedure);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.oid::regprocedure);
      CONTINUE;
    END IF;

    IF r.name = ANY(v_allow_anon) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role',
        r.oid::regprocedure
      );
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.oid::regprocedure);
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role',
      r.oid::regprocedure
    );
  END LOOP;
END $$;

-- =============================================================================
-- 2. search_path fix (Function Search Path Mutable)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.infer_country_code_from_phone(p_phone TEXT)
RETURNS CHAR(2)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  digits TEXT;
BEGIN
  IF p_phone IS NULL OR trim(p_phone) = '' THEN
    RETURN 'GN';
  END IF;
  digits := regexp_replace(p_phone, '\D', '', 'g');
  IF digits LIKE '224%' THEN RETURN 'GN'; END IF;
  IF digits LIKE '221%' THEN RETURN 'SN'; END IF;
  IF digits LIKE '225%' THEN RETURN 'CI'; END IF;
  IF digits LIKE '223%' THEN RETURN 'ML'; END IF;
  IF digits LIKE '226%' THEN RETURN 'BF'; END IF;
  IF digits LIKE '229%' THEN RETURN 'BJ'; END IF;
  IF digits LIKE '228%' THEN RETURN 'TG'; END IF;
  IF digits LIKE '227%' THEN RETURN 'NE'; END IF;
  IF digits LIKE '222%' THEN RETURN 'MR'; END IF;
  IF digits LIKE '231%' THEN RETURN 'LR'; END IF;
  IF digits LIKE '232%' THEN RETURN 'SL'; END IF;
  IF digits LIKE '233%' THEN RETURN 'GH'; END IF;
  RETURN 'GN';
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_public_catalog_row(
  p_content_status TEXT,
  p_is_active BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(p_content_status, 'published') = 'published'
    AND COALESCE(p_is_active, TRUE) = TRUE;
$$;

CREATE OR REPLACE FUNCTION public.format_guinea_location_label(
  p_commune TEXT,
  p_district TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN NULLIF(trim(p_district), '') IS NULL THEN trim(p_commune)
    ELSE trim(p_commune) || ' · ' || trim(p_district)
  END;
$$;

CREATE OR REPLACE FUNCTION public.extract_category_slugs(
  p_payload JSONB,
  p_single_key TEXT,
  p_fallback TEXT
)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_slugs TEXT[];
BEGIN
  IF jsonb_typeof(p_payload->'categories') = 'array' AND jsonb_array_length(p_payload->'categories') > 0 THEN
    SELECT COALESCE(array_agg(trim(both '"' from elem::text)), ARRAY[]::TEXT[])
    INTO v_slugs
    FROM jsonb_array_elements(p_payload->'categories') AS elem
    WHERE trim(both '"' from elem::text) <> '';
    IF array_length(v_slugs, 1) > 0 THEN
      RETURN v_slugs;
    END IF;
  END IF;

  IF p_payload->>p_single_key IS NOT NULL AND trim(p_payload->>p_single_key) <> '' THEN
    RETURN ARRAY[trim(p_payload->>p_single_key)];
  END IF;

  RETURN ARRAY[COALESCE(NULLIF(trim(p_fallback), ''), 'corporate')];
END;
$$;

CREATE OR REPLACE FUNCTION public.set_partnership_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_community_suggestions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_partner_milestone_rules_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 3. RLS — votes sondage (INSERT seulement si poll actif)
-- =============================================================================

DROP POLICY IF EXISTS "Anyone insert home poll vote" ON public.home_poll_votes;
CREATE POLICY "Insert vote on active poll"
  ON public.home_poll_votes FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.home_polls hp
      WHERE hp.id = poll_id
        AND hp.is_active = TRUE
    )
  );

-- =============================================================================
-- 4. RLS — récompenses paliers (plus d'INSERT ouvert ; app = stockage local)
-- =============================================================================

DROP POLICY IF EXISTS "Service manage milestone rewards" ON public.partner_milestone_rewards;

-- =============================================================================
-- 5. RLS — parrainage (INFO : tables verrouillées → policies explicites)
-- =============================================================================

DROP POLICY IF EXISTS "Users read own referrals" ON public.referrals;
CREATE POLICY "Users read own referrals"
  ON public.referrals FOR SELECT TO authenticated
  USING (
    referrer_user_id = auth.uid()
    OR referred_user_id = auth.uid()
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admin manage referrals" ON public.referrals;
CREATE POLICY "Admin manage referrals"
  ON public.referrals FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users read own referral rewards" ON public.referral_rewards;
CREATE POLICY "Users read own referral rewards"
  ON public.referral_rewards FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admin manage referral rewards" ON public.referral_rewards;
CREATE POLICY "Admin manage referral rewards"
  ON public.referral_rewards FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- =============================================================================
-- 6. Storage — URLs publiques OK, listing API bloqué
-- =============================================================================

-- Bucket public : aucune policy SELECT (URLs directes OK, pas de listing API)
DROP POLICY IF EXISTS "Public read content media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read content media object" ON storage.objects;
