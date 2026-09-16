const BILLING_PERIOD_LABELS: Record<string, string> = {
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  annual: 'Annuel',
  lifetime: 'À vie',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  orange_money: 'Orange Money',
  mtn_momo: 'MTN MoMo',
  card: 'Carte bancaire',
};

export function billingPeriodLabel(key: string): string {
  return BILLING_PERIOD_LABELS[key] ?? key;
}

export function paymentMethodLabel(key: string): string {
  return PAYMENT_METHOD_LABELS[key] ?? key.replace(/_/g, ' ');
}
