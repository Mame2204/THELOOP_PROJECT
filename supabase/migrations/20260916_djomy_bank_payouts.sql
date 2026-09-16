-- Versements bancaires Djomy (Pay In → virement marchand J+2) — réconciliation comptable THE LOOP

CREATE TABLE IF NOT EXISTS public.djomy_bank_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_date DATE NOT NULL,
  bank_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.djomy_bank_payout_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES public.djomy_bank_payouts(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL DEFAULT 'all',
  wired_amount_gnf INTEGER NOT NULL CHECK (wired_amount_gnf > 0),
  period_start DATE,
  period_end DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_djomy_bank_payouts_date
  ON public.djomy_bank_payouts (payout_date DESC);

CREATE INDEX IF NOT EXISTS idx_djomy_bank_payout_lines_payout
  ON public.djomy_bank_payout_lines (payout_id);

CREATE INDEX IF NOT EXISTS idx_djomy_bank_payout_lines_method
  ON public.djomy_bank_payout_lines (payment_method);

ALTER TABLE public.djomy_bank_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.djomy_bank_payout_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full djomy_bank_payouts" ON public.djomy_bank_payouts;
CREATE POLICY "Service role full djomy_bank_payouts"
  ON public.djomy_bank_payouts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full djomy_bank_payout_lines" ON public.djomy_bank_payout_lines;
CREATE POLICY "Service role full djomy_bank_payout_lines"
  ON public.djomy_bank_payout_lines FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.djomy_bank_payouts IS
  'Versements bancaires reçus de Djomy (retrait Pay In) — saisie admin pour réconciliation.';

COMMENT ON TABLE public.djomy_bank_payout_lines IS
  'Ventilation d''un virement par moyen de paiement (OM, carte, etc.).';
