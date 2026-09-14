-- Suppression admin fiable d'une ligne benefit_catalog (validations partenaire).

CREATE OR REPLACE FUNCTION public.admin_delete_benefit_catalog_by_local_id(p_local_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_id TEXT := NULLIF(trim(COALESCE(p_local_id, '')), '');
  v_deleted INT;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  IF v_local_id IS NULL THEN
    RAISE EXCEPTION 'local_id requis';
  END IF;

  DELETE FROM public.benefit_catalog WHERE local_id = v_local_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_benefit_catalog_by_local_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_benefit_catalog_by_local_id(TEXT) TO authenticated;
