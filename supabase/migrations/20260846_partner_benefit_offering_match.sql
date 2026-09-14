-- THE LOOP — Corrige le matching partenaire dans offering_partners
-- (établissement UUID, partner_staff, nom société) pour les RPC avantages partenaire.
--
-- Sans table partner_benefit_offers : s'appuie uniquement sur benefit_catalog
-- (compatible projets où CREATE TABLE 20260845 n'a pas pu s'exécuter).

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
          AND public.partner_listed_in_offering_partners(jsonb_build_array(elem), v_uid)
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

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
          WHERE NOT public.partner_listed_in_offering_partners(jsonb_build_array(elem), v_uid)
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

REVOKE ALL ON FUNCTION public.partner_listed_in_offering_partners(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_listed_in_offering_partners(JSONB, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.list_my_partner_benefit_offers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_partner_benefit_offers() TO authenticated;

REVOKE ALL ON FUNCTION public.list_my_partner_active_benefits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_partner_active_benefits() TO authenticated;

REVOKE ALL ON FUNCTION public.partner_respond_benefit_offer(TEXT, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_respond_benefit_offer(TEXT, BOOLEAN, TEXT, TEXT) TO authenticated;
