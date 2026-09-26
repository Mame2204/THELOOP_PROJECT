-- Octroi individuel (admin) : après 20260928, upsert_prime_benefit_grant refuse la
-- création côté membre. request_benefit_redemption appelait encore upsert → grant
-- absent en base → validation partenaire (apply_partner_benefit_validation) = 0.
-- Matérialisation directe en SECURITY DEFINER, ids ben-* uniquement (octrois admin).

CREATE OR REPLACE FUNCTION public.request_benefit_redemption(
  p_local_id TEXT,
  p_benefit_id TEXT,
  p_user_id UUID,
  p_partner_key TEXT,
  p_partner_name TEXT,
  p_partner_code TEXT,
  p_expires_at TIMESTAMPTZ,
  p_content_id TEXT DEFAULT NULL,
  p_content_type TEXT DEFAULT NULL,
  p_content_title TEXT DEFAULT NULL,
  p_benefit_title TEXT DEFAULT NULL,
  p_benefit_description TEXT DEFAULT NULL,
  p_grant_status TEXT DEFAULT 'pending_validation'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := upper(trim(COALESCE(p_partner_code, '')));
  v_content_type TEXT := NULLIF(trim(COALESCE(p_content_type, '')), '');
  v_grant_status TEXT := COALESCE(NULLIF(trim(p_grant_status), ''), 'pending_validation');
BEGIN
  IF p_local_id IS NULL OR trim(p_local_id) = '' THEN
    RAISE EXCEPTION 'local_id requis';
  END IF;
  IF p_benefit_id IS NULL OR trim(p_benefit_id) = '' THEN
    RAISE EXCEPTION 'benefit_id requis';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id requis';
  END IF;
  IF v_code = '' THEN
    RAISE EXCEPTION 'partner_code requis';
  END IF;
  IF v_content_type IS NOT NULL AND v_content_type NOT IN ('event', 'spot', 'tool') THEN
    v_content_type := NULL;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS NOT NULL
     AND auth.uid() <> p_user_id
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.benefit_redemptions
  SET status = 'cancelled'
  WHERE user_id = p_user_id
    AND benefit_id = p_benefit_id
    AND status = 'pending'
    AND local_id IS DISTINCT FROM p_local_id;

  INSERT INTO public.benefit_redemptions (
    local_id,
    benefit_id,
    user_id,
    partner_key,
    partner_name,
    partner_code,
    status,
    created_at,
    expires_at
  ) VALUES (
    p_local_id,
    p_benefit_id,
    p_user_id,
    COALESCE(NULLIF(trim(p_partner_key), ''), p_user_id::text),
    COALESCE(NULLIF(trim(p_partner_name), ''), 'Partenaire'),
    v_code,
    'pending',
    NOW(),
    p_expires_at
  )
  ON CONFLICT (local_id) DO UPDATE SET
    benefit_id = EXCLUDED.benefit_id,
    user_id = EXCLUDED.user_id,
    partner_key = EXCLUDED.partner_key,
    partner_name = EXCLUDED.partner_name,
    partner_code = EXCLUDED.partner_code,
    status = 'pending',
    expires_at = EXCLUDED.expires_at;

  BEGIN
    UPDATE public.benefit_redemptions
    SET
      content_id = COALESCE(NULLIF(trim(COALESCE(p_content_id, '')), ''), content_id),
      content_type = COALESCE(v_content_type, content_type),
      content_title = COALESCE(NULLIF(trim(COALESCE(p_content_title, '')), ''), content_title)
    WHERE local_id = p_local_id;
  EXCEPTION
    WHEN undefined_column THEN
      NULL;
  END;

  IF EXISTS (
    SELECT 1 FROM public.prime_benefit_grants g
    WHERE g.local_id = p_benefit_id
      AND g.user_id = p_user_id
      AND g.status IN ('active', 'pending_validation')
  ) THEN
    UPDATE public.prime_benefit_grants
    SET status = v_grant_status
    WHERE local_id = p_benefit_id
      AND user_id = p_user_id
      AND status IN ('active', 'pending_validation');
  ELSIF p_benefit_title IS NOT NULL AND trim(p_benefit_title) <> ''
        AND p_benefit_id LIKE 'ben-%'
        AND p_benefit_id NOT LIKE 'role-ben-%' THEN
    INSERT INTO public.prime_benefit_grants (
      local_id,
      user_id,
      title,
      description,
      partner_name,
      status,
      granted_at,
      expires_at,
      used_at,
      grant_audience,
      grant_country_code,
      grant_city,
      catalog_local_id,
      role_entitlement
    ) VALUES (
      p_benefit_id,
      p_user_id,
      trim(p_benefit_title),
      COALESCE(p_benefit_description, ''),
      NULLIF(trim(p_partner_name), ''),
      v_grant_status,
      NOW(),
      '2099-12-31T23:59:59.999Z'::timestamptz,
      NULL,
      'individual',
      NULL,
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT (local_id) WHERE local_id IS NOT NULL DO UPDATE SET
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      partner_name = COALESCE(EXCLUDED.partner_name, public.prime_benefit_grants.partner_name),
      status = CASE
        WHEN public.prime_benefit_grants.status = 'used' THEN public.prime_benefit_grants.status
        ELSE v_grant_status
      END;
  END IF;

  RETURN p_local_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_benefit_redemption(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_benefit_redemption(
  TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated, service_role;
