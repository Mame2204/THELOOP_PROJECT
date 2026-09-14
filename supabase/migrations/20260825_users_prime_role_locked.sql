-- Verrou gel admin Prime → membre (source de vérité cloud, multi-appareil)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS prime_role_locked BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.users.prime_role_locked IS
  'TRUE si un admin a rétrogradé Prime → membre avec gel PASS (empêche re-promotion automatique).';

-- Promotion achat PASS : effacer le verrou (remplace upsert_user_pass_purchase 13 args)
DROP FUNCTION IF EXISTS public.upsert_user_pass_purchase(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT
);
DROP FUNCTION IF EXISTS public.upsert_user_pass_purchase(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.upsert_user_pass_purchase(
  p_user_id UUID,
  p_pass_catalog_id TEXT,
  p_label TEXT,
  p_pass_kind TEXT DEFAULT 'custom',
  p_status TEXT DEFAULT 'active',
  p_started_at TIMESTAMPTZ DEFAULT NOW(),
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
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
  v_current_role TEXT;
  v_local TEXT := NULLIF(trim(COALESCE(p_local_id, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF p_status NOT IN ('active', 'pending', 'expired', 'revoked', 'suspended') THEN
    RAISE EXCEPTION 'Statut PASS invalide : %', p_status;
  END IF;

  IF v_local IS NULL THEN
    RAISE EXCEPTION 'local_id requis pour un achat PASS';
  END IF;

  INSERT INTO public.user_pass_grants (
    user_id, pass_catalog_id, label, pass_kind, status,
    started_at, expires_at, granted_by, grant_note, local_id,
    amount_gnf, payment_method, paid_at, billing_period, scheduled_start_at,
    updated_at
  ) VALUES (
    p_user_id, p_pass_catalog_id, p_label,
    COALESCE(NULLIF(trim(p_pass_kind), ''), 'custom'),
    p_status, p_started_at, p_expires_at, NULL, NULL, v_local,
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
    amount_gnf = EXCLUDED.amount_gnf,
    payment_method = EXCLUDED.payment_method,
    paid_at = EXCLUDED.paid_at,
    billing_period = EXCLUDED.billing_period,
    scheduled_start_at = EXCLUDED.scheduled_start_at,
    updated_at = NOW()
  RETURNING id INTO v_id;

  IF p_status = 'active' THEN
    SELECT user_role INTO v_current_role
    FROM public.users
    WHERE id = p_user_id
    LIMIT 1;

    IF v_current_role IS NOT NULL
       AND v_current_role NOT IN ('admin', 'super_admin', 'partner') THEN
      UPDATE public.users
      SET user_role = 'prime',
          prime_role_locked = FALSE,
          updated_at = NOW()
      WHERE id = p_user_id
        AND user_role NOT IN ('admin', 'super_admin', 'partner');
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_user_pass_purchase(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ
) IS
  'Sync achat PASS — promotion Prime + déverrouillage prime_role_locked si actif.';

GRANT EXECUTE ON FUNCTION public.upsert_user_pass_purchase(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT,
  INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ
) TO authenticated;
