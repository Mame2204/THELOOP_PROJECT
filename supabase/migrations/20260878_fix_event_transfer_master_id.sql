-- THE LOOP — Fix transfert événement : events.master_id → users(id)
-- 20260871 écrivait partner_staff.id dans events.master_id → violation events_master_id_fkey.

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
  v_sub_updated INTEGER := 0;
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
    v_owner_user := v_admin;
    v_origin := 'admin';
    SELECT trim(both FROM COALESCE(company, first_name || ' ' || last_name, email, 'THE LOOP'))
    INTO v_partner_name
    FROM public.users
    WHERE id = v_admin;
    v_partner_name := COALESCE(NULLIF(v_partner_name, ''), 'THE LOOP');
    v_staff_id := public.ensure_partner_staff(v_admin);
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
    v_staff_id := public.ensure_partner_staff(v_owner_user);
  END IF;

  IF p_kind = 'event' THEN
    -- events.master_id référence users(id), PAS partner_staff
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
    GET DIAGNOSTICS v_sub_updated = ROW_COUNT;

    IF v_sub_updated = 0 AND v_found THEN
      INSERT INTO public.partner_event_submissions (
        local_id,
        partner_user_id,
        partner_name,
        master_user_id,
        title,
        description,
        category,
        starts_at,
        ends_at,
        venue_name,
        country_code,
        content_origin,
        status,
        published_event_id,
        updated_at
      )
      SELECT
        'transfer-' || e.id::text,
        v_owner_user,
        v_partner_name,
        v_owner_user,
        e.title,
        COALESCE(e.description, ''),
        'corporate',
        COALESCE(e.start_date, NOW()),
        e.end_date,
        COALESCE(e.custom_location_name, ''),
        COALESCE(e.country_code, 'GN'),
        v_origin,
        'approved',
        e.id,
        NOW()
      FROM public.events e
      WHERE e.id = p_content_id
      ON CONFLICT (local_id) DO UPDATE SET
        partner_user_id = EXCLUDED.partner_user_id,
        master_user_id = EXCLUDED.master_user_id,
        partner_name = EXCLUDED.partner_name,
        content_origin = EXCLUDED.content_origin,
        status = 'approved',
        published_event_id = EXCLUDED.published_event_id,
        updated_at = NOW();
    END IF;

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
      content_origin = v_origin,
      updated_at = NOW()
    WHERE published_establishment_id = p_content_id;
    GET DIAGNOSTICS v_sub_updated = ROW_COUNT;

    IF v_sub_updated = 0 AND v_found THEN
      INSERT INTO public.partner_spot_submissions (
        local_id,
        partner_user_id,
        partner_name,
        name,
        description,
        address,
        sub_category,
        country_code,
        content_origin,
        status,
        published_establishment_id,
        updated_at
      )
      SELECT
        'transfer-spot-' || est.id::text,
        v_owner_user,
        v_partner_name,
        est.name,
        COALESCE(est.description, ''),
        '',
        COALESCE(est.category_slugs[1], 'fine_dining'),
        COALESCE(est.country_code, 'GN'),
        v_origin,
        'approved',
        est.id,
        NOW()
      FROM public.establishments est
      WHERE est.id = p_content_id
      ON CONFLICT (local_id) DO UPDATE SET
        partner_user_id = EXCLUDED.partner_user_id,
        partner_name = EXCLUDED.partner_name,
        content_origin = EXCLUDED.content_origin,
        status = 'approved',
        published_establishment_id = EXCLUDED.published_establishment_id,
        updated_at = NOW();
    END IF;

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
      content_origin = v_origin,
      updated_at = NOW()
    WHERE published_tool_id = p_content_id;
    GET DIAGNOSTICS v_sub_updated = ROW_COUNT;

    IF v_sub_updated = 0 AND v_found THEN
      INSERT INTO public.partner_spot_submissions (
        local_id,
        partner_user_id,
        partner_name,
        name,
        description,
        address,
        sub_category,
        country_code,
        content_origin,
        status,
        published_tool_id,
        updated_at
      )
      SELECT
        'transfer-tool-' || t.id::text,
        v_owner_user,
        v_partner_name,
        t.name,
        COALESCE(t.description, ''),
        '',
        'tools',
        COALESCE(t.country_code, 'GN'),
        v_origin,
        'approved',
        t.id,
        NOW()
      FROM public.tools t
      WHERE t.id = p_content_id
      ON CONFLICT (local_id) DO UPDATE SET
        partner_user_id = EXCLUDED.partner_user_id,
        partner_name = EXCLUDED.partner_name,
        content_origin = EXCLUDED.content_origin,
        status = 'approved',
        published_tool_id = EXCLUDED.published_tool_id,
        updated_at = NOW();
    END IF;
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

COMMENT ON FUNCTION public.admin_reassign_content_owner(TEXT, UUID, UUID) IS
  'Transfert ownership : events.master_id = users.id ; spots/tools.master_id = partner_staff.id.';

REVOKE ALL ON FUNCTION public.admin_reassign_content_owner(TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reassign_content_owner(TEXT, UUID, UUID) TO authenticated;
