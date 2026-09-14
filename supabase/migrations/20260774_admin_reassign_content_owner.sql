-- Transfert / changement du partenaire gestionnaire (event, spot, outil)

CREATE OR REPLACE FUNCTION public.admin_reassign_content_owner(
  p_kind TEXT,
  p_content_id UUID,
  p_partner_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID := auth.uid();
  v_owner_user UUID;
  v_staff_id UUID;
  v_origin TEXT;
  v_partner_name TEXT;
  v_role TEXT;
  v_found BOOLEAN := FALSE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('event', 'spot', 'tool') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  IF p_content_id IS NULL THEN
    RAISE EXCEPTION 'content_id_required';
  END IF;

  IF p_partner_user_id IS NULL THEN
    -- Reprendre la gestion côté équipe THE LOOP (admin connecté)
    v_owner_user := v_admin;
    v_origin := 'admin';
    SELECT trim(both FROM COALESCE(company, first_name || ' ' || last_name, email, 'THE LOOP'))
    INTO v_partner_name
    FROM public.users
    WHERE id = v_admin;
    v_partner_name := COALESCE(NULLIF(v_partner_name, ''), 'THE LOOP');
  ELSE
    SELECT u.user_role,
           trim(both FROM COALESCE(u.company, u.first_name || ' ' || u.last_name, u.email, 'Partenaire'))
    INTO v_role, v_partner_name
    FROM public.users u
    WHERE u.id = p_partner_user_id
      AND COALESCE(u.is_active, TRUE) = TRUE;

    IF v_role IS NULL THEN
      RAISE EXCEPTION 'partner_not_found';
    END IF;
    IF v_role <> 'partner' THEN
      RAISE EXCEPTION 'user_not_partner';
    END IF;

    v_owner_user := p_partner_user_id;
    v_origin := 'partner';
    v_partner_name := COALESCE(NULLIF(v_partner_name, ''), 'Partenaire');
  END IF;

  v_staff_id := public.ensure_partner_staff(v_owner_user);

  IF p_kind = 'event' THEN
    UPDATE public.events
    SET
      organizer_id = v_owner_user,
      master_id = v_owner_user,
      content_origin = v_origin
    WHERE id = p_content_id;
    v_found := FOUND;

    UPDATE public.partner_event_submissions
    SET
      partner_user_id = v_owner_user,
      master_user_id = v_owner_user,
      partner_name = v_partner_name,
      content_origin = v_origin,
      updated_at = NOW()
    WHERE published_event_id = p_content_id;

  ELSIF p_kind = 'spot' THEN
    UPDATE public.establishments
    SET
      master_id = v_staff_id,
      content_origin = v_origin
    WHERE id = p_content_id;
    v_found := FOUND;

    UPDATE public.partner_spot_submissions
    SET
      partner_user_id = v_owner_user,
      partner_name = v_partner_name,
      updated_at = NOW()
    WHERE published_establishment_id = p_content_id;

  ELSIF p_kind = 'tool' THEN
    UPDATE public.tools
    SET
      master_id = v_staff_id,
      content_origin = v_origin
    WHERE id = p_content_id;
    v_found := FOUND;

    UPDATE public.partner_spot_submissions
    SET
      partner_user_id = v_owner_user,
      partner_name = v_partner_name,
      updated_at = NOW()
    WHERE published_tool_id = p_content_id;
  END IF;

  IF NOT v_found THEN
    RAISE EXCEPTION 'content_not_found';
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'kind', p_kind,
    'content_id', p_content_id,
    'owner_user_id', v_owner_user,
    'owner_staff_id', v_staff_id,
    'content_origin', v_origin,
    'partner_name', v_partner_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reassign_content_owner(TEXT, UUID, UUID) TO authenticated;

-- Lecture du gestionnaire actuel (admin)
CREATE OR REPLACE FUNCTION public.admin_get_content_owner(
  p_kind TEXT,
  p_content_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_staff_id UUID;
  v_origin TEXT;
  v_name TEXT;
  v_email TEXT;
  v_company TEXT;
  v_role TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  IF p_kind = 'event' THEN
    SELECT e.organizer_id, e.content_origin
    INTO v_user_id, v_origin
    FROM public.events e
    WHERE e.id = p_content_id;
    IF v_user_id IS NULL THEN
      SELECT e.master_id INTO v_user_id FROM public.events e WHERE e.id = p_content_id;
    END IF;

  ELSIF p_kind = 'spot' THEN
    SELECT e.master_id, e.content_origin
    INTO v_staff_id, v_origin
    FROM public.establishments e
    WHERE e.id = p_content_id;

    SELECT ps.user_id INTO v_user_id
    FROM public.partner_staff ps
    WHERE ps.id = v_staff_id;

  ELSIF p_kind = 'tool' THEN
    SELECT t.master_id, t.content_origin
    INTO v_staff_id, v_origin
    FROM public.tools t
    WHERE t.id = p_content_id;

    SELECT ps.user_id INTO v_user_id
    FROM public.partner_staff ps
    WHERE ps.id = v_staff_id;
  ELSE
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'owner_user_id', NULL, 'content_origin', v_origin);
  END IF;

  SELECT
    trim(both FROM COALESCE(u.company, u.first_name || ' ' || u.last_name, u.email)),
    u.email,
    u.company,
    u.user_role
  INTO v_name, v_email, v_company, v_role
  FROM public.users u
  WHERE u.id = v_user_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'owner_user_id', v_user_id,
    'owner_staff_id', v_staff_id,
    'display_name', v_name,
    'email', v_email,
    'company', v_company,
    'user_role', v_role,
    'content_origin', (
      CASE p_kind
        WHEN 'event' THEN (SELECT content_origin FROM public.events WHERE id = p_content_id)
        WHEN 'spot' THEN (SELECT content_origin FROM public.establishments WHERE id = p_content_id)
        WHEN 'tool' THEN (SELECT content_origin FROM public.tools WHERE id = p_content_id)
      END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_content_owner(TEXT, UUID) TO authenticated;
