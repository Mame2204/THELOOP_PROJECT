-- Compte dédié test V8 (notification expiration PASS · gate achat ON/OFF).
-- E-mail : v8-pass-expiry@theloop.gn
--
-- 1) Appliquer cette migration.
-- 2) Inviter / activer ce compte (admin-web) si pas encore de ligne auth.users.
-- 3) SQL (service role / éditeur Supabase) :
--      SELECT public.refresh_pass_v8_test_fixture('due_now');
--    puis déclencher l’expiration (cron Render ou) :
--      SELECT public.expire_due_pass_grants(50);
-- 4) Gate OFF (prod) : notif sans « Renouvelez ». Gate ON : refaire avec un 2ᵉ passage.

CREATE OR REPLACE FUNCTION public.refresh_pass_v8_test_fixture(
  p_mode TEXT DEFAULT 'due_soon',
  p_email TEXT DEFAULT 'v8-pass-expiry@theloop.gn'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email TEXT := lower(trim(COALESCE(p_email, '')));
  v_uid UUID;
  v_now TIMESTAMPTZ := NOW();
  v_expires TIMESTAMPTZ;
  v_local_id TEXT := 'pass-v8-test-fixture-001';
  v_mode TEXT := lower(trim(COALESCE(p_mode, 'due_soon')));
BEGIN
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_email');
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs' USING ERRCODE = '42501';
  END IF;

  SELECT au.id INTO v_uid
  FROM auth.users au
  WHERE lower(trim(COALESCE(au.email, ''))) = v_email
  LIMIT 1;

  IF v_uid IS NULL THEN
    INSERT INTO public.admin_user_invites (
      email, user_role, first_name, last_name, phone_number, otp_sent_at
    )
    SELECT
      v_email,
      'member',
      'Test',
      'Expiration V8',
      NULL,
      v_now
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.admin_user_invites i
      WHERE lower(trim(COALESCE(i.email, ''))) = v_email
        AND i.activated_at IS NULL
    );

    RETURN jsonb_build_object(
      'ok', FALSE,
      'step', 'invite_and_activate',
      'email', v_email,
      'message',
      'Aucun compte Auth pour cet e-mail. Invitez puis activez le compte, reconnectez-vous, puis relancez refresh_pass_v8_test_fixture.'
    );
  END IF;

  IF v_mode IN ('due_now', 'immediate', 'past') THEN
    v_expires := v_now - INTERVAL '2 minutes';
  ELSIF v_mode IN ('due_soon', 'soon', 'scheduled') THEN
    v_expires := v_now + INTERVAL '5 minutes';
  ELSE
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_mode', 'hint', 'due_now | due_soon');
  END IF;

  INSERT INTO public.users (
    id, email, password_hash, first_name, last_name, user_role, is_active, account_status, country_code
  )
  VALUES (
    v_uid,
    v_email,
    'managed_by_supabase_auth',
    'Test',
    'Expiration V8',
    'prime',
    TRUE,
    'active',
    'GN'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    user_role = 'prime',
    is_active = TRUE,
    account_status = 'active',
    prime_role_locked = FALSE,
    updated_at = v_now;

  DELETE FROM public.user_pass_grants g
  WHERE g.user_id = v_uid
    AND (
      g.local_id LIKE 'pass-v8-test%'
      OR (g.grant_note IS NOT NULL AND g.grant_note LIKE 'V8 smoke%')
    );

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
    updated_at
  )
  VALUES (
    v_uid,
    'prime-monthly',
    'PASS test V8 (expiration)',
    'standard',
    'active',
    v_now - INTERVAL '30 days',
    v_expires,
    NULL,
    'V8 smoke — compte jetable expiration PASS (gate notif)',
    v_local_id,
    50000,
    'orange_money',
    v_now - INTERVAL '30 days',
    'monthly',
    v_now
  )
  ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO UPDATE SET
    status = 'active',
    started_at = EXCLUDED.started_at,
    expires_at = EXCLUDED.expires_at,
    grant_note = EXCLUDED.grant_note,
    amount_gnf = EXCLUDED.amount_gnf,
    payment_method = EXCLUDED.payment_method,
    paid_at = EXCLUDED.paid_at,
    billing_period = EXCLUDED.billing_period,
    updated_at = v_now;

  UPDATE public.users u
  SET user_role = 'prime',
      prime_role_locked = FALSE,
      updated_at = v_now
  WHERE u.id = v_uid;

  INSERT INTO public.app_settings (key, value)
  VALUES (
    'pass_v8_test_fixture',
    jsonb_build_object(
      'email', v_email,
      'localPassId', v_local_id,
      'expiresAt', v_expires,
      'mode', v_mode,
      'updatedAt', v_now,
      'nextSteps', jsonb_build_array(
        'Gate OFF : SELECT expire_due_pass_grants(50); puis lire user_notifications',
        'Gate ON : activer Achat PASS, refresh due_now, expire_due_pass_grants, vérifier « Renouvelez »'
      )
    )
  )
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'email', v_email,
    'userId', v_uid,
    'localPassId', v_local_id,
    'expiresAt', v_expires,
    'mode', v_mode,
    'cronHint', 'SELECT public.expire_due_pass_grants(50);'
  );
END;
$$;

COMMENT ON FUNCTION public.refresh_pass_v8_test_fixture(TEXT, TEXT) IS
  'Prépare un PASS mensuel test pour V8 (expiration + notif). Modes : due_soon (+5 min) ou due_now (déjà échu).';

REVOKE ALL ON FUNCTION public.refresh_pass_v8_test_fixture(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_pass_v8_test_fixture(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_pass_v8_test_fixture(TEXT, TEXT) TO authenticated;

SELECT public.refresh_pass_v8_test_fixture('due_soon', 'v8-pass-expiry@theloop.gn');
