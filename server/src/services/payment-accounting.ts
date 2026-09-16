import type { SupabaseClient } from '@supabase/supabase-js';
import { estimateDjomyPayInFee, resolveDjomyPayInRatePercent } from '../lib/djomy-fees.js';
import { PAYMENT_INTENT_COLUMNS } from '../lib/supabase-list.js';
import type { PaymentIntentRow } from '../lib/supabase-admin.js';

export interface PaymentFeeFields {
  grossGnf: number;
  feeRatePercent: number | null;
  feeRateLabel: string;
  feeGnf: number;
  netGnf: number;
}

export interface AccountingMethodRow {
  paymentMethod: string;
  paidCount: number;
  grossGnf: number;
  feeGnf: number;
  netGnf: number;
}

export interface AccountingPeriodSummary {
  periodStart: string;
  periodEnd: string;
  paidCount: number;
  grossGnf: number;
  feeGnf: number;
  netGnf: number;
  wiredInPeriodGnf: number;
  remainingInPeriodGnf: number;
  byPaymentMethod: AccountingMethodRow[];
}

export interface AccountingBalance {
  grossGnf: number;
  feeGnf: number;
  netExpectedGnf: number;
  wiredTotalGnf: number;
  remainingOwedGnf: number;
  paidCount: number;
}

export interface AccountingSettlementRecord {
  id: string;
  periodStart: string;
  periodEnd: string;
  wiredAmountGnf: number;
  payoutDate: string;
  bankReference: string | null;
  notes: string | null;
  createdAt: string;
  /** Net attendu sur la période au moment de l'enregistrement (informatif). */
  expectedNetGnf: number;
  periodDeltaGnf: number;
}

type SettlementRow = {
  id: string;
  period_start: string;
  period_end: string;
  wired_amount_gnf: number;
  payout_date: string;
  bank_reference: string | null;
  notes: string | null;
  created_at: string;
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

export function enrichPaymentWithFees(row: PaymentIntentRow): PaymentFeeFields {
  const method = row.payment_method?.trim().toLowerCase() || 'all';
  const grossGnf = volumeFor(row);
  const fee = estimateDjomyPayInFee(grossGnf, method);
  const rate = resolveDjomyPayInRatePercent(method);
  const feeGnf =
    fee.feeGnf
    ?? Math.round(((fee.feeRangeGnf?.[0] ?? 0) + (fee.feeRangeGnf?.[1] ?? 0)) / 2);
  const netGnf = fee.netGnf ?? grossGnf - feeGnf;
  return {
    grossGnf,
    feeRatePercent: rate,
    feeRateLabel: fee.rateLabel,
    feeGnf,
    netGnf,
  };
}

async function loadPaidIntentsInRange(
  supabase: SupabaseClient,
  periodStart: string,
  periodEnd: string,
  countryCode?: string,
): Promise<PaymentIntentRow[]> {
  const fromIso = `${periodStart}T00:00:00.000Z`;
  const toIso = `${periodEnd}T23:59:59.999Z`;

  let countryUserIds: string[] | null = null;
  if (countryCode) {
    countryUserIds = await resolveCountryUserIds(supabase, countryCode);
    if (countryUserIds?.length === 0) return [];
  }

  let query = supabase
    .from('payment_intents')
    .select(PAYMENT_INTENT_COLUMNS)
    .eq('status', 'paid')
    .gte('paid_at', fromIso)
    .lte('paid_at', toIso)
    .order('paid_at', { ascending: false })
    .limit(5000);

  if (countryUserIds) query = query.in('user_id', countryUserIds);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PaymentIntentRow[];
}

function aggregateByMethod(intents: PaymentIntentRow[]): AccountingMethodRow[] {
  const map = new Map<string, AccountingMethodRow>();
  for (const row of intents) {
    const method = row.payment_method?.trim().toLowerCase() || 'unknown';
    const fees = enrichPaymentWithFees(row);
    const existing = map.get(method) ?? {
      paymentMethod: method,
      paidCount: 0,
      grossGnf: 0,
      feeGnf: 0,
      netGnf: 0,
    };
    existing.paidCount += 1;
    existing.grossGnf += fees.grossGnf;
    existing.feeGnf += fees.feeGnf;
    existing.netGnf += fees.netGnf;
    map.set(method, existing);
  }
  return [...map.values()].sort((a, b) => b.grossGnf - a.grossGnf);
}

export async function computeAccountingPeriodSummary(
  supabase: SupabaseClient,
  periodStart: string,
  periodEnd: string,
  options?: { countryCode?: string },
): Promise<AccountingPeriodSummary> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) {
    throw new Error('Période invalide (AAAA-MM-JJ).');
  }
  if (periodEnd < periodStart) throw new Error('La date de fin doit être après le début.');

  const intents = await loadPaidIntentsInRange(supabase, periodStart, periodEnd, options?.countryCode);
  const byPaymentMethod = aggregateByMethod(intents);
  const grossGnf = byPaymentMethod.reduce((s, r) => s + r.grossGnf, 0);
  const feeGnf = byPaymentMethod.reduce((s, r) => s + r.feeGnf, 0);
  const netGnf = byPaymentMethod.reduce((s, r) => s + r.netGnf, 0);

  const { data: settlements } = await supabase
    .from('djomy_accounting_settlements')
    .select('period_start, period_end, wired_amount_gnf')
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd);

  const wiredInPeriodGnf = ((settlements ?? []) as SettlementRow[]).reduce(
    (s, r) => s + r.wired_amount_gnf,
    0,
  );

  return {
    periodStart,
    periodEnd,
    paidCount: intents.length,
    grossGnf,
    feeGnf,
    netGnf,
    wiredInPeriodGnf,
    remainingInPeriodGnf: Math.max(0, netGnf - wiredInPeriodGnf),
    byPaymentMethod,
  };
}

export async function computeAccountingBalance(
  supabase: SupabaseClient,
  options?: { countryCode?: string },
): Promise<AccountingBalance> {
  let countryUserIds: string[] | null = null;
  if (options?.countryCode) {
    countryUserIds = await resolveCountryUserIds(supabase, options.countryCode);
    if (countryUserIds?.length === 0) {
      return {
        grossGnf: 0,
        feeGnf: 0,
        netExpectedGnf: 0,
        wiredTotalGnf: 0,
        remainingOwedGnf: 0,
        paidCount: 0,
      };
    }
  }

  let intentsQuery = supabase
    .from('payment_intents')
    .select(PAYMENT_INTENT_COLUMNS)
    .eq('status', 'paid')
    .limit(5000);

  if (countryUserIds) intentsQuery = intentsQuery.in('user_id', countryUserIds);

  const { data: intents, error: intentsError } = await intentsQuery;
  if (intentsError) throw new Error(intentsError.message);

  let grossGnf = 0;
  let feeGnf = 0;
  let netExpectedGnf = 0;
  for (const row of (intents ?? []) as unknown as PaymentIntentRow[]) {
    const f = enrichPaymentWithFees(row);
    grossGnf += f.grossGnf;
    feeGnf += f.feeGnf;
    netExpectedGnf += f.netGnf;
  }

  const { data: settlements, error: settError } = await supabase
    .from('djomy_accounting_settlements')
    .select('wired_amount_gnf')
    .limit(5000);

  if (settError) throw new Error(settError.message);

  const wiredTotalGnf = ((settlements ?? []) as Array<{ wired_amount_gnf: number }>).reduce(
    (s, r) => s + r.wired_amount_gnf,
    0,
  );

  return {
    grossGnf,
    feeGnf,
    netExpectedGnf,
    wiredTotalGnf,
    remainingOwedGnf: netExpectedGnf - wiredTotalGnf,
    paidCount: (intents ?? []).length,
  };
}

export async function listAccountingSettlements(
  supabase: SupabaseClient,
  options?: { limit?: number },
): Promise<AccountingSettlementRecord[]> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const { data, error } = await supabase
    .from('djomy_accounting_settlements')
    .select('id, period_start, period_end, wired_amount_gnf, payout_date, bank_reference, notes, created_at')
    .order('payout_date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as SettlementRow[];
  const results: AccountingSettlementRecord[] = [];

  for (const row of rows) {
    const summary = await computeAccountingPeriodSummary(
      supabase,
      row.period_start,
      row.period_end,
    );
    results.push({
      id: row.id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      wiredAmountGnf: row.wired_amount_gnf,
      payoutDate: row.payout_date,
      bankReference: row.bank_reference,
      notes: row.notes,
      createdAt: row.created_at,
      expectedNetGnf: summary.netGnf,
      periodDeltaGnf: row.wired_amount_gnf - summary.netGnf,
    });
  }

  return results;
}

export async function createAccountingSettlement(
  supabase: SupabaseClient,
  input: {
    periodStart: string;
    periodEnd: string;
    wiredAmountGnf: number;
    payoutDate: string;
    bankReference?: string | null;
    notes?: string | null;
    createdBy?: string | null;
  },
): Promise<AccountingSettlementRecord> {
  const summary = await computeAccountingPeriodSummary(supabase, input.periodStart, input.periodEnd);

  const { data, error } = await supabase
    .from('djomy_accounting_settlements')
    .insert({
      period_start: input.periodStart,
      period_end: input.periodEnd,
      wired_amount_gnf: Math.round(input.wiredAmountGnf),
      payout_date: input.payoutDate,
      bank_reference: input.bankReference?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: input.createdBy ?? null,
    })
    .select('id, period_start, period_end, wired_amount_gnf, payout_date, bank_reference, notes, created_at')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Enregistrement impossible.');

  const row = data as SettlementRow;
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    wiredAmountGnf: row.wired_amount_gnf,
    payoutDate: row.payout_date,
    bankReference: row.bank_reference,
    notes: row.notes,
    createdAt: row.created_at,
    expectedNetGnf: summary.netGnf,
    periodDeltaGnf: row.wired_amount_gnf - summary.netGnf,
  };
}
