-- THE LOOP — Offres avantages partenaire (validation catalogue multi-appareils)
-- Table + RPC admin/partenaire (sync mobile admin ↔ espace partenaire)
--
-- Si erreur 42501 (permission denied for schema public) :
-- n'exécutez PAS ce fichier. Utilisez plutôt :
--   supabase/scripts/partner_benefit_offers_rpc_only.sql
-- (RPC uniquement, sans CREATE TABLE — suffit pour la validation partenaire)

-- -----------------------------------------------------------------------------
-- 1. Table partner_benefit_offers
-- -----------------------------------------------------------------------------CREATE TABLE IF NOT EXISTS public.partner_benefit_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id TEXT NOT NULL UNIQUE,
  partner_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  partner_name TEXT NOT NULL DEFAULT 'Partenaire',
  catalog_local_id TEXT NOT NULL,
  catalog_title TEXT NOT NULL,
  catalog_description TEXT NOT NULL DEFAULT '',
  country_code CHAR(2) NOT NULL DEFAULT 'GN',
  city TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'auto_accepted', 'disabled')),
  admin_note TEXT,
  partner_response_note TEXT,
  content_id TEXT,
  content_type TEXT,
  content_title TEXT,
  default_validity_days INTEGER,
  benefit_kind TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  validation_deadline_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partner_benefit_offers_partner
  ON public.partner_benefit_offers(partner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_partner_benefit_offers_catalog
  ON public.partner_benefit_offers(catalog_local_id);

ALTER TABLE public.partner_benefit_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partner read own benefit offers" ON public.partner_benefit_offers;
CREATE POLICY "Partner read own benefit offers"
  ON public.partner_benefit_offers FOR SELECT TO authenticated
  USING (partner_user_id = auth.uid());

DROP POLICY IF EXISTS "Admin read all partner benefit offers" ON public.partner_benefit_offers;
CREATE POLICY "Admin read all partner benefit offers"
  ON public.partner_benefit_offers FOR SELECT TO authenticated
  USING (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. Helper : partenaire listé dans offering_partners
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_listed_in_offering_partners(
  p_offering_partners JSONB,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(p_offering_partners, '[]'::jsonb)) elem
    WHERE elem->>'partnerId' = p_user_id::text
       OR elem->>'partnerId' = 'user:' || p_user_id::text
       OR (
         elem->>'partnerId' LIKE 'user:%'
         AND split_part(elem->>'partnerId', ':', 2) = p_user_id::text
       )
  );
$$;

-- -----------------------------------------------------------------------------
-- 3. RPC — liste pour le partenaire connecté (table + fallback catalogue inactif)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_partner_benefit_offers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_offers JSONB := '[]'::jsonb;
  v_catalog JSONB := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'local_id', o.local_id,
        'partner_user_id', o.partner_user_id,
        'partner_name', o.partner_name,
        'catalog_local_id', o.catalog_local_id,
        'catalog_title', o.catalog_title,
        'catalog_description', o.catalog_description,
        'country_code', o.country_code,
        'city', o.city,
        'status', o.status,
        'admin_note', o.admin_note,
        'partner_response_note', o.partner_response_note,
        'content_id', o.content_id,
        'content_type', o.content_type,
        'content_title', o.content_title,
        'default_validity_days', o.default_validity_days,
        'benefit_kind', o.benefit_kind,
        'created_at', o.created_at,
        'responded_at', o.responded_at,
        'validation_deadline_at', o.validation_deadline_at,
        'updated_at', o.updated_at
      )
      ORDER BY o.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO v_offers
  FROM public.partner_benefit_offers o
  WHERE o.partner_user_id = v_uid;

  -- Compléter avec le catalogue inactif non encore synchronisé en offre
  SELECT COALESCE(
    jsonb_agg(row_data ORDER BY (row_data->>'created_at') DESC),
    '[]'::jsonb
  )
  INTO v_catalog
  FROM (
    SELECT jsonb_build_object(
      'local_id', 'pending-' || bc.local_id,
      'partner_user_id', v_uid,
      'partner_name', COALESCE(elem->>'displayName', 'Partenaire'),
      'catalog_local_id', bc.local_id,
      'catalog_title', bc.title,
      'catalog_description', bc.description,
      'country_code', COALESCE(bc.country_code, 'GN'),
      'city', bc.city,
      'status', 'pending',
      'admin_note', NULL,
      'partner_response_note', NULL,
      'content_id', elem->>'contentId',
      'content_type', elem->>'contentType',
      'content_title', elem->>'contentTitle',
      'default_validity_days', bc.default_validity_days,
      'benefit_kind', bc.benefit_kind,
      'created_at', bc.updated_at,
      'responded_at', NULL,
      'validation_deadline_at', bc.updated_at,
      'updated_at', bc.updated_at
    ) AS row_data
    FROM public.benefit_catalog bc
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(bc.offering_partners, '[]'::jsonb)) elem
    WHERE bc.is_active = FALSE
      AND bc.local_id IS NOT NULL
      AND public.partner_listed_in_offering_partners(bc.offering_partners, v_uid)
      AND (
        elem->>'partnerId' = v_uid::text
        OR elem->>'partnerId' = 'user:' || v_uid::text
        OR (
          elem->>'partnerId' LIKE 'user:%'
          AND split_part(elem->>'partnerId', ':', 2) = v_uid::text
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.partner_benefit_offers existing
        WHERE existing.partner_user_id = v_uid
          AND existing.catalog_local_id = bc.local_id
      )
  ) sub;

  IF jsonb_array_length(v_catalog) = 0 THEN
    RETURN v_offers;
  END IF;

  IF jsonb_array_length(v_offers) = 0 THEN
    RETURN v_catalog;
  END IF;

  RETURN v_offers || v_catalog;
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_partner_benefit_offers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_partner_benefit_offers() TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. RPC — liste admin
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_admin_partner_benefit_offers(p_country_code TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'local_id', o.local_id,
          'partner_user_id', o.partner_user_id,
          'partner_name', o.partner_name,
          'catalog_local_id', o.catalog_local_id,
          'catalog_title', o.catalog_title,
          'catalog_description', o.catalog_description,
          'country_code', o.country_code,
          'city', o.city,
          'status', o.status,
          'admin_note', o.admin_note,
          'partner_response_note', o.partner_response_note,
          'content_id', o.content_id,
          'content_type', o.content_type,
          'content_title', o.content_title,
          'default_validity_days', o.default_validity_days,
          'benefit_kind', o.benefit_kind,
          'created_at', o.created_at,
          'responded_at', o.responded_at,
          'validation_deadline_at', o.validation_deadline_at,
          'updated_at', o.updated_at
        )
        ORDER BY o.created_at DESC
      )
      FROM public.partner_benefit_offers o
      WHERE p_country_code IS NULL OR o.country_code = p_country_code
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_partner_benefit_offers(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_partner_benefit_offers(TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. RPC — upsert admin
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_upsert_partner_benefit_offer(p_row JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_id TEXT := NULLIF(trim(COALESCE(p_row->>'local_id', '')), '');
  v_partner_user_id UUID := NULLIF(trim(COALESCE(p_row->>'partner_user_id', '')), '')::uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  IF v_local_id IS NULL OR v_partner_user_id IS NULL THEN
    RAISE EXCEPTION 'local_id et partner_user_id requis';
  END IF;

  INSERT INTO public.partner_benefit_offers (
    local_id,
    partner_user_id,
    partner_name,
    catalog_local_id,
    catalog_title,
    catalog_description,
    country_code,
    city,
    status,
    admin_note,
    partner_response_note,
    content_id,
    content_type,
    content_title,
    default_validity_days,
    benefit_kind,
    created_at,
    responded_at,
    validation_deadline_at,
    updated_at
  ) VALUES (
    v_local_id,
    v_partner_user_id,
    COALESCE(NULLIF(trim(p_row->>'partner_name'), ''), 'Partenaire'),
    COALESCE(NULLIF(trim(p_row->>'catalog_local_id'), ''), ''),
    COALESCE(NULLIF(trim(p_row->>'catalog_title'), ''), 'Avantage'),
    COALESCE(p_row->>'catalog_description', ''),
    COALESCE(NULLIF(trim(p_row->>'country_code'), ''), 'GN'),
    NULLIF(trim(COALESCE(p_row->>'city', '')), ''),
    COALESCE(NULLIF(trim(p_row->>'status'), ''), 'pending'),
    NULLIF(trim(COALESCE(p_row->>'admin_note', '')), ''),
    NULLIF(trim(COALESCE(p_row->>'partner_response_note', '')), ''),
    NULLIF(trim(COALESCE(p_row->>'content_id', '')), ''),
    NULLIF(trim(COALESCE(p_row->>'content_type', '')), ''),
    NULLIF(trim(COALESCE(p_row->>'content_title', '')), ''),
    NULLIF(p_row->>'default_validity_days', '')::INT,
    NULLIF(trim(COALESCE(p_row->>'benefit_kind', '')), ''),
    COALESCE((p_row->>'created_at')::timestamptz, NOW()),
    NULLIF(p_row->>'responded_at', '')::timestamptz,
    COALESCE((p_row->>'validation_deadline_at')::timestamptz, NOW()),
    NOW()
  )
  ON CONFLICT (local_id) DO UPDATE SET
    partner_user_id = EXCLUDED.partner_user_id,
    partner_name = EXCLUDED.partner_name,
    catalog_local_id = EXCLUDED.catalog_local_id,
    catalog_title = EXCLUDED.catalog_title,
    catalog_description = EXCLUDED.catalog_description,
    country_code = EXCLUDED.country_code,
    city = EXCLUDED.city,
    status = EXCLUDED.status,
    admin_note = EXCLUDED.admin_note,
    partner_response_note = EXCLUDED.partner_response_note,
    content_id = EXCLUDED.content_id,
    content_type = EXCLUDED.content_type,
    content_title = EXCLUDED.content_title,
    default_validity_days = EXCLUDED.default_validity_days,
    benefit_kind = EXCLUDED.benefit_kind,
    responded_at = EXCLUDED.responded_at,
    validation_deadline_at = EXCLUDED.validation_deadline_at,
    updated_at = NOW();

  RETURN v_local_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_partner_benefit_offer(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_partner_benefit_offer(JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. RPC — réponse partenaire (acceptation / refus)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_respond_benefit_offer(
  p_local_id TEXT,
  p_accept BOOLEAN,
  p_note TEXT DEFAULT NULL,
  p_catalog_local_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_offer public.partner_benefit_offers%ROWTYPE;
  v_note TEXT := NULLIF(trim(COALESCE(p_note, '')), '');
  v_catalog_local_id TEXT := NULLIF(trim(COALESCE(p_catalog_local_id, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF NOT p_accept AND v_note IS NULL THEN
    RAISE EXCEPTION 'Motif requis pour un refus';
  END IF;

  SELECT * INTO v_offer
  FROM public.partner_benefit_offers
  WHERE local_id = p_local_id AND partner_user_id = v_uid;

  IF NOT FOUND THEN
    IF v_catalog_local_id IS NULL AND p_local_id LIKE 'pending-%' THEN
      v_catalog_local_id := substring(p_local_id from 9);
    END IF;

    IF v_catalog_local_id IS NULL OR v_catalog_local_id = '' THEN
      RAISE EXCEPTION 'Offre introuvable';
    END IF;

    IF p_accept THEN
      PERFORM public.partner_set_benefit_catalog_active(v_catalog_local_id, TRUE);
    ELSE
      UPDATE public.benefit_catalog bc
      SET
        offering_partners = COALESCE(
          (
            SELECT jsonb_agg(elem)
            FROM jsonb_array_elements(COALESCE(bc.offering_partners, '[]'::jsonb)) elem
            WHERE NOT (
              elem->>'partnerId' = v_uid::text
              OR elem->>'partnerId' = 'user:' || v_uid::text
              OR (
                elem->>'partnerId' LIKE 'user:%'
                AND split_part(elem->>'partnerId', ':', 2) = v_uid::text
              )
            )
          ),
          '[]'::jsonb
        ),
        is_active = FALSE,
        updated_at = NOW()
      WHERE bc.local_id = v_catalog_local_id;
    END IF;

    RETURN jsonb_build_object(
      'local_id', p_local_id,
      'status', CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
      'catalog_local_id', v_catalog_local_id
    );
  END IF;

  UPDATE public.partner_benefit_offers
  SET
    status = CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
    partner_response_note = v_note,
    responded_at = NOW(),
    updated_at = NOW()
  WHERE local_id = p_local_id;

  v_catalog_local_id := v_offer.catalog_local_id;

  IF p_accept THEN
    PERFORM public.partner_set_benefit_catalog_active(v_catalog_local_id, TRUE);
  ELSE
    UPDATE public.benefit_catalog bc
    SET
      offering_partners = COALESCE(
        (
          SELECT jsonb_agg(elem)
          FROM jsonb_array_elements(COALESCE(bc.offering_partners, '[]'::jsonb)) elem
          WHERE NOT (
            elem->>'partnerId' = v_uid::text
            OR elem->>'partnerId' = 'user:' || v_uid::text
            OR (
              elem->>'partnerId' LIKE 'user:%'
              AND split_part(elem->>'partnerId', ':', 2) = v_uid::text
            )
          )
        ),
        '[]'::jsonb
      ),
      is_active = FALSE,
      updated_at = NOW()
    WHERE bc.local_id = v_catalog_local_id;
  END IF;

  RETURN jsonb_build_object(
    'local_id', p_local_id,
    'status', CASE WHEN p_accept THEN 'accepted' ELSE 'declined' END,
    'catalog_local_id', v_catalog_local_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.partner_respond_benefit_offer(TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_respond_benefit_offer(TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;

COMMENT ON TABLE public.partner_benefit_offers IS
  'Demandes de validation avantage catalogue — sync admin mobile ↔ espace partenaire.';
