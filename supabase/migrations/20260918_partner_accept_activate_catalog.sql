-- THE LOOP — Activation catalogue garantie après acceptation partenaire d'un privilège.
-- Corrige is_active=false côté admin alors que l'offre partenaire est acceptée.

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
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.partner_benefit_offers o
    WHERE o.catalog_local_id = v_catalog_local_id
      AND o.partner_user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Offre introuvable pour ce partenaire';
  END IF;

  IF p_accept THEN
    UPDATE public.benefit_catalog
    SET is_active = TRUE, updated_at = NOW()
    WHERE local_id = v_catalog_local_id;

    UPDATE public.partner_benefit_offers
    SET
      status = 'accepted',
      partner_response_note = v_note,
      responded_at = NOW(),
      updated_at = NOW()
    WHERE catalog_local_id = v_catalog_local_id
      AND partner_user_id = v_uid
      AND status = 'pending';
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

    UPDATE public.partner_benefit_offers
    SET
      status = 'declined',
      partner_response_note = v_note,
      responded_at = NOW(),
      updated_at = NOW()
    WHERE catalog_local_id = v_catalog_local_id
      AND partner_user_id = v_uid
      AND status = 'pending';
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

COMMENT ON FUNCTION public.partner_respond_benefit_offer IS
  'Réponse partenaire à une offre privilège : active le catalogue (is_active) à l''acceptation.';
