-- THE LOOP — Catalogue avantages Prime + octrois planifiés

CREATE TABLE IF NOT EXISTS public.benefit_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  partner_name TEXT,
  default_validity_days INTEGER NOT NULL DEFAULT 30 CHECK (default_validity_days > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prime_benefit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES public.benefit_catalog(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  partner_name TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'used', 'expired_unused')),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  grant_audience TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.scheduled_benefit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_ids UUID[] NOT NULL,
  audience TEXT NOT NULL,
  target_phones TEXT,
  custom_note TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'cancelled')),
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prime_benefit_grants_user ON public.prime_benefit_grants(user_id, status);
CREATE INDEX IF NOT EXISTS idx_scheduled_benefit_grants_due ON public.scheduled_benefit_grants(status, scheduled_at);

ALTER TABLE public.benefit_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prime_benefit_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_benefit_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage benefit catalog" ON public.benefit_catalog;
CREATE POLICY "Admin manage benefit catalog"
  ON public.benefit_catalog FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users read own benefit grants" ON public.prime_benefit_grants;
CREATE POLICY "Users read own benefit grants"
  ON public.prime_benefit_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users update own benefit grants used" ON public.prime_benefit_grants;
CREATE POLICY "Users update own benefit grants used"
  ON public.prime_benefit_grants FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin manage benefit grants" ON public.prime_benefit_grants;
CREATE POLICY "Admin manage benefit grants"
  ON public.prime_benefit_grants FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin manage scheduled grants" ON public.scheduled_benefit_grants;
CREATE POLICY "Admin manage scheduled grants"
  ON public.scheduled_benefit_grants FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Seed catalogue démo
INSERT INTO public.benefit_catalog (title, description, partner_name, default_validity_days)
SELECT '-20% réservation', 'Réduction de 20% sur votre prochaine réservation partenaire.', 'L''Avenue', 60
WHERE NOT EXISTS (SELECT 1 FROM public.benefit_catalog WHERE title = '-20% réservation');

INSERT INTO public.benefit_catalog (title, description, partner_name, default_validity_days)
SELECT 'Cocktail offert', 'Un cocktail signature offert pour 2 personnes minimum.', 'Sky Lounge', 30
WHERE NOT EXISTS (SELECT 1 FROM public.benefit_catalog WHERE title = 'Cocktail offert');
