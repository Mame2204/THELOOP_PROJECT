import { config, type BillingPeriod } from '../config.js';
import { getSupabaseAdmin } from './supabase-admin.js';

const DEFAULT_COUNTRY = 'GN';
const PRICES_REMOTE_BASE = 'pass_prices_v1';
const SHOP_REMOTE_BASE = 'pass_shop_settings_v1';
const DEFAULT_MAX_PENDING = 3;

export type PassPriceMap = Record<BillingPeriod, number>;

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizePrices(raw: unknown, fallback: PassPriceMap): PassPriceMap {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const row = raw as Record<string, unknown>;
  const next = { ...fallback };
  for (const key of Object.keys(fallback) as BillingPeriod[]) {
    const n = Number(row[key]);
    if (isPositiveInt(n)) next[key] = Math.floor(n);
  }
  return next;
}

function normalizeMaxPending(raw: unknown): number {
  if (!raw || typeof raw !== 'object') return DEFAULT_MAX_PENDING;
  const n = Number((raw as { maxPendingPasses?: unknown }).maxPendingPasses);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MAX_PENDING;
  return Math.min(20, Math.floor(n));
}

async function fetchAppSettingValue(key: string): Promise<unknown | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error) {
    console.warn('[pass-commerce]', key, error.message);
    return null;
  }
  return data?.value ?? null;
}

/**
 * Prix facturés Djomy :
 * - sandbox → montants réduits (env / défauts config)
 * - prod → app_settings `pass_prices_v1_GN` (admin) puis fallback env
 */
export async function resolveChargedPassPrice(
  period: BillingPeriod,
  countryCode = DEFAULT_COUNTRY,
): Promise<number> {
  if (config.paymentSandboxAmounts) {
    return config.passPricesGnf[period];
  }

  const remote = await fetchAppSettingValue(`${PRICES_REMOTE_BASE}_${countryCode.toUpperCase()}`);
  const prices = normalizePrices(remote, config.passPricesGnf);
  return prices[period];
}

/** File d’attente max — même clé que l’admin mobile (`pass_shop_settings_v1_GN`). */
export async function resolveMaxPendingPasses(countryCode = DEFAULT_COUNTRY): Promise<number> {
  const remote = await fetchAppSettingValue(`${SHOP_REMOTE_BASE}_${countryCode.toUpperCase()}`);
  if (remote != null) return normalizeMaxPending(remote);
  return DEFAULT_MAX_PENDING;
}
