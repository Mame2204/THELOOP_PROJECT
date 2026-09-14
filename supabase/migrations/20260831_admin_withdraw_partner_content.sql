-- Retrait définitif du contenu partenaire après suppression admin + purge avantages catalogue

-- Nettoyage des soumissions orphelines (catalogue supprimé, FK ON DELETE SET NULL)
DELETE FROM public.partner_event_submissions
WHERE status = 'approved' AND published_event_id IS NULL;

DELETE FROM public.partner_spot_submissions
WHERE status = 'approved'
  AND COALESCE(sub_category, '') = 'tools'
  AND published_tool_id IS NULL;

DELETE FROM public.partner_spot_submissions
WHERE status = 'approved'
  AND COALESCE(sub_category, '') <> 'tools'
  AND published_establishment_id IS NULL;

CREATE OR REPLACE FUNCTION public.admin_withdraw_partner_content(
  p_kind TEXT,
  p_catalog_id UUID DEFAULT NULL,
  p_local_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_events INTEGER := 0;
  v_deleted_spots INTEGER := 0;
  v_batch INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_kind = 'event' THEN
    IF p_local_id IS NOT NULL AND trim(p_local_id) <> '' THEN
      DELETE FROM public.partner_event_submissions WHERE local_id = p_local_id;
      GET DIAGNOSTICS v_deleted_events = ROW_COUNT;
    END IF;
    IF p_catalog_id IS NOT NULL THEN
      DELETE FROM public.partner_event_submissions WHERE published_event_id = p_catalog_id;
      GET DIAGNOSTICS v_batch = ROW_COUNT;
      v_deleted_events := v_deleted_events + v_batch;
    END IF;
  ELSIF p_kind IN ('spot', 'tool') THEN
    IF p_local_id IS NOT NULL AND trim(p_local_id) <> '' THEN
      DELETE FROM public.partner_spot_submissions WHERE local_id = p_local_id;
      GET DIAGNOSTICS v_deleted_spots = ROW_COUNT;
    END IF;
    IF p_catalog_id IS NOT NULL THEN
      IF p_kind = 'tool' THEN
        DELETE FROM public.partner_spot_submissions WHERE published_tool_id = p_catalog_id;
      ELSE
        DELETE FROM public.partner_spot_submissions WHERE published_establishment_id = p_catalog_id;
      END IF;
      GET DIAGNOSTICS v_batch = ROW_COUNT;
      v_deleted_spots := v_deleted_spots + v_batch;
    END IF;
  ELSE
    RAISE EXCEPTION 'Type de contenu invalide';
  END IF;

  RETURN jsonb_build_object(
    'deleted_events', v_deleted_events,
    'deleted_spots', v_deleted_spots
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_purge_benefit_catalog_content_refs(p_content_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.benefit_catalog%ROWTYPE;
  v_filtered JSONB;
  v_changed INTEGER := 0;
  v_id TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_content_ids IS NULL OR array_length(p_content_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_row IN SELECT * FROM public.benefit_catalog LOOP
    v_filtered := (
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
      FROM jsonb_array_elements(COALESCE(v_row.offering_partners, '[]'::jsonb)) elem
      WHERE NOT (
        COALESCE(elem->>'contentId', '') <> ''
        AND (elem->>'contentId')::uuid = ANY (p_content_ids)
      )
    );

    IF v_filtered IS DISTINCT FROM COALESCE(v_row.offering_partners, '[]'::jsonb) THEN
      UPDATE public.benefit_catalog
      SET
        offering_partners = v_filtered,
        is_active = CASE WHEN jsonb_array_length(v_filtered) > 0 THEN v_row.is_active ELSE FALSE END,
        updated_at = NOW()
      WHERE id = v_row.id;
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_withdraw_partner_content(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_withdraw_partner_content(TEXT, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_purge_benefit_catalog_content_refs(UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_benefit_catalog_content_refs(UUID[]) TO authenticated;
