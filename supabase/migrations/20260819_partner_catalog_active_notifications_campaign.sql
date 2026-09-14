-- Partenaire : activer le catalogue sans upsert admin
-- Notifications : campaign_id legacy (NOT NULL) + RPC insert batch

-- -----------------------------------------------------------------------------
-- 1. campaign_id optionnel (schémas legacy)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_notifications'
      AND column_name = 'campaign_id'
  ) THEN
    ALTER TABLE public.user_notifications ALTER COLUMN campaign_id DROP NOT NULL;
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Insert notifications (admin → tous ; utilisateur → soi)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_user_notifications(p_rows JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r JSONB;
  n INT := 0;
  v_user_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_user_id := NULLIF(trim(COALESCE(r->>'user_id', '')), '')::uuid;

    IF NOT public.is_admin() THEN
      IF v_user_id IS NULL OR v_user_id IS DISTINCT FROM auth.uid() THEN
        CONTINUE;
      END IF;
    END IF;

    INSERT INTO public.user_notifications (
      user_id,
      recipient_phone,
      title,
      message,
      audience,
      sent_at,
      campaign_id
    ) VALUES (
      v_user_id,
      NULLIF(trim(COALESCE(r->>'recipient_phone', '')), ''),
      COALESCE(NULLIF(trim(r->>'title'), ''), 'Notification'),
      COALESCE(r->>'message', ''),
      COALESCE(NULLIF(trim(r->>'audience'), ''), 'individual'),
      COALESCE((r->>'sent_at')::timestamptz, NOW()),
      NULLIF(trim(COALESCE(r->>'campaign_id', '')), '')::uuid
    );
    n := n + 1;
  END LOOP;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_user_notifications(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_user_notifications(JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Partenaire : basculer is_active sur une entrée catalogue
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_set_benefit_catalog_active(
  p_local_id TEXT,
  p_is_active BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid TEXT := auth.uid()::text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_local_id IS NULL OR trim(p_local_id) = '' THEN
    RETURN FALSE;
  END IF;

  IF public.is_admin() THEN
    UPDATE public.benefit_catalog
    SET is_active = p_is_active, updated_at = NOW()
    WHERE local_id = p_local_id;
    RETURN FOUND;
  END IF;

  UPDATE public.benefit_catalog bc
  SET is_active = p_is_active, updated_at = NOW()
  WHERE bc.local_id = p_local_id
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(bc.offering_partners, '[]'::jsonb)) elem
      WHERE elem->>'partnerId' = v_uid
         OR elem->>'partnerId' = 'phone:' || v_uid
    );

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.partner_set_benefit_catalog_active(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.partner_set_benefit_catalog_active(TEXT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION public.partner_set_benefit_catalog_active IS
  'Active/désactive un avantage catalogue : admin ou partenaire listé dans offering_partners.';
