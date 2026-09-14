-- Octrois admin / gel rôle : upsert + bulk update (contourne RLS admin-only)

CREATE OR REPLACE FUNCTION public.upsert_user_pass_grant_admin(
  p_user_id UUID,
  p_pass_catalog_id TEXT,
  p_label TEXT,
  p_pass_kind TEXT DEFAULT 'custom',
  p_status TEXT DEFAULT 'active',
  p_started_at TIMESTAMPTZ DEFAULT NOW(),
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_granted_by UUID DEFAULT NULL,
  p_grant_note TEXT DEFAULT NULL,
  p_local_id TEXT DEFAULT NULL,
  p_amount_gnf INTEGER DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_paid_at TIMESTAMPTZ DEFAULT NULL,
  p_billing_period TEXT DEFAULT NULL,
  p_scheduled_start_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_local TEXT := NULLIF(trim(COALESCE(p_local_id, '')), '');
  v_role TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT user_role INTO v_role FROM public.users WHERE id = p_user_id LIMIT 1;

  IF public.is_admin() THEN
    NULL;
  ELSIF auth.uid() = p_user_id AND (
    p_granted_by IS NOT NULL
    OR NULLIF(trim(COALESCE(p_grant_note, '')), '') IS NOT NULL
  ) THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_status NOT IN ('active', 'pending', 'expired', 'revoked', 'suspended') THEN
    RAISE EXCEPTION 'Statut PASS invalide : %', p_status;
  END IF;

  IF v_local IS NULL THEN
    RAISE EXCEPTION 'local_id requis';
  END IF;

  INSERT INTO public.user_pass_grants (
    user_id, pass_catalog_id, label, pass_kind, status,
    started_at, expires_at, granted_by, grant_note, local_id,
    amount_gnf, payment_method, paid_at, billing_period, scheduled_start_at,
    updated_at
  ) VALUES (
    p_user_id, p_pass_catalog_id, p_label,
    COALESCE(NULLIF(trim(p_pass_kind), ''), 'custom'),
    p_status, p_started_at, p_expires_at, p_granted_by, p_grant_note, v_local,
    p_amount_gnf, NULLIF(trim(COALESCE(p_payment_method, '')), ''),
    p_paid_at, NULLIF(trim(COALESCE(p_billing_period, '')), ''),
    p_scheduled_start_at, NOW()
  )
  ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO UPDATE SET
    pass_catalog_id = EXCLUDED.pass_catalog_id,
    label = EXCLUDED.label,
    pass_kind = EXCLUDED.pass_kind,
    status = EXCLUDED.status,
    started_at = EXCLUDED.started_at,
    expires_at = EXCLUDED.expires_at,
    granted_by = EXCLUDED.granted_by,
    grant_note = EXCLUDED.grant_note,
    amount_gnf = EXCLUDED.amount_gnf,
    payment_method = EXCLUDED.payment_method,
    paid_at = EXCLUDED.paid_at,
    billing_period = EXCLUDED.billing_period,
    scheduled_start_at = EXCLUDED.scheduled_start_at,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_update_user_pass_grants(
  p_user_id UUID,
  p_new_status TEXT,
  p_match_statuses TEXT[],
  p_exclude_catalog_id TEXT DEFAULT NULL,
  p_only_catalog_id TEXT DEFAULT NULL,
  p_only_unexpired BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF NOT public.is_admin() AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_new_status NOT IN ('active', 'pending', 'expired', 'revoked', 'suspended') THEN
    RAISE EXCEPTION 'Statut cible invalide : %', p_new_status;
  END IF;

  UPDATE public.user_pass_grants g
  SET status = p_new_status, updated_at = NOW()
  WHERE g.user_id = p_user_id
    AND g.status = ANY (p_match_statuses)
    AND (p_exclude_catalog_id IS NULL OR g.pass_catalog_id <> p_exclude_catalog_id)
    AND (p_only_catalog_id IS NULL OR g.pass_catalog_id = p_only_catalog_id)
    AND (
      NOT p_only_unexpired
      OR g.expires_at IS NULL
      OR g.expires_at > NOW()
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.upsert_user_pass_grant_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ
) IS
  'Octroi admin ou PassIntermediaire (gel rôle) — admin ou membre concerné avec granted_by.';

COMMENT ON FUNCTION public.bulk_update_user_pass_grants(
  UUID, TEXT, TEXT[], TEXT, TEXT, BOOLEAN
) IS
  'Mise à jour bulk statuts PASS — admin ou membre sur son propre compte.';

GRANT EXECUTE ON FUNCTION public.upsert_user_pass_grant_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_user_pass_grants(
  UUID, TEXT, TEXT[], TEXT, TEXT, BOOLEAN
) TO authenticated;
