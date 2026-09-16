-- Compta PASS Djomy : versements bancaires par période (du … au … on a encaissé X, viré Y).

CREATE TABLE IF NOT EXISTS public.djomy_accounting_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  wired_amount_gnf INTEGER NOT NULL CHECK (wired_amount_gnf >= 0),
  payout_date DATE NOT NULL,
  bank_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT djomy_settlement_period_order CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS idx_djomy_accounting_settlements_period
  ON public.djomy_accounting_settlements (period_start DESC, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_djomy_accounting_settlements_payout_date
  ON public.djomy_accounting_settlements (payout_date DESC);

ALTER TABLE public.djomy_accounting_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full djomy_accounting_settlements" ON public.djomy_accounting_settlements;
CREATE POLICY "Service role full djomy_accounting_settlements"
  ON public.djomy_accounting_settlements FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.djomy_accounting_settlements IS
  'Versements bancaires Djomy saisis par période comptable (Pay In collecté → virement J+2).';
