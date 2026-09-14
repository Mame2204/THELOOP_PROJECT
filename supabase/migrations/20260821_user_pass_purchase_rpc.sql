-- Achat PASS membre : upsert cloud + promotion Prime (contourne RLS admin-only sur user_pass_grants)

CREATE OR REPLACE FUNCTION public.upsert_user_pass_purchase(
  p_user_id UUID,
  p_pass_catalog_id TEXT,
  p_label TEXT,
  p_pass_kind TEXT DEFAULT 'custom',
  p_status TEXT DEFAULT 'active',
  p_started_at TIMESTAMPTZ DEFAULT NOW(),
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_local_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_current_role TEXT;
  v_local TEXT := NULLIF(trim(COALESCE(p_local_id, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_status NOT IN ('active', 'expired', 'revoked', 'suspended') THEN
    RAISE EXCEPTION 'Statut PASS invalide : %', p_status;
  END IF;

  IF v_local IS NULL THEN
    RAISE EXCEPTION 'local_id requis pour un achat PASS';
  END IF;

  INSERT INTO public.user_pass_grants (
    user_id,
    pass_catalog_id,
    label,
    pass_kind,
    status,
    started_at,
    expires_at,
    granted_by,
    grant_note,
    local_id,
    updated_at
  ) VALUES (
    p_user_id,
    p_pass_catalog_id,
    p_label,
    COALESCE(NULLIF(trim(p_pass_kind), ''), 'custom'),
    p_status,
    p_started_at,
    p_expires_at,
    NULL,
    NULL,
    v_local,
    NOW()
  )
  ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO UPDATE SET
    pass_catalog_id = EXCLUDED.pass_catalog_id,
    label = EXCLUDED.label,
    pass_kind = EXCLUDED.pass_kind,
    status = EXCLUDED.status,
    started_at = EXCLUDED.started_at,
    expires_at = EXCLUDED.expires_at,
    updated_at = NOW()
  RETURNING id INTO v_id;

  -- Promotion Prime après achat actif (sans toucher admin / partenaire)
  IF p_status = 'active' THEN
    SELECT user_role INTO v_current_role
    FROM public.users
    WHERE id = p_user_id
    LIMIT 1;

    IF v_current_role IS NOT NULL
       AND v_current_role NOT IN ('admin', 'super_admin', 'partner') THEN
      UPDATE public.users
      SET user_role = 'prime', updated_at = NOW()
      WHERE id = p_user_id
        AND user_role NOT IN ('admin', 'super_admin', 'partner');
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_user_pass_purchase(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) IS
  'Sync achat PASS (membre connecté) vers user_pass_grants + promotion user_role=prime si actif.';

GRANT EXECUTE ON FUNCTION public.upsert_user_pass_purchase(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT
) TO authenticated;
