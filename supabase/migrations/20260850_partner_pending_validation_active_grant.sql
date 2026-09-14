-- THE LOOP — Pending validations : octrois « active » + colonnes contenu optionnelles
-- Exécutable en SQL Editor : ajoute d'abord content_id/type/title si absents (SECURITY DEFINER),
-- puis recrée les RPC partenaire (SECURITY DEFINER + filtre code partenaire).
--
-- Erreur 42501 « must be owner of table benefit_redemptions » sur l'étape 1 ?
--   → Exécutez d'abord supabase/scripts/benefit_redemption_content.sql (BLOC 2 seul),
--   → OU supabase/scripts/partner_pending_validation_fallback.sql (RPC sans colonnes contenu).

-- ── 1. Colonnes contenu sur benefit_redemptions (idempotent) ─────────────────
CREATE OR REPLACE FUNCTION public.apply_benefit_redemption_content_columns()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  ALTER TABLE public.benefit_redemptions
    ADD COLUMN IF NOT EXISTS content_id TEXT,
    ADD COLUMN IF NOT EXISTS content_type TEXT CHECK (content_type IS NULL OR content_type IN ('event', 'spot', 'tool')),
    ADD COLUMN IF NOT EXISTS content_title TEXT;

  CREATE INDEX IF NOT EXISTS idx_benefit_redemptions_content
    ON public.benefit_redemptions(content_id)
    WHERE content_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_benefit_redemption_content_columns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_benefit_redemption_content_columns() TO postgres, service_role;

SELECT public.apply_benefit_redemption_content_columns();

DROP FUNCTION IF EXISTS public.apply_benefit_redemption_content_columns();

-- ── 2. RPC lecture demandes en attente (scan QR partenaire) ───────────────────
CREATE OR REPLACE FUNCTION public.list_partner_pending_validations(
  p_member_user_id UUID,
  p_partner_code TEXT
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
  WITH normalized AS (
    SELECT upper(trim(p_partner_code)) AS code
  )
  SELECT
    br.local_id,
    br.benefit_id,
    pg.title,
    pg.description,
    br.partner_key,
    br.partner_name,
    br.partner_code,
    br.content_id,
    br.content_type,
    br.content_title,
    br.expires_at
  FROM public.benefit_redemptions br
  INNER JOIN public.prime_benefit_grants pg
    ON pg.local_id = br.benefit_id
   AND pg.user_id = br.user_id
  CROSS JOIN normalized n
  WHERE br.user_id = p_member_user_id
    AND br.status = 'pending'
    AND br.expires_at > NOW()
    AND pg.status IN ('pending_validation', 'active')
    AND EXISTS (
      SELECT 1
      FROM public.partner_validation_codes pvc
      WHERE pvc.validation_code = n.code
        AND (
          br.partner_code = n.code
          OR br.partner_key = pvc.partner_key
          OR lower(trim(br.partner_name)) = lower(trim(pvc.partner_name))
        )
    );
$$;

-- ── 3. RPC validation / annulation partenaire ────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_partner_benefit_validation(
  p_partner_code TEXT,
  p_redemption_local_ids TEXT[],
  p_validate BOOLEAN DEFAULT TRUE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT := upper(trim(p_partner_code));
  v_count INTEGER := 0;
  v_red RECORD;
BEGIN
  IF p_redemption_local_ids IS NULL OR array_length(p_redemption_local_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.partner_validation_codes pvc WHERE pvc.validation_code = v_code
  ) THEN
    RAISE EXCEPTION 'invalid_partner_code';
  END IF;

  FOR v_red IN
    SELECT br.local_id, br.benefit_id, br.user_id, br.partner_key, br.partner_name, br.partner_code, br.status, br.expires_at
    FROM public.benefit_redemptions br
    WHERE br.local_id = ANY(p_redemption_local_ids)
      AND br.status = 'pending'
      AND br.expires_at > NOW()
      AND EXISTS (
        SELECT 1
        FROM public.partner_validation_codes pvc
        WHERE pvc.validation_code = v_code
          AND (
            br.partner_code = v_code
            OR br.partner_key = pvc.partner_key
            OR lower(trim(br.partner_name)) = lower(trim(pvc.partner_name))
          )
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.prime_benefit_grants pg
      WHERE pg.local_id = v_red.benefit_id
        AND pg.user_id = v_red.user_id
        AND pg.status IN ('pending_validation', 'active')
    ) THEN
      CONTINUE;
    END IF;

    IF p_validate THEN
      UPDATE public.benefit_redemptions
      SET status = 'validated', validated_at = NOW()
      WHERE local_id = v_red.local_id;

      UPDATE public.prime_benefit_grants
      SET status = 'used', used_at = NOW()
      WHERE local_id = v_red.benefit_id
        AND user_id = v_red.user_id
        AND status IN ('pending_validation', 'active');
    ELSE
      UPDATE public.benefit_redemptions
      SET status = 'cancelled'
      WHERE local_id = v_red.local_id;

      UPDATE public.prime_benefit_grants
      SET status = 'active'
      WHERE local_id = v_red.benefit_id
        AND user_id = v_red.user_id
        AND status IN ('pending_validation', 'active');
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.list_partner_pending_validations(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_partner_benefit_validation(TEXT, TEXT[], BOOLEAN) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_partner_pending_validations(UUID, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_partner_benefit_validation(TEXT, TEXT[], BOOLEAN) TO anon, authenticated, service_role;
