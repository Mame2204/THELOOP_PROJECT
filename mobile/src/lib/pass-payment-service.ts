import type { PrimeBillingPeriod } from '@/lib/prime-plans';
import type { PassPaymentMethod } from '@/lib/subscription-history';
import {
  createDjomyPayment,
  isDjomyPaymentConfigured,
  waitForPaymentApiReady,
} from '@/lib/djomy-payment-api';

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

function extractGuineaLocal9(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00224') && digits.length >= 14) return digits.slice(5, 14);
  if (digits.startsWith('224') && digits.length >= 12) return digits.slice(3, 12);
  if (digits.startsWith('0') && digits.length >= 10) return digits.slice(1, 10);
  if (digits.length === 9) return digits;
  if (digits.length > 9) return digits.slice(-9);
  return digits;
}

/** Numéro mobile Guinée (Orange / MTN) — 9 chiffres commençant par 6. */
function isValidGuineaMobileLocal(raw: string): boolean {
  const local = extractGuineaLocal9(raw);
  return /^6\d{8}$/.test(local);
}

export async function processPassPayment(request: PassPaymentRequest): Promise<PassPaymentResult> {
  if (request.amountGnf <= 0) {
    return { status: 'failed', message: 'Montant invalide.' };
  }

  if (!request.payerPhone?.trim()) {
    return { status: 'failed', message: 'Indiquez le numéro ou compte utilisé pour le paiement mobile.' };
  }

  if (
    isDjomyPaymentConfigured()
    && (request.method === 'all' || request.method === 'orange_money' || request.method === 'mtn_momo')
    && !isValidGuineaMobileLocal(request.payerPhone)
  ) {
    return {
      status: 'failed',
      message:
        'Indiquez un numéro mobile Guinée valide (9 chiffres, ex. 620 00 00 00) — le même que sur Orange Money ou MTN MoMo.',
    };
  }

  if (isDjomyPaymentConfigured()) {
    try {
      const ready = await waitForPaymentApiReady({ timeoutMs: 45_000, intervalMs: 2_000 });
      if (!ready) {
        return {
          status: 'failed',
          message:
            'Le serveur de paiement met du temps à démarrer. Réessayez dans une minute ou vérifiez votre connexion.',
        };
      }
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
        message: 'Redirection vers le portail de paiement…',
      };
    } catch (err) {
      return {
        status: 'failed',
        message: err instanceof Error ? err.message : 'Paiement impossible.',
      };
    }
  }

  // Sans serveur de paiement, aucun encaissement n'est possible : un build de
  // production ne doit jamais activer un PASS sur la seule foi du téléphone.
  if (!__DEV__) {
    return {
      status: 'failed',
      message: 'Le service de paiement est indisponible. Réessayez plus tard.',
    };
  }

  await sleep(SANDBOX_DELAY_MS);
  const txId = `sandbox-${request.userId.slice(0, 8)}-${Date.now()}`;
  return {
    status: 'success',
    transactionId: txId,
    providerReference: `SANDBOX-${txId}`,
    message: 'Paiement test validé — configurez EXPO_PUBLIC_PAYMENT_API_URL pour le serveur de paiement.',
  };
}
