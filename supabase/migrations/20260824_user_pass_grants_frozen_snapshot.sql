-- Snapshot PASS gelé (PassIntermediaire) pour restauration multi-appareil

ALTER TABLE public.user_pass_grants
  ADD COLUMN IF NOT EXISTS frozen_pass_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS role_freeze_intermediate_id TEXT;

COMMENT ON COLUMN public.user_pass_grants.frozen_pass_snapshot IS
  'Copie JSON du PASS d''origine lors d''un gel admin (PassIntermediaire).';

DROP FUNCTION IF EXISTS public.upsert_user_pass_grant_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ
);
DROP FUNCTION IF EXISTS public.upsert_user_pass_grant_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, JSONB, TEXT
);

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
  p_scheduled_start_at TIMESTAMPTZ DEFAULT NULL,
  p_frozen_pass_snapshot JSONB DEFAULT NULL,
  p_role_freeze_intermediate_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_local TEXT := NULLIF(trim(COALESCE(p_local_id, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

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
    frozen_pass_snapshot, role_freeze_intermediate_id,
    updated_at
  ) VALUES (
    p_user_id, p_pass_catalog_id, p_label,
    COALESCE(NULLIF(trim(p_pass_kind), ''), 'custom'),
    p_status, p_started_at, p_expires_at, p_granted_by, p_grant_note, v_local,
    p_amount_gnf, NULLIF(trim(COALESCE(p_payment_method, '')), ''),
    p_paid_at, NULLIF(trim(COALESCE(p_billing_period, '')), ''),
    p_scheduled_start_at,
    p_frozen_pass_snapshot,
    NULLIF(trim(COALESCE(p_role_freeze_intermediate_id, '')), ''),
    NOW()
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
    frozen_pass_snapshot = EXCLUDED.frozen_pass_snapshot,
    role_freeze_intermediate_id = EXCLUDED.role_freeze_intermediate_id,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_user_pass_grant_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, JSONB, TEXT
) IS
  'Octroi admin / PassIntermediaire avec snapshot JSON pour restauration multi-appareil.';

GRANT EXECUTE ON FUNCTION public.upsert_user_pass_grant_admin(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID, TEXT, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, JSONB, TEXT
) TO authenticated;
