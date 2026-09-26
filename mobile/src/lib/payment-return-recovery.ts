import {
  fetchDjomyPaymentStatus,
  warmPaymentApi,
} from '@/lib/djomy-payment-api';
import {
  clearPendingPaymentIntent,
  loadPendingPaymentIntent,
} from '@/lib/payment-pending-store';
import { syncPassAfterDjomyPayment } from '@/lib/pass-purchase-store';

export type PaymentRecoveryOutcome =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'synced'; activated: boolean; queued: boolean };

/** Reprise après retour portail (surtout Android cold start / crash WebBrowser). */
export async function recoverPassAfterPaymentReturn(
  userId: string,
  firstName?: string | null,
): Promise<PaymentRecoveryOutcome> {
  const pending = await loadPendingPaymentIntent();
  if (!pending || pending.userId !== userId) {
    return { kind: 'none' };
  }

  await warmPaymentApi();

  let status;
  try {
    status = await fetchDjomyPaymentStatus(pending.intentId);
  } catch {
    return { kind: 'pending' };
  }

  if (status.fulfillmentStatus !== 'fulfilled' && status.status !== 'paid') {
    return { kind: 'pending' };
  }

  const outcome = await syncPassAfterDjomyPayment(userId, firstName);
  await clearPendingPaymentIntent();
  return {
    kind: 'synced',
    activated: Boolean(outcome.activated),
    queued: Boolean(outcome.queued),
  };
}
