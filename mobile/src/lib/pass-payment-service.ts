import type { PrimeBillingPeriod } from '@/lib/prime-plans';
import type { PassPaymentMethod } from '@/lib/subscription-history';
import { createDjomyPayment, isDjomyPaymentConfigured } from '@/lib/djomy-payment-api';

export type PassPaymentStatus = 'pending' | 'success' | 'failed' | 'cancelled';

export interface PassPaymentRequest {
  userId: string;
  period: PrimeBillingPeriod;
  amountGnf: number;
  method: PassPaymentMethod;
  payerPhone?: string | null;
}

export interface PassPaymentResult {
  status: PassPaymentStatus;
  transactionId?: string;
  providerReference?: string;
  message?: string;
  paymentUrl?: string;
  paymentIntentId?: string;
  chargedAmountGnf?: number;
  sandboxMode?: boolean;
}

const SANDBOX_DELAY_MS = 1400;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processPassPayment(request: PassPaymentRequest): Promise<PassPaymentResult> {
  if (request.amountGnf <= 0) {
    return { status: 'failed', message: 'Montant invalide.' };
  }

  if (!request.payerPhone?.trim()) {
    return { status: 'failed', message: 'Indiquez le numéro du payeur (requis par Djomy).' };
  }

  if (isDjomyPaymentConfigured()) {
    try {
      const created = await createDjomyPayment({
        period: request.period,
        payerPhone: request.payerPhone.trim(),
        paymentMethod: request.method,
      });
      return {
        status: 'pending',
        paymentUrl: created.paymentUrl,
        paymentIntentId: created.paymentIntentId,
        chargedAmountGnf: created.amountGnf,
        sandboxMode: created.sandboxMode,
        message: 'Redirection vers le portail Djomy…',
      };
    } catch (err) {
      return {
        status: 'failed',
        message: err instanceof Error ? err.message : 'Paiement impossible.',
      };
    }
  }

  await sleep(SANDBOX_DELAY_MS);
  const txId = `sandbox-${request.userId.slice(0, 8)}-${Date.now()}`;
  return {
    status: 'success',
    transactionId: txId,
    providerReference: `SANDBOX-${txId}`,
    message: 'Paiement test validé — configurez EXPO_PUBLIC_PAYMENT_API_URL pour Djomy.',
  };
}

export const PASS_PAYMENT_PROVIDER_LABEL = 'Djomy';
