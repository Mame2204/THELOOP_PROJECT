export type PrimeBillingPeriod = 'monthly' | 'quarterly' | 'annual' | 'lifetime';

export interface PrimePlanOption {
  value: PrimeBillingPeriod;
  label: string;
  description: string;
}

export const PASS_LABELS: Record<PrimeBillingPeriod, string> = {
  monthly: 'PASS mensuel',
  quarterly: 'PASS trimestriel',
  annual: 'PASS annuel',
  lifetime: 'PASS à vie',
};

export const PASS_PRICES_GNF: Record<PrimeBillingPeriod, number> = {
  monthly: 850_000,
  quarterly: 2_400_000,
  annual: 8_500_000,
  lifetime: 25_000_000,
};

export function formatPassPrice(
  period: PrimeBillingPeriod,
  prices: Record<PrimeBillingPeriod, number> = PASS_PRICES_GNF,
  currency = 'GNF',
): string {
  const price = prices[period];
  if (period === 'monthly') return `${price.toLocaleString('fr-FR')} ${currency} / mois`;
  if (period === 'quarterly') return `${price.toLocaleString('fr-FR')} ${currency} / trimestre`;
  if (period === 'annual') return `${price.toLocaleString('fr-FR')} ${currency} / an`;
  return `${price.toLocaleString('fr-FR')} ${currency} (à vie)`;
}

export const PRIME_PLAN_OPTIONS: PrimePlanOption[] = [
  { value: 'monthly', label: PASS_LABELS.monthly, description: 'Renouvellement chaque mois' },
  { value: 'quarterly', label: PASS_LABELS.quarterly, description: 'Renouvellement tous les 3 mois' },
  { value: 'annual', label: PASS_LABELS.annual, description: 'Renouvellement chaque année' },
  { value: 'lifetime', label: PASS_LABELS.lifetime, description: 'Accès permanent sans échéance' },
];

export function computeSubscriptionExpiry(
  period: PrimeBillingPeriod,
  from: Date = new Date(),
): string | null {
  const d = new Date(from);
  switch (period) {
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      return d.toISOString();
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      return d.toISOString();
    case 'annual':
      d.setFullYear(d.getFullYear() + 1);
      return d.toISOString();
    case 'lifetime':
      return null;
  }
}

export function primePlanLabel(period: PrimeBillingPeriod): string {
  return PASS_LABELS[period];
}

/** Prolonge un PASS Prime de N mois (parrainage, offres, etc.). */
export function extendSubscriptionByMonths(
  months: number,
  currentExpiresAt?: string | null,
  from: Date = new Date(),
): string {
  const base =
    currentExpiresAt && new Date(currentExpiresAt) > from
      ? new Date(currentExpiresAt)
      : from;
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}
