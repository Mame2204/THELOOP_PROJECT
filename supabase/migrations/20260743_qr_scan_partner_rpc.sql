-- Correctif scan QR : digest explicite via extensions + alias RPC pour l'app mobile

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.verify_member_qr_partner(p_payload TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_payload TEXT := upper(trim(p_payload));
  v_short_id TEXT;
  v_slot BIGINT;
  v_code TEXT;
  v_user RECORD;
  v_expected TEXT;
  v_window_ms BIGINT;
  v_slot_now BIGINT;
  v_slot_try BIGINT;
BEGIN
  IF v_payload !~ '^LOOP-[A-Z0-9]{8}-[0-9]+-[A-Z0-9]{10}$' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'invalid_format');
  END IF;

  v_short_id := split_part(v_payload, '-', 2);
  v_slot := split_part(v_payload, '-', 3)::BIGINT;
  v_code := split_part(v_payload, '-', 4);

  SELECT id, qr_code_token, user_role, is_active, first_name, last_name, phone_number
  INTO v_user
  FROM users
  WHERE upper(substr(replace(id::text, '-', ''), 1, 8)) = v_short_id
  LIMIT 1;

  IF v_user.id IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'user_not_found');
  END IF;

  IF NOT v_user.is_active THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'user_inactive', 'user_id', v_user.id);
  END IF;

  IF v_user.qr_code_token IS NULL OR trim(v_user.qr_code_token) = '' THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'missing_qr_token', 'user_id', v_user.id);
  END IF;

  FOREACH v_window_ms IN ARRAY ARRAY[120000, 30000] LOOP
    v_slot_now := floor(extract(epoch FROM now()) * 1000 / v_window_ms);

    FOR v_slot_try IN SELECT unnest(ARRAY[v_slot_now - 1, v_slot_now, v_slot_now + 1]) LOOP
      IF v_slot_try < 0 OR v_slot_try <> v_slot THEN
        CONTINUE;
      END IF;

      v_expected := upper(substr(encode(extensions.digest(
        upper(trim(v_user.qr_code_token)) || ':' || v_user.id::text || ':' || v_slot_try::text,
        'sha256'::text
      ), 'hex'), 1, 10));

      IF v_expected = v_code THEN
        RETURN jsonb_build_object(
          'valid', true,
          'user_id', v_user.id,
          'user_role', v_user.user_role,
          'first_name', v_user.first_name,
          'last_name', v_user.last_name,
          'phone_number', v_user.phone_number,
          'slot', v_slot_try,
          'window_ms', v_window_ms
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('valid', false, 'reason', 'expired_or_invalid', 'user_id', v_user.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_member_qr_payload(p_payload TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_result JSONB;
BEGIN
  v_result := public.verify_member_qr_partner(p_payload);
  IF v_result ? 'first_name' THEN
    v_result := v_result - 'first_name' - 'last_name' - 'phone_number';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_member_qr_partner(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_member_qr_payload(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_member_qr_partner(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_member_qr_payload(TEXT) TO anon, authenticated, service_role;
