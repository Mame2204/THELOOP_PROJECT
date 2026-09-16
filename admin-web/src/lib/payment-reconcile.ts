/** Resync Djomy utile seulement si une transaction existe et le PASS n’est pas déjà activé. */
export function canReconcilePaymentIntent(intent: {
  djomyTransactionId?: string | null;
  fulfillmentStatus?: string | null;
}): boolean {
  const tx = intent.djomyTransactionId?.trim() ?? '';
  if (!tx || tx.startsWith('sandbox-force-')) return false;
  if (intent.fulfillmentStatus === 'fulfilled') return false;
  return intent.fulfillmentStatus === 'pending' || intent.fulfillmentStatus === 'failed';
}

export function reconcileDisabledReason(intent: {
  djomyTransactionId?: string | null;
  fulfillmentStatus?: string | null;
}): string | null {
  if (canReconcilePaymentIntent(intent)) return null;
  if (intent.fulfillmentStatus === 'fulfilled') return 'PASS déjà activé';
  if (!intent.djomyTransactionId?.trim()) return 'Pas encore de transaction Djomy';
  return 'Resync non nécessaire';
}
