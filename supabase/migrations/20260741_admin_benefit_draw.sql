-- THE LOOP — Tirage au sort admin + validité avantage depuis consommation

ALTER TABLE public.prime_benefit_grants
  ADD COLUMN IF NOT EXISTS validity_days INTEGER,
  ADD COLUMN IF NOT EXISTS validity_starts_on_activation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.admin_benefit_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roles TEXT[] NOT NULL,
  winner_count INTEGER NOT NULL CHECK (winner_count > 0),
  catalog_id TEXT NOT NULL,
  catalog_title TEXT NOT NULL,
  partner_key TEXT,
  partner_name TEXT,
  validity_days INTEGER NOT NULL CHECK (validity_days > 0),
  validity_starts_on_activation BOOLEAN NOT NULL DEFAULT TRUE,
  country_code CHAR(2) NOT NULL DEFAULT 'GN',
  custom_note TEXT,
  drawn_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  drawn_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  winners JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_admin_benefit_draws_country
  ON public.admin_benefit_draws(country_code, drawn_at DESC);

ALTER TABLE public.admin_benefit_draws ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage benefit draws" ON public.admin_benefit_draws;
CREATE POLICY "Admin manage benefit draws"
  ON public.admin_benefit_draws FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
