import type { SupabaseClient } from '@supabase/supabase-js';
import { PAYMENT_INTENT_COLUMNS } from '../lib/supabase-list.js';
import type { PaymentIntentRow } from '../lib/supabase-admin.js';
import { isStuckPendingFulfillment } from './reconcile-payment-summary.js';

export interface PaymentBreakdownRow {
  key: string;
  count: number;
  volumeGnf: number;
}

export interface PaymentAnalytics {
  periodDays: number;
  from: string;
  to: string;
  revenue: {
    paidCount: number;
    totalVolumeGnf: number;
    averageTicketGnf: number;
  };
  byBillingPeriod: PaymentBreakdownRow[];
  byPaymentMethod: PaymentBreakdownRow[];
  funnel: {
    created: number;
    redirected: number;
    paid: number;
    fulfilled: number;
    fulfillmentFailed: number;
    paymentFailed: number;
  };
  dailyVolume: Array<{ date: string; count: number; volumeGnf: number }>;
  stuckPending: number;
}

const STUCK_MIN_AGE_MS = 5 * 60 * 1000;

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

function addBreakdown(
  map: Map<string, PaymentBreakdownRow>,
  key: string,
  volumeGnf: number,
): void {
  const existing = map.get(key) ?? { key, count: 0, volumeGnf: 0 };
  existing.count += 1;
  existing.volumeGnf += volumeGnf;
  map.set(key, existing);
}

function toSortedBreakdown(map: Map<string, PaymentBreakdownRow>): PaymentBreakdownRow[] {
  return [...map.values()].sort((a, b) => b.volumeGnf - a.volumeGnf || b.count - a.count);
}

export async function computePaymentAnalytics(
  supabase: SupabaseClient,
  options?: { countryCode?: string; days?: number },
): Promise<PaymentAnalytics> {
  const daysRaw = Number(options?.days ?? 30);
  const periodDays = Number.isFinite(daysRaw) ? Math.min(Math.max(1, daysRaw), 365) : 30;
  const to = new Date();
  const from = new Date(to.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const fromIso = from.toISOString();
  const stuckCutoff = new Date(Date.now() - STUCK_MIN_AGE_MS).toISOString();

  let countryUserIds: string[] | null = null;
  if (options?.countryCode) {
    countryUserIds = await resolveCountryUserIds(supabase, options.countryCode);
    if (countryUserIds?.length === 0) {
      return {
        periodDays,
        from: fromIso,
        to: to.toISOString(),
        revenue: { paidCount: 0, totalVolumeGnf: 0, averageTicketGnf: 0 },
        byBillingPeriod: [],
        byPaymentMethod: [],
        funnel: {
          created: 0,
          redirected: 0,
          paid: 0,
          fulfilled: 0,
          fulfillmentFailed: 0,
          paymentFailed: 0,
        },
        dailyVolume: [],
        stuckPending: 0,
      };
    }
  }

  let query = supabase
    .from('payment_intents')
    .select(PAYMENT_INTENT_COLUMNS)
    .gte('created_at', fromIso)
    .order('created_at', { ascending: true })
    .limit(5000);

  if (countryUserIds) {
    query = query.in('user_id', countryUserIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as PaymentIntentRow[];

  const byBillingPeriod = new Map<string, PaymentBreakdownRow>();
  const byPaymentMethod = new Map<string, PaymentBreakdownRow>();
  const dailyMap = new Map<string, { date: string; count: number; volumeGnf: number }>();

  let paidCount = 0;
  let totalVolumeGnf = 0;
  let created = 0;
  let redirected = 0;
  let paid = 0;
  let fulfilled = 0;
  let fulfillmentFailed = 0;
  let paymentFailed = 0;
  let stuckPending = 0;

  for (const row of rows) {
    if (row.status === 'created') created += 1;
    if (row.status === 'redirected') redirected += 1;
    if (row.status === 'paid') paid += 1;
    if (row.fulfillment_status === 'fulfilled') fulfilled += 1;
    if (row.fulfillment_status === 'failed') fulfillmentFailed += 1;
    if (row.status === 'failed' || row.status === 'cancelled') paymentFailed += 1;

    if (isStuckPendingFulfillment(row, stuckCutoff)) {
      stuckPending += 1;
    }

    if (row.status !== 'paid' && row.fulfillment_status !== 'fulfilled') continue;

    const vol = volumeFor(row);
    paidCount += 1;
    totalVolumeGnf += vol;

    addBreakdown(byBillingPeriod, row.billing_period || 'unknown', vol);
    addBreakdown(byPaymentMethod, row.payment_method || 'unknown', vol);

    const dayKey = row.paid_at?.slice(0, 10) ?? row.created_at.slice(0, 10);
    const daily = dailyMap.get(dayKey) ?? { date: dayKey, count: 0, volumeGnf: 0 };
    daily.count += 1;
    daily.volumeGnf += vol;
    dailyMap.set(dayKey, daily);
  }

  const dailyVolume = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    periodDays,
    from: fromIso,
    to: to.toISOString(),
    revenue: {
      paidCount,
      totalVolumeGnf,
      averageTicketGnf: paidCount > 0 ? Math.round(totalVolumeGnf / paidCount) : 0,
    },
    byBillingPeriod: toSortedBreakdown(byBillingPeriod),
    byPaymentMethod: toSortedBreakdown(byPaymentMethod),
    funnel: {
      created,
      redirected,
      paid,
      fulfilled,
      fulfillmentFailed,
      paymentFailed,
    },
    dailyVolume,
    stuckPending,
  };
}
