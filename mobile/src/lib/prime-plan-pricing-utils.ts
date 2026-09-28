import type { PassPriceMap } from '@/lib/pass-pricing-store';
import type { PrimeBillingPeriod } from '@/lib/prime-plans';

export const RECOMMENDED_BILLING_PERIOD: PrimeBillingPeriod = 'annual';

/** Économie vs payer le même nombre de mois au tarif mensuel. */
export function planSavingsVsMonthly(
  period: PrimeBillingPeriod,
  prices: PassPriceMap,
): { percent: number; equivalentMonthly: number } | null {
  if (period === 'monthly' || period === 'lifetime') return null;
  const monthly = prices.monthly;
  const price = prices[period];
  if (!monthly || !price || monthly <= 0) return null;
  const months = period === 'quarterly' ? 3 : 12;
  const fullMonthlyTotal = monthly * months;
  if (fullMonthlyTotal <= price) return null;
  const percent = Math.round((1 - price / fullMonthlyTotal) * 100);
  const equivalentMonthly = Math.round(price / months);
  return { percent, equivalentMonthly };
}

export function isRecommendedPlan(period: PrimeBillingPeriod): boolean {
  return period === RECOMMENDED_BILLING_PERIOD;
}
