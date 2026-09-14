-- THE LOOP — Enregistrement / lecture des demandes « Utiliser » (scan partenaire)
-- Contourne RLS : le clic membre doit être visible depuis l’appareil partenaire.
-- Exécuter dans le SQL Editor Supabase si le CLI n’est pas branché.

-- ── 1. Insert demande de validation (clic Utiliser) ───────────────────────────
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

  -- Annule les anciennes demandes pending du même avantage
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

  -- Colonnes contenu optionnelles (migration 20260850)
  BEGIN
    UPDATE public.benefit_redemptions
    SET
      content_id = COALESCE(NULLIF(trim(COALESCE(p_content_id, '')), ''), content_id),
      content_type = COALESCE(v_content_type, content_type),
      content_title = COALESCE(NULLIF(trim(COALESCE(p_content_title, '')), ''), content_title)
    WHERE local_id = p_local_id;
  EXCEPTION
    WHEN undefined_column THEN
      NULL; -- colonnes content_* absentes
  END;

  -- Passe l’octroi en pending_validation si connu (ne touche pas un used)
  IF EXISTS (
    SELECT 1 FROM public.prime_benefit_grants g
    WHERE g.local_id = p_benefit_id
      AND g.user_id = p_user_id
      AND g.status IN ('active', 'pending_validation')
  ) THEN
    UPDATE public.prime_benefit_grants
    SET status = COALESCE(NULLIF(trim(p_grant_status), ''), 'pending_validation')
    WHERE local_id = p_benefit_id
      AND user_id = p_user_id
      AND status IN ('active', 'pending_validation');
  ELSIF p_benefit_title IS NOT NULL AND trim(p_benefit_title) <> '' THEN
    -- Octroi pas encore sync : crée une ligne minimale pour le JOIN RPC partenaire
    PERFORM public.upsert_prime_benefit_grant(
      p_benefit_id,
      p_user_id,
      trim(p_benefit_title),
      COALESCE(p_benefit_description, ''),
      NULLIF(trim(p_partner_name), ''),
      'pending_validation',
      NOW(),
      '2099-12-31T23:59:59.999Z'::timestamptz,
      NULL,
      'individual',
      NULL,
      NULL,
      NULL,
      NULL
    );
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

-- ── 2. Liste TOUTES les demandes pending d’un membre (scan partenaire) ───────
CREATE OR REPLACE FUNCTION public.list_member_pending_benefit_redemptions(
  p_member_user_id UUID
)
RETURNS TABLE (
  redemption_local_id TEXT,
  benefit_id TEXT,
  benefit_title TEXT,
  benefit_description TEXT,
  partner_key TEXT,
  partner_name TEXT,
  partner_code TEXT,
  content_id TEXT,
  content_type TEXT,
  content_title TEXT,
  expires_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    br.local_id,
    br.benefit_id,
    COALESCE(NULLIF(trim(pg.title), ''), NULLIF(trim(br.content_title), ''), 'Avantage'),
    COALESCE(pg.description, ''),
    br.partner_key,
    br.partner_name,
    br.partner_code,
    br.content_id,
    br.content_type,
    br.content_title,
    br.expires_at
  FROM public.benefit_redemptions br
  LEFT JOIN public.prime_benefit_grants pg
    ON pg.local_id = br.benefit_id
   AND pg.user_id = br.user_id
  WHERE br.user_id = p_member_user_id
    AND br.status = 'pending'
    AND br.expires_at > NOW()
    AND (pg.status IS NULL OR pg.status IN ('pending_validation', 'active'));
$$;

REVOKE ALL ON FUNCTION public.list_member_pending_benefit_redemptions(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_member_pending_benefit_redemptions(UUID) TO anon, authenticated, service_role;
