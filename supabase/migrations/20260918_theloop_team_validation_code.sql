-- THE LOOP — Code partenaire unique pour l'équipe admin (événements / contenus équipe).
-- Remplace les codes par compte admin / super admin (partner_key = user UUID).

DO $$
DECLARE
  v_team_key TEXT := 'theloop-team';
  v_team_name TEXT := 'THE LOOP';
  v_source_id UUID;
  v_updated INT;
BEGIN
  IF to_regclass('public.partner_validation_codes') IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.partner_validation_codes WHERE partner_key = v_team_key) THEN
    SELECT pvc.id
    INTO v_source_id
    FROM public.partner_validation_codes pvc
    JOIN public.users u ON u.id = pvc.user_id
    WHERE u.user_role IN ('super_admin', 'admin')
      AND pvc.partner_key <> v_team_key
    ORDER BY CASE WHEN u.user_role = 'super_admin' THEN 0 ELSE 1 END, pvc.created_at ASC
    LIMIT 1;

    IF v_source_id IS NULL THEN
      SELECT pvc.id
      INTO v_source_id
      FROM public.partner_validation_codes pvc
      JOIN public.users u ON pvc.partner_key = u.id::text
      WHERE u.user_role IN ('super_admin', 'admin')
        AND pvc.partner_key <> v_team_key
      ORDER BY CASE WHEN u.user_role = 'super_admin' THEN 0 ELSE 1 END, pvc.created_at ASC
      LIMIT 1;
    END IF;

    IF v_source_id IS NOT NULL THEN
      -- Réutilise la ligne existante (conserve validation_code unique) au lieu d'un INSERT doublon.
      UPDATE public.partner_validation_codes
      SET
        partner_key = v_team_key,
        partner_name = v_team_name,
        user_id = NULL,
        updated_at = NOW()
      WHERE id = v_source_id;
      GET DIAGNOSTICS v_updated = ROW_COUNT;
    END IF;

    IF v_source_id IS NULL OR v_updated = 0 THEN
      PERFORM public.ensure_partner_validation_code(v_team_key, v_team_name, NULL, NULL);
    END IF;
  END IF;

  DELETE FROM public.partner_validation_codes pvc
  USING public.users u
  WHERE pvc.user_id = u.id
    AND u.user_role IN ('super_admin', 'admin')
    AND pvc.partner_key <> v_team_key;

  DELETE FROM public.partner_validation_codes pvc
  USING public.users u
  WHERE pvc.partner_key = u.id::text
    AND u.user_role IN ('super_admin', 'admin')
    AND pvc.partner_key <> v_team_key;

  IF to_regclass('public.benefit_redemptions') IS NOT NULL THEN
    UPDATE public.benefit_redemptions br
    SET
      partner_key = v_team_key,
      partner_name = v_team_name
    FROM public.users u
    WHERE br.partner_key = u.id::text
      AND u.user_role IN ('super_admin', 'admin');
  END IF;
END $$;
