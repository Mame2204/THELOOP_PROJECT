-- THE LOOP — Aligne partner_set_benefit_catalog_active sur partner_listed_in_offering_partners
-- (établissement, partner_staff, user:uuid, nom société) pour que l'acceptation partenaire active le catalogue.

CREATE OR REPLACE FUNCTION public.partner_set_benefit_catalog_active(
  p_local_id TEXT,
  p_is_active BOOLEAN
)
RETURNS BOOLEAN
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

  IF p_local_id IS NULL OR trim(p_local_id) = '' THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin() THEN
    UPDATE public.benefit_catalog
    SET is_active = p_is_active, updated_at = NOW()
    WHERE local_id = p_local_id;
    RETURN FOUND;
  END IF;

  UPDATE public.benefit_catalog bc
  SET is_active = p_is_active, updated_at = NOW()
  WHERE bc.local_id = p_local_id
    AND public.partner_listed_in_offering_partners(bc.offering_partners, v_uid);

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_set_benefit_catalog_active(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_set_benefit_catalog_active(TEXT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.partner_set_benefit_catalog_active IS
  'Active/désactive un avantage catalogue : admin ou partenaire reconnu via partner_listed_in_offering_partners.';
