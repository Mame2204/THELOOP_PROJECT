-- Notifier le membre (inbox) lors de la validation / annulation d''un privilège par le partenaire.
-- Source de vérité : RPC SECURITY DEFINER (fonctionne même en anon / double-tap logo).

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
  v_benefit_title TEXT;
  v_place TEXT;
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
    SELECT
      br.local_id,
      br.benefit_id,
      br.user_id,
      br.partner_key,
      br.partner_name,
      br.partner_code,
      br.content_title,
      br.status,
      br.expires_at
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

    SELECT pg.title
    INTO v_benefit_title
    FROM public.prime_benefit_grants pg
    WHERE pg.local_id = v_red.benefit_id
      AND pg.user_id = v_red.user_id
    LIMIT 1;

    v_benefit_title := COALESCE(NULLIF(trim(v_benefit_title), ''), 'Privilège');
    v_place := COALESCE(
      NULLIF(trim(v_red.content_title), ''),
      NULLIF(trim(v_red.partner_name), ''),
      'le partenaire'
    );

    IF p_validate THEN
      UPDATE public.benefit_redemptions
      SET status = 'validated', validated_at = NOW()
      WHERE local_id = v_red.local_id;

      UPDATE public.prime_benefit_grants
      SET status = 'used', used_at = NOW()
      WHERE local_id = v_red.benefit_id
        AND user_id = v_red.user_id
        AND status IN ('pending_validation', 'active');

      INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at)
      VALUES (
        v_red.user_id,
        'Privilège validé',
        format(
          'Votre privilège « %s » a été validé — %s.',
          v_benefit_title,
          v_place
        ),
        'individual',
        NOW()
      );
    ELSE
      UPDATE public.benefit_redemptions
      SET status = 'cancelled'
      WHERE local_id = v_red.local_id;

      UPDATE public.prime_benefit_grants
      SET status = 'active'
      WHERE local_id = v_red.benefit_id
        AND user_id = v_red.user_id
        AND status IN ('pending_validation', 'active');

      INSERT INTO public.user_notifications (user_id, title, message, audience, sent_at)
      VALUES (
        v_red.user_id,
        'Validation annulée',
        format(
          'La validation de « %s » chez %s a été annulée. Vous pouvez réutiliser le privilège.',
          v_benefit_title,
          v_place
        ),
        'individual',
        NOW()
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_partner_benefit_validation(TEXT, TEXT[], BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_partner_benefit_validation(TEXT, TEXT[], BOOLEAN) TO anon, authenticated, service_role;
