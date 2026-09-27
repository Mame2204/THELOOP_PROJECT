-- Approbation demande de retrait partenaire (catalogue + soumission) — SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.admin_approve_partner_withdrawal_request(
  p_kind TEXT,
  p_local_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_id TEXT := NULLIF(trim(p_local_id), '');
  v_catalog_id UUID;
  v_sub_category TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF v_local_id IS NULL THEN
    RAISE EXCEPTION 'local_id requis';
  END IF;

  IF p_kind = 'event' THEN
    SELECT s.published_event_id
    INTO v_catalog_id
    FROM public.partner_event_submissions s
    WHERE s.local_id = v_local_id
      AND s.status = 'withdrawal_requested'
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Demande de retrait introuvable ou déjà traitée';
    END IF;

    IF v_catalog_id IS NOT NULL THEN
      DELETE FROM public.events WHERE id = v_catalog_id;
    END IF;

    DELETE FROM public.partner_event_submissions WHERE local_id = v_local_id;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'kind', 'event',
      'local_id', v_local_id,
      'catalog_id', v_catalog_id
    );
  END IF;

  IF p_kind IN ('spot', 'tool') THEN
    SELECT
      CASE
        WHEN p_kind = 'tool' THEN s.published_tool_id
        ELSE s.published_establishment_id
      END,
      COALESCE(s.sub_category, '')
    INTO v_catalog_id, v_sub_category
    FROM public.partner_spot_submissions s
    WHERE s.local_id = v_local_id
      AND s.status = 'withdrawal_requested'
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Demande de retrait introuvable ou déjà traitée';
    END IF;

    IF v_catalog_id IS NOT NULL THEN
      IF p_kind = 'tool' OR v_sub_category = 'tools' THEN
        DELETE FROM public.tools WHERE id = v_catalog_id;
      ELSE
        DELETE FROM public.establishments WHERE id = v_catalog_id;
      END IF;
    END IF;

    DELETE FROM public.partner_spot_submissions WHERE local_id = v_local_id;

    RETURN jsonb_build_object(
      'ok', TRUE,
      'kind', p_kind,
      'local_id', v_local_id,
      'catalog_id', v_catalog_id
    );
  END IF;

  RAISE EXCEPTION 'Type de contenu invalide';
END;
$$;

REVOKE ALL ON FUNCTION public.admin_approve_partner_withdrawal_request(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_approve_partner_withdrawal_request(TEXT, TEXT) TO authenticated;
