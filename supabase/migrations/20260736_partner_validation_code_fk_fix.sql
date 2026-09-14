-- THE LOOP — Éviter les FK invalides sur partner_validation_codes (user UUID ≠ establishment)

CREATE OR REPLACE FUNCTION public.ensure_partner_validation_code(
  p_partner_key TEXT,
  p_partner_name TEXT,
  p_establishment_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE(partner_key TEXT, partner_name TEXT, validation_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_suffix TEXT := '';
  v_i INT;
  j INT;
  v_establishment_id UUID := p_establishment_id;
  v_user_id UUID := p_user_id;
BEGIN
  IF v_establishment_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = v_establishment_id) THEN
    v_establishment_id := NULL;
  END IF;

  IF v_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user_id) THEN
    v_user_id := NULL;
  END IF;

  SELECT pvc.partner_key, pvc.partner_name, pvc.validation_code
  INTO partner_key, partner_name, validation_code
  FROM public.partner_validation_codes pvc
  WHERE pvc.partner_key = p_partner_key
  LIMIT 1;

  IF FOUND THEN
    RETURN NEXT;
    RETURN;
  END IF;

  FOR v_i IN 1..12 LOOP
    v_suffix := '';
    FOR j IN 1..5 LOOP
      v_suffix := v_suffix || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    END LOOP;
    v_code := 'CODE-' || v_suffix;
    BEGIN
      INSERT INTO public.partner_validation_codes (
        partner_key, partner_name, validation_code, establishment_id, user_id
      ) VALUES (
        p_partner_key, p_partner_name, v_code, v_establishment_id, v_user_id
      );
      partner_key := p_partner_key;
      partner_name := p_partner_name;
      validation_code := v_code;
      RETURN NEXT;
      RETURN;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RAISE EXCEPTION 'Impossible de générer un code partenaire unique';
END;
$$;
