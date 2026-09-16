import type { SupabaseClient } from '@supabase/supabase-js';
import { estimateDjomyPayInFee } from '../lib/djomy-fees.js';
import { PAYMENT_INTENT_COLUMNS } from '../lib/supabase-list.js';
import type { PaymentIntentRow } from '../lib/supabase-admin.js';

export interface PayoutLineInput {
  paymentMethod: string;
  wiredAmountGnf: number;
  periodStart?: string | null;
  periodEnd?: string | null;
  notes?: string | null;
}

export interface BankPayoutLineRecord {
  id: string;
  paymentMethod: string;
  wiredAmountGnf: number;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string | null;
}

export interface BankPayoutRecord {
  id: string;
  payoutDate: string;
  bankReference: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  totalWiredGnf: number;
  lines: BankPayoutLineRecord[];
}

export interface PayoutReconciliationRow {
  paymentMethod: string;
  paidCount: number;
  grossVolumeGnf: number;
  estimatedFeeGnf: number;
  estimatedNetGnf: number;
  wiredRecordedGnf: number;
  deltaGnf: number;
}

export interface PayoutReconciliationSummary {
  periodDays: number;
  from: string;
  to: string;
  totals: {
    grossVolumeGnf: number;
    estimatedFeeGnf: number;
    estimatedNetGnf: number;
    wiredRecordedGnf: number;
    deltaGnf: number;
  };
  byPaymentMethod: PayoutReconciliationRow[];
}

type PayoutRow = {
  id: string;
  payout_date: string;
  bank_reference: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
};

type PayoutLineRow = {
  id: string;
  payout_id: string;
  payment_method: string;
  wired_amount_gnf: number;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
};

async function resolveCountryUserIds(
  supabase: SupabaseClient,
  countryCode: string,
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('country_code', countryCode)
    .limit(5000);
  if (error) throw new Error(error.message);
  const ids = (data ?? []).map((u) => String(u.id));
  return ids.length ? ids : [];
}

function volumeFor(row: PaymentIntentRow): number {
  const n = Number(row.djomy_paid_amount ?? row.amount_gnf ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function listBankPayouts(
  supabase: SupabaseClient,
  options?: { limit?: number },
): Promise<BankPayoutRecord[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const { data: payouts, error } = await supabase
    .from('djomy_bank_payouts')
    .select('id, payout_date, bank_reference, notes, created_at, created_by')
    .order('payout_date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  const rows = (payouts ?? []) as PayoutRow[];
  if (!rows.length) return [];

  const payoutIds = rows.map((p) => p.id);
  const { data: lines, error: linesError } = await supabase
    .from('djomy_bank_payout_lines')
    .select('id, payout_id, payment_method, wired_amount_gnf, period_start, period_end, notes')
    .in('payout_id', payoutIds);

  if (linesError) throw new Error(linesError.message);

  const linesByPayout = new Map<string, BankPayoutLineRecord[]>();
  for (const line of (lines ?? []) as PayoutLineRow[]) {
    const bucket = linesByPayout.get(line.payout_id) ?? [];
    bucket.push({
      id: line.id,
      paymentMethod: line.payment_method,
      wiredAmountGnf: line.wired_amount_gnf,
      periodStart: line.period_start,
      periodEnd: line.period_end,
      notes: line.notes,
    });
    linesByPayout.set(line.payout_id, bucket);
  }

  return rows.map((payout) => {
    const payoutLines = linesByPayout.get(payout.id) ?? [];
    return {
      id: payout.id,
      payoutDate: payout.payout_date,
      bankReference: payout.bank_reference,
      notes: payout.notes,
      createdAt: payout.created_at,
      createdBy: payout.created_by,
      totalWiredGnf: payoutLines.reduce((sum, l) => sum + l.wiredAmountGnf, 0),
      lines: payoutLines,
    };
  });
}

export async function createBankPayout(
  supabase: SupabaseClient,
  input: {
    payoutDate: string;
    bankReference?: string | null;
    notes?: string | null;
    createdBy?: string | null;
    lines: PayoutLineInput[];
  },
): Promise<BankPayoutRecord> {
  const lines = input.lines.filter((l) => l.wiredAmountGnf > 0);
  if (!lines.length) throw new Error('Au moins une ligne de versement est requise.');

  const { data: payout, error } = await supabase
    .from('djomy_bank_payouts')
    .insert({
      payout_date: input.payoutDate,
      bank_reference: input.bankReference?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: input.createdBy ?? null,
    })
    .select('id, payout_date, bank_reference, notes, created_at, created_by')
    .single();

  if (error || !payout) throw new Error(error?.message ?? 'Création versement impossible.');

  const lineRows = lines.map((line) => ({
    payout_id: payout.id,
    payment_method: line.paymentMethod.trim().toLowerCase() || 'all',
    wired_amount_gnf: Math.round(line.wiredAmountGnf),
    period_start: line.periodStart?.trim() || null,
    period_end: line.periodEnd?.trim() || null,
    notes: line.notes?.trim() || null,
  }));

  const { data: insertedLines, error: linesError } = await supabase
    .from('djomy_bank_payout_lines')
    .insert(lineRows)
    .select('id, payout_id, payment_method, wired_amount_gnf, period_start, period_end, notes');

  if (linesError) throw new Error(linesError.message);

  const mappedLines = ((insertedLines ?? []) as PayoutLineRow[]).map((line) => ({
    id: line.id,
    paymentMethod: line.payment_method,
    wiredAmountGnf: line.wired_amount_gnf,
    periodStart: line.period_start,
    periodEnd: line.period_end,
    notes: line.notes,
  }));

  return {
    id: payout.id,
    payoutDate: payout.payout_date,
    bankReference: payout.bank_reference,
    notes: payout.notes,
    createdAt: payout.created_at,
    createdBy: payout.created_by,
    totalWiredGnf: mappedLines.reduce((sum, l) => sum + l.wiredAmountGnf, 0),
    lines: mappedLines,
  };
}

export async function computePayoutReconciliation(
  supabase: SupabaseClient,
  options?: { countryCode?: string; days?: number },
): Promise<PayoutReconciliationSummary> {
  const daysRaw = Number(options?.days ?? 90);
  const periodDays = Number.isFinite(daysRaw) ? Math.min(Math.max(1, daysRaw), 365) : 90;
  const to = new Date();
  const from = new Date(to.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString();

  let countryUserIds: string[] | null = null;
  if (options?.countryCode) {
    countryUserIds = await resolveCountryUserIds(supabase, options.countryCode);
    if (countryUserIds?.length === 0) {
      return {
        periodDays,
        from: fromIso,
        to: to.toISOString(),
        totals: {
          grossVolumeGnf: 0,
          estimatedFeeGnf: 0,
          estimatedNetGnf: 0,
          wiredRecordedGnf: 0,
          deltaGnf: 0,
        },
        byPaymentMethod: [],
      };
    }
  }

  let intentsQuery = supabase
    .from('payment_intents')
    .select(PAYMENT_INTENT_COLUMNS)
    .gte('created_at', fromIso)
    .in('status', ['paid'])
    .limit(5000);

  if (countryUserIds) intentsQuery = intentsQuery.in('user_id', countryUserIds);

  const { data: intents, error: intentsError } = await intentsQuery;
  if (intentsError) throw new Error(intentsError.message);

  const methodMap = new Map<string, PayoutReconciliationRow>();

  for (const row of (intents ?? []) as unknown as PaymentIntentRow[]) {
    const method = row.payment_method?.trim().toLowerCase() || 'unknown';
    const gross = volumeFor(row);
    const fee = estimateDjomyPayInFee(gross, method);
    const feeGnf =
      fee.feeGnf
      ?? Math.round(((fee.feeRangeGnf?.[0] ?? 0) + (fee.feeRangeGnf?.[1] ?? 0)) / 2);
    const netGnf = fee.netGnf ?? gross - feeGnf;

    const existing = methodMap.get(method) ?? {
      paymentMethod: method,
      paidCount: 0,
      grossVolumeGnf: 0,
      estimatedFeeGnf: 0,
      estimatedNetGnf: 0,
      wiredRecordedGnf: 0,
      deltaGnf: 0,
    };
    existing.paidCount += 1;
    existing.grossVolumeGnf += gross;
    existing.estimatedFeeGnf += feeGnf;
    existing.estimatedNetGnf += netGnf;
    methodMap.set(method, existing);
  }

  const { data: payoutLines, error: payoutError } = await supabase
    .from('djomy_bank_payout_lines')
    .select('payment_method, wired_amount_gnf, period_start, period_end, created_at')
    .gte('created_at', fromIso)
    .limit(5000);

  if (payoutError) throw new Error(payoutError.message);

  for (const line of (payoutLines ?? []) as Array<{
    payment_method: string;
    wired_amount_gnf: number;
  }>) {
    const method = line.payment_method?.trim().toLowerCase() || 'all';
    const existing = methodMap.get(method) ?? {
      paymentMethod: method,
      paidCount: 0,
      grossVolumeGnf: 0,
      estimatedFeeGnf: 0,
      estimatedNetGnf: 0,
      wiredRecordedGnf: 0,
      deltaGnf: 0,
    };
    existing.wiredRecordedGnf += line.wired_amount_gnf;
    methodMap.set(method, existing);
  }

  const byPaymentMethod = [...methodMap.values()]
    .map((row) => ({
      ...row,
      deltaGnf: row.wiredRecordedGnf - row.estimatedNetGnf,
    }))
    .sort((a, b) => b.grossVolumeGnf - a.grossVolumeGnf || b.wiredRecordedGnf - a.wiredRecordedGnf);

  const totals = byPaymentMethod.reduce(
    (acc, row) => ({
      grossVolumeGnf: acc.grossVolumeGnf + row.grossVolumeGnf,
      estimatedFeeGnf: acc.estimatedFeeGnf + row.estimatedFeeGnf,
      estimatedNetGnf: acc.estimatedNetGnf + row.estimatedNetGnf,
      wiredRecordedGnf: acc.wiredRecordedGnf + row.wiredRecordedGnf,
      deltaGnf: acc.deltaGnf + row.deltaGnf,
    }),
    {
      grossVolumeGnf: 0,
      estimatedFeeGnf: 0,
      estimatedNetGnf: 0,
      wiredRecordedGnf: 0,
      deltaGnf: 0,
    },
  );

  return {
    periodDays,
    from: fromIso,
    to: to.toISOString(),
    totals,
    byPaymentMethod,
  };
}
