import type { SupabaseClient } from '@supabase/supabase-js';
import { estimateDjomyPayInFee } from '../lib/djomy-fees.js';
import { PAYMENT_INTENT_COLUMNS } from '../lib/supabase-list.js';
import type { PaymentIntentRow } from '../lib/supabase-admin.js';

const CSV_FEE_COLUMNS = [
  'djomy_fee_rate_label',
  'djomy_fee_gnf_est',
  'djomy_net_gnf_est',
] as const;

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function csvRow(values: unknown[]): string {
  return values.map(csvEscape).join(',');
}

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

export async function buildPaymentIntentsCsv(
  supabase: SupabaseClient,
  options?: {
    countryCode?: string;
    status?: string;
    fulfillment?: string;
    days?: number;
  },
): Promise<string> {
  const daysRaw = Number(options?.days ?? 90);
  const periodDays = Number.isFinite(daysRaw) ? Math.min(Math.max(1, daysRaw), 365) : 90;
  const fromIso = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();

  let countryUserIds: string[] | null = null;
  if (options?.countryCode) {
    countryUserIds = await resolveCountryUserIds(supabase, options.countryCode);
    if (countryUserIds?.length === 0) {
      return csvRow([
        'id',
        'user_email',
        'user_name',
        'country_code',
        'billing_period',
        'amount_gnf',
        'payer_phone',
        'payment_method',
        'merchant_reference',
        'djomy_transaction_id',
        'status',
        'fulfillment_status',
        'pass_grant_status',
        'djomy_paid_amount',
        'djomy_status',
        'djomy_provider_reference',
        'paid_at',
        'created_at',
        'updated_at',
        'last_checked_at',
        'last_webhook_event',
        'last_webhook_at',
        ...CSV_FEE_COLUMNS,
      ]);
    }
  }

  let query = supabase
    .from('payment_intents')
    .select(PAYMENT_INTENT_COLUMNS)
    .gte('created_at', fromIso)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (countryUserIds) query = query.in('user_id', countryUserIds);
  if (options?.status) query = query.eq('status', options.status);
  if (options?.fulfillment) query = query.eq('fulfillment_status', options.fulfillment);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as PaymentIntentRow[];
  const userIds = [...new Set(rows.map((r) => r.user_id))];

  const usersById = new Map<
    string,
    { email: string | null; name: string | null; countryCode: string | null }
  >();

  if (userIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, email, first_name, last_name, country_code')
      .in('id', userIds);
    for (const u of users ?? []) {
      usersById.set(String(u.id), {
        email: u.email ?? null,
        name: [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
        countryCode: u.country_code ?? null,
      });
    }
  }

  const header = csvRow([
    'id',
    'user_email',
    'user_name',
    'country_code',
    'billing_period',
    'amount_gnf',
    'payer_phone',
    'payment_method',
    'merchant_reference',
    'djomy_transaction_id',
    'status',
    'fulfillment_status',
    'pass_grant_status',
    'djomy_paid_amount',
    'djomy_status',
    'djomy_provider_reference',
    'paid_at',
    'created_at',
    'updated_at',
    'last_checked_at',
    'last_webhook_event',
    'last_webhook_at',
    ...CSV_FEE_COLUMNS,
  ]);

  const lines = rows.map((row) => {
    const user = usersById.get(row.user_id);
    const paidAmount = row.djomy_paid_amount ?? row.amount_gnf;
    const fee = estimateDjomyPayInFee(paidAmount, row.payment_method);
    return csvRow([
      row.id,
      user?.email,
      user?.name,
      user?.countryCode,
      row.billing_period,
      row.amount_gnf,
      row.payer_phone,
      row.payment_method,
      row.merchant_reference,
      row.djomy_transaction_id,
      row.status,
      row.fulfillment_status,
      row.pass_grant_status,
      row.djomy_paid_amount,
      row.djomy_status,
      row.djomy_provider_reference,
      row.paid_at,
      row.created_at,
      row.updated_at,
      row.last_checked_at,
      row.last_webhook_event,
      row.last_webhook_at,
      fee.rateLabel,
      fee.feeGnf ?? (fee.feeRangeGnf ? `${fee.feeRangeGnf[0]}-${fee.feeRangeGnf[1]}` : ''),
      fee.netGnf ?? '',
    ]);
  });

  return [header, ...lines].join('\r\n');
}
