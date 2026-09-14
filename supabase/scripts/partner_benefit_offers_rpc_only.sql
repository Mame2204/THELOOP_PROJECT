-- THE LOOP — Validation avantages partenaire SANS CREATE TABLE
-- À exécuter dans Supabase → SQL Editor
--
-- Si erreur 42501 « permission denied for schema public » alors que vous êtes owner :
-- 1. SQL Editor → menu déroulant « Role » → choisir **postgres** (pas anon / authenticated)
-- 2. Exécuter **un bloc** CREATE FUNCTION à la fois (pas tout le fichier d'un coup)
-- 3. Vérifier Project Settings → Database : pas de restriction DDL externe
-- 4. En dernier recours : Dashboard → Support, ou réexécuter via connexion directe psql
--
-- Si CREATE TABLE échoue (42501), ce script suffit : il s'appuie sur benefit_catalog existant.

-- Helper : partenaire listé dans offering_partners (users.id, user:uuid, établissement, staff)
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
       OR EXISTS (
         SELECT 1
         FROM public.establishments e
         JOIN public.partner_staff ps ON ps.id = e.master_id
         WHERE e.id::text = elem->>'partnerId'
           AND ps.user_id = p_user_id
       )
       OR EXISTS (
         SELECT 1
         FROM public.partner_staff ps
         WHERE ps.id::text = elem->>'partnerId'
           AND ps.user_id = p_user_id
       )
       OR EXISTS (
         SELECT 1
         FROM public.users u
         WHERE u.id = p_user_id
           AND u.is_active = TRUE
           AND (
             lower(trim(COALESCE(elem->>'displayName', ''))) = lower(trim(COALESCE(u.company, '')))
             OR lower(trim(COALESCE(elem->>'displayName', ''))) = lower(trim(concat_ws(' ', u.first_name, u.last_name)))
             OR lower(trim(COALESCE(elem->>'displayName', ''))) = lower(trim(COALESCE(u.email, '')))
           )
           AND trim(COALESCE(elem->>'displayName', '')) <> ''
       )
  );
$$;

-- Partenaire connecté : demandes en attente (catalogue inactif)
CREATE OR REPLACE FUNCTION public.list_my_partner_benefit_offers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY (row_data->>'created_at') DESC)
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
          AND public.partner_listed_in_offering_partners(
            jsonb_build_array(elem),
            v_uid
          )
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_partner_benefit_offers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_partner_benefit_offers() TO authenticated;

-- Admin : validations en cours (catalogue inactif + partenaires)
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
      SELECT jsonb_agg(row_data ORDER BY (row_data->>'created_at') DESC)
      FROM (
        SELECT jsonb_build_object(
          'local_id', 'pending-' || bc.local_id || '-' || (elem->>'partnerId'),
          'partner_user_id', NULLIF(
            CASE
              WHEN elem->>'partnerId' LIKE 'user:%' THEN split_part(elem->>'partnerId', ':', 2)
              ELSE elem->>'partnerId'
            END,
            ''
          ),
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
          AND (p_country_code IS NULL OR bc.country_code = p_country_code)
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_partner_benefit_offers(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_partner_benefit_offers(TEXT) TO authenticated;

-- Admin upsert : no-op (catalogue déjà sync via admin_upsert_benefit_catalog)
CREATE OR REPLACE FUNCTION public.admin_upsert_partner_benefit_offer(p_row JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_id TEXT := NULLIF(trim(COALESCE(p_row->>'local_id', '')), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;
  IF v_local_id IS NULL THEN
    RAISE EXCEPTION 'local_id requis';
  END IF;
  RETURN v_local_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_partner_benefit_offer(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_partner_benefit_offer(JSONB) TO authenticated;

-- Partenaire : accepter / refuser (catalogue uniquement)
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
  v_note TEXT := NULLIF(trim(COALESCE(p_note, '')), '');
  v_catalog_local_id TEXT := NULLIF(trim(COALESCE(p_catalog_local_id, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF NOT p_accept AND v_note IS NULL THEN
    RAISE EXCEPTION 'Motif requis pour un refus';
  END IF;

  IF v_catalog_local_id IS NULL AND p_local_id LIKE 'pending-%' THEN
    v_catalog_local_id := substring(p_local_id from 9);
  END IF;

  IF v_catalog_local_id IS NULL OR v_catalog_local_id = '' THEN
    RAISE EXCEPTION 'Offre introuvable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.benefit_catalog bc
    WHERE bc.local_id = v_catalog_local_id
      AND public.partner_listed_in_offering_partners(bc.offering_partners, v_uid)
  ) THEN
    RAISE EXCEPTION 'Offre introuvable pour ce partenaire';
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
END;
$$;

REVOKE ALL ON FUNCTION public.partner_respond_benefit_offer(TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_respond_benefit_offer(TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;

-- Partenaire connecté : IDs contenu publié (ownership + soumissions approuvées)
CREATE OR REPLACE FUNCTION public.list_my_partner_published_content_ids()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_staff_ids UUID[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT COALESCE(array_agg(ps.id), ARRAY[]::uuid[])
  INTO v_staff_ids
  FROM public.partner_staff ps
  WHERE ps.user_id = v_uid;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(DISTINCT to_jsonb(x.id))
      FROM (
        SELECT e.id::text AS id
        FROM public.events e
        WHERE e.content_status = 'published'
          AND e.is_active = TRUE
          AND (e.organizer_id = v_uid OR e.organizer_id = ANY(v_staff_ids))
        UNION
        SELECT est.id::text
        FROM public.establishments est
        WHERE est.content_status = 'published'
          AND est.is_active = TRUE
          AND (est.master_id = v_uid OR est.master_id = ANY(v_staff_ids))
        UNION
        SELECT t.id::text
        FROM public.tools t
        WHERE t.content_status = 'published'
          AND t.is_active = TRUE
          AND (t.master_id = v_uid OR t.master_id = ANY(v_staff_ids))
        UNION
        SELECT pes.published_event_id::text
        FROM public.partner_event_submissions pes
        WHERE pes.partner_user_id = v_uid
          AND pes.status = 'approved'
          AND pes.published_event_id IS NOT NULL
        UNION
        SELECT pss.published_establishment_id::text
        FROM public.partner_spot_submissions pss
        WHERE pss.partner_user_id = v_uid
          AND pss.status = 'approved'
          AND pss.published_establishment_id IS NOT NULL
        UNION
        SELECT pss.published_tool_id::text
        FROM public.partner_spot_submissions pss
        WHERE pss.partner_user_id = v_uid
          AND pss.status = 'approved'
          AND pss.published_tool_id IS NOT NULL
      ) x
      WHERE x.id IS NOT NULL AND btrim(x.id) <> ''
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_partner_published_content_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_partner_published_content_ids() TO authenticated;

-- Partenaire connecté : avantages catalogue actifs qui lui sont associés
CREATE OR REPLACE FUNCTION public.list_my_partner_active_benefits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_data ORDER BY (row_data->>'updated_at') DESC)
      FROM (
        SELECT jsonb_build_object(
          'local_id', bc.local_id,
          'title', bc.title,
          'description', bc.description,
          'country_code', COALESCE(bc.country_code, 'GN'),
          'city', bc.city,
          'is_active', bc.is_active,
          'offering_partners', COALESCE(bc.offering_partners, '[]'::jsonb),
          'default_validity_days', bc.default_validity_days,
          'benefit_kind', bc.benefit_kind,
          'created_at', bc.created_at,
          'updated_at', bc.updated_at,
          'content_id', elem->>'contentId',
          'content_type', elem->>'contentType',
          'content_title', elem->>'contentTitle',
          'partner_name', COALESCE(elem->>'displayName', 'Partenaire')
        ) AS row_data
        FROM public.benefit_catalog bc
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(bc.offering_partners, '[]'::jsonb)) elem
        WHERE bc.is_active = TRUE
          AND bc.local_id IS NOT NULL
          AND public.partner_listed_in_offering_partners(bc.offering_partners, v_uid)
          AND public.partner_listed_in_offering_partners(jsonb_build_array(elem), v_uid)
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_partner_active_benefits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_partner_active_benefits() TO authenticated;

-- Partenaire connecté : métriques validations (contourne RLS benefit_redemptions)
CREATE OR REPLACE FUNCTION public.count_my_partner_validation_metrics(p_since TIMESTAMPTZ DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  RETURN jsonb_build_object(
    'validations', (
      SELECT count(*)::int
      FROM public.benefit_redemptions br
      WHERE br.status = 'validated'
        AND (p_since IS NULL OR br.validated_at >= p_since)
        AND (
          br.partner_key = v_uid::text
          OR br.partner_key = 'user:' || v_uid::text
          OR EXISTS (
            SELECT 1
            FROM public.partner_staff ps
            WHERE ps.user_id = v_uid
              AND ps.id::text = br.partner_key
          )
          OR EXISTS (
            SELECT 1
            FROM public.establishments e
            JOIN public.partner_staff ps ON ps.id = e.master_id
            WHERE ps.user_id = v_uid
              AND e.id::text = br.partner_key
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = v_uid
              AND u.is_active = TRUE
              AND trim(COALESCE(br.partner_name, '')) <> ''
              AND (
                lower(trim(br.partner_name)) = lower(trim(COALESCE(u.company, '')))
                OR lower(trim(br.partner_name)) = lower(trim(concat_ws(' ', u.first_name, u.last_name)))
                OR lower(trim(br.partner_name)) = lower(trim(COALESCE(u.email, '')))
              )
          )
        )
    ),
    'unique_members', (
      SELECT count(DISTINCT br.user_id)::int
      FROM public.benefit_redemptions br
      WHERE br.status = 'validated'
        AND (p_since IS NULL OR br.validated_at >= p_since)
        AND (
          br.partner_key = v_uid::text
          OR br.partner_key = 'user:' || v_uid::text
          OR EXISTS (
            SELECT 1
            FROM public.partner_staff ps
            WHERE ps.user_id = v_uid
              AND ps.id::text = br.partner_key
          )
          OR EXISTS (
            SELECT 1
            FROM public.establishments e
            JOIN public.partner_staff ps ON ps.id = e.master_id
            WHERE ps.user_id = v_uid
              AND e.id::text = br.partner_key
          )
          OR EXISTS (
            SELECT 1
            FROM public.users u
            WHERE u.id = v_uid
              AND u.is_active = TRUE
              AND trim(COALESCE(br.partner_name, '')) <> ''
              AND (
                lower(trim(br.partner_name)) = lower(trim(COALESCE(u.company, '')))
                OR lower(trim(br.partner_name)) = lower(trim(concat_ws(' ', u.first_name, u.last_name)))
                OR lower(trim(br.partner_name)) = lower(trim(COALESCE(u.email, '')))
              )
          )
        )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.count_my_partner_validation_metrics(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_my_partner_validation_metrics(TIMESTAMPTZ) TO authenticated;
