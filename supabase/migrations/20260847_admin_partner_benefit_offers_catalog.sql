-- Admin validations partenaire : même source que list_my_partner_benefit_offers
-- (benefit_catalog inactif + offering_partners), sans table partner_benefit_offers.

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
          'local_id', 'pending-' || bc.local_id || '-' || COALESCE(elem->>'partnerId', 'partner'),
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
          AND COALESCE(elem->>'partnerId', '') NOT IN ('__external__', '')
          AND (p_country_code IS NULL OR bc.country_code = p_country_code)
      ) sub
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_admin_partner_benefit_offers(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_admin_partner_benefit_offers(TEXT) TO authenticated;
