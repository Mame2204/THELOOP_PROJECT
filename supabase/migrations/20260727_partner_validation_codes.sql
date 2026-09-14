-- THE LOOP — Codes partenaire (CODE-XXXXX) + rachats avantages + statut pending_validation

-- 1. Codes de validation partenaire (partagés entre appareils)
CREATE TABLE IF NOT EXISTS public.partner_validation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_key TEXT NOT NULL UNIQUE,
  partner_name TEXT NOT NULL,
  validation_code TEXT NOT NULL UNIQUE,
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  partner_token_id UUID,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_validation_code_format CHECK (validation_code ~ '^CODE-[A-Z0-9]{5}$')
);

CREATE INDEX IF NOT EXISTS idx_partner_validation_codes_code ON public.partner_validation_codes(validation_code);

-- 2. Demandes de consommation d'avantages (validation partenaire)
CREATE TABLE IF NOT EXISTS public.benefit_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id TEXT UNIQUE,
  benefit_id TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  partner_key TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  partner_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'validated', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  validated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_benefit_redemptions_pending
  ON public.benefit_redemptions(user_id, partner_key, status)
  WHERE status = 'pending';

-- 3. Étendre le statut des octrois Prime
ALTER TABLE public.prime_benefit_grants
  DROP CONSTRAINT IF EXISTS prime_benefit_grants_status_check;

ALTER TABLE public.prime_benefit_grants
  ADD CONSTRAINT prime_benefit_grants_status_check
  CHECK (status IN ('active', 'pending_validation', 'used', 'expired_unused'));

-- 4. RPC — recherche code partenaire (visiteur / scan)
CREATE OR REPLACE FUNCTION public.find_partner_by_validation_code(p_code TEXT)
RETURNS TABLE(partner_key TEXT, partner_name TEXT, validation_code TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pvc.partner_key, pvc.partner_name, pvc.validation_code
  FROM public.partner_validation_codes pvc
  WHERE pvc.validation_code = upper(trim(p_code))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_partner_by_validation_code(TEXT) TO anon, authenticated;

-- 5. RPC — créer ou récupérer un code partenaire
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
BEGIN
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
        p_partner_key, p_partner_name, v_code, p_establishment_id, p_user_id
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

GRANT EXECUTE ON FUNCTION public.ensure_partner_validation_code(TEXT, TEXT, UUID, UUID) TO anon, authenticated;

-- 6. Seed codes pour établissements actifs existants
DO $$
DECLARE
  r RECORD;
  v_suffix TEXT;
  v_code TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i INT;
BEGIN
  FOR r IN SELECT id, name FROM public.establishments WHERE is_active = TRUE LOOP
    IF EXISTS (SELECT 1 FROM public.partner_validation_codes WHERE partner_key = r.id::text) THEN
      CONTINUE;
    END IF;
    v_suffix := '';
    FOR v_i IN 1..5 LOOP
      v_suffix := v_suffix || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    END LOOP;
    v_code := 'CODE-' || v_suffix;
    INSERT INTO public.partner_validation_codes (partner_key, partner_name, validation_code, establishment_id)
    VALUES (r.id::text, r.name, v_code, r.id)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 7. RLS
ALTER TABLE public.partner_validation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read partner validation codes" ON public.partner_validation_codes;
CREATE POLICY "Public read partner validation codes"
  ON public.partner_validation_codes FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Service manage partner validation codes" ON public.partner_validation_codes;
CREATE POLICY "Service manage partner validation codes"
  ON public.partner_validation_codes FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admin manage benefit redemptions" ON public.benefit_redemptions;
CREATE POLICY "Admin manage benefit redemptions"
  ON public.benefit_redemptions FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users manage own benefit redemptions" ON public.benefit_redemptions;
CREATE POLICY "Users manage own benefit redemptions"
  ON public.benefit_redemptions FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Anon insert benefit redemptions" ON public.benefit_redemptions;
CREATE POLICY "Anon insert benefit redemptions"
  ON public.benefit_redemptions FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anon read pending benefit redemptions" ON public.benefit_redemptions;
CREATE POLICY "Anon read pending benefit redemptions"
  ON public.benefit_redemptions FOR SELECT TO anon
  USING (status = 'pending' AND expires_at > NOW());

DROP POLICY IF EXISTS "Anon update pending benefit redemptions" ON public.benefit_redemptions;
CREATE POLICY "Anon update pending benefit redemptions"
  ON public.benefit_redemptions FOR UPDATE TO anon
  USING (status = 'pending')
  WITH CHECK (status IN ('pending', 'validated', 'cancelled', 'expired'));
