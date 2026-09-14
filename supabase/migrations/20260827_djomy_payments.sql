-- Paiements Djomy : intents + fulfillment serveur uniquement (service role)
-- Sécurise l'activation PASS : les clients authentifiés ne peuvent plus passer status=active.

CREATE TABLE IF NOT EXISTS public.payment_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'quarterly', 'annual', 'lifetime')),
  amount_gnf INTEGER NOT NULL CHECK (amount_gnf > 0),
  payer_phone TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'orange_money',
  local_pass_id TEXT NOT NULL UNIQUE,
  merchant_reference TEXT NOT NULL UNIQUE,
  djomy_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'redirected', 'paid', 'failed', 'cancelled')),
  fulfillment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending', 'fulfilled', 'failed')),
  pass_grant_status TEXT CHECK (pass_grant_status IN ('active', 'pending')),
  djomy_paid_amount INTEGER,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_user ON public.payment_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_merchant_ref ON public.payment_intents(merchant_reference);
CREATE INDEX IF NOT EXISTS idx_payment_intents_djomy_tx ON public.payment_intents(djomy_transaction_id);

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own payment intents" ON public.payment_intents;
CREATE POLICY "Users read own payment intents"
  ON public.payment_intents FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Insert/update réservés au service role (backend Node)

COMMENT ON TABLE public.payment_intents IS
  'Commandes PASS Djomy — créées et finalisées uniquement par le serveur de paiement.';

-- Fulfillment après verify_payment Djomy (service role / backend uniquement)
CREATE OR REPLACE FUNCTION public.fulfill_djomy_pass_payment(
  p_user_id UUID,
  p_local_pass_id TEXT,
  p_pass_catalog_id TEXT,
  p_label TEXT,
  p_status TEXT,
  p_started_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_amount_gnf INTEGER,
  p_payment_method TEXT,
  p_paid_at TIMESTAMPTZ,
  p_billing_period TEXT,
  p_scheduled_start_at TIMESTAMPTZ,
  p_promote_prime BOOLEAN,
  p_djomy_transaction_id TEXT,
  p_merchant_reference TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_current_role TEXT;
  v_local TEXT := NULLIF(trim(COALESCE(p_local_pass_id, '')), '');
BEGIN
  IF v_local IS NULL THEN
    RAISE EXCEPTION 'local_pass_id requis';
  END IF;

  IF p_status NOT IN ('active', 'pending') THEN
    RAISE EXCEPTION 'Statut PASS invalide : %', p_status;
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
    amount_gnf,
    payment_method,
    paid_at,
    billing_period,
    scheduled_start_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_pass_catalog_id,
    p_label,
    'custom',
    p_status,
    p_started_at,
    p_expires_at,
    NULL,
    'djomy:' || COALESCE(p_djomy_transaction_id, '') || '|' || COALESCE(p_merchant_reference, ''),
    v_local,
    p_amount_gnf,
    NULLIF(trim(COALESCE(p_payment_method, '')), ''),
    p_paid_at,
    NULLIF(trim(COALESCE(p_billing_period, '')), ''),
    p_scheduled_start_at,
    NOW()
  )
  ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO UPDATE SET
    pass_catalog_id = EXCLUDED.pass_catalog_id,
    label = EXCLUDED.label,
    status = EXCLUDED.status,
    started_at = EXCLUDED.started_at,
    expires_at = EXCLUDED.expires_at,
    amount_gnf = EXCLUDED.amount_gnf,
    payment_method = EXCLUDED.payment_method,
    paid_at = EXCLUDED.paid_at,
    billing_period = EXCLUDED.billing_period,
    scheduled_start_at = EXCLUDED.scheduled_start_at,
    grant_note = EXCLUDED.grant_note,
    updated_at = NOW()
  RETURNING id INTO v_id;

  IF p_promote_prime AND p_status = 'active' THEN
    SELECT user_role INTO v_current_role FROM public.users WHERE id = p_user_id LIMIT 1;
    IF v_current_role IS NOT NULL
       AND v_current_role NOT IN ('admin', 'super_admin', 'partner') THEN
      UPDATE public.users
      SET user_role = 'prime', prime_role_locked = FALSE, updated_at = NOW()
      WHERE id = p_user_id
        AND user_role NOT IN ('admin', 'super_admin', 'partner');
    END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fulfill_djomy_pass_payment(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fulfill_djomy_pass_payment(
  UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, BOOLEAN, TEXT, TEXT
) FROM anon, authenticated;

COMMENT ON FUNCTION public.fulfill_djomy_pass_payment IS
  'Activation PASS après paiement Djomy vérifié — backend service role uniquement.';

-- Durcissement : achat client → pending uniquement (pas de promotion Prime directe)
CREATE OR REPLACE FUNCTION public.upsert_user_pass_purchase(
  p_user_id UUID,
  p_pass_catalog_id TEXT,
  p_label TEXT,
  p_pass_kind TEXT DEFAULT 'custom',
  p_status TEXT DEFAULT 'pending',
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
  v_local TEXT := NULLIF(trim(COALESCE(p_local_id, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF NOT public.is_admin() AND p_status = 'active' THEN
    RAISE EXCEPTION 'Activation PASS réservée au serveur de paiement';
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
    p_amount_gnf,
    NULLIF(trim(COALESCE(p_payment_method, '')), ''),
    p_paid_at,
    NULLIF(trim(COALESCE(p_billing_period, '')), ''),
    p_scheduled_start_at,
    NOW()
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

  -- Promotion Prime : admin ou fulfillment serveur (fulfill_djomy_pass_payment) uniquement
  IF public.is_admin() AND p_status = 'active' THEN
    UPDATE public.users
    SET user_role = 'prime', updated_at = NOW()
    WHERE id = p_user_id
      AND user_role NOT IN ('admin', 'super_admin', 'partner');
  END IF;

  RETURN v_id;
END;
$$;

-- Fermer la brèche membre sur upsert_user_pass_grant_admin
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
  p_frozen_pass_snapshot JSONB DEFAULT NULL
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

  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé — admin requis';
  END IF;

  SELECT user_role INTO v_role FROM public.users WHERE id = p_user_id LIMIT 1;

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
    frozen_pass_snapshot, updated_at
  ) VALUES (
    p_user_id, p_pass_catalog_id, p_label,
    COALESCE(NULLIF(trim(p_pass_kind), ''), 'custom'),
    p_status, p_started_at, p_expires_at, p_granted_by, p_grant_note, v_local,
    p_amount_gnf,
    NULLIF(trim(COALESCE(p_payment_method, '')), ''),
    p_paid_at,
    NULLIF(trim(COALESCE(p_billing_period, '')), ''),
    p_scheduled_start_at,
    p_frozen_pass_snapshot,
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
    updated_at = NOW()
  RETURNING id INTO v_id;

  IF p_status = 'active' THEN
    IF v_role IS NOT NULL AND v_role NOT IN ('admin', 'super_admin', 'partner') THEN
      UPDATE public.users
      SET user_role = 'prime', prime_role_locked = FALSE, updated_at = NOW()
      WHERE id = p_user_id
        AND user_role NOT IN ('admin', 'super_admin', 'partner');
    END IF;
  ELSIF p_status = 'suspended' AND p_frozen_pass_snapshot IS NOT NULL THEN
    IF v_role = 'prime' THEN
      UPDATE public.users
      SET user_role = 'member', prime_role_locked = TRUE, updated_at = NOW()
      WHERE id = p_user_id AND user_role = 'prime';
    END IF;
  END IF;

  RETURN v_id;
END;
$$;
