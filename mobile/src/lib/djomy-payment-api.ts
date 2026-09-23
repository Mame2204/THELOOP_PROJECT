import { supabase } from '@/lib/supabase';
import type { PrimeBillingPeriod } from '@/lib/prime-plans';
import type { PassPaymentMethod } from '@/lib/subscription-history';

const PAYMENT_API_URL = process.env.EXPO_PUBLIC_PAYMENT_API_URL?.replace(/\/$/, '') ?? '';

export function isDjomyPaymentConfigured(): boolean {
  return Boolean(PAYMENT_API_URL && !PAYMENT_API_URL.includes('your-payment-api'));
}

/** Indique si le serveur de paiement tourne en montants sandbox (force fulfill autorisé). */
export async function fetchPaymentServerSandboxMode(): Promise<boolean> {
  if (!isDjomyPaymentConfigured()) return false;
  try {
    const response = await fetch(`${PAYMENT_API_URL}/health`);
    if (!response.ok) return false;
    const payload = (await response.json()) as { sandboxMode?: boolean };
    return Boolean(payload.sandboxMode);
  } catch {
    return false;
  }
}

export interface CreateDjomyPaymentInput {
  period: PrimeBillingPeriod;
  payerPhone: string;
  paymentMethod: PassPaymentMethod;
}

/** Comptes de test officiels Djomy sandbox (fournis par leur support). */
export const DJOMY_SANDBOX_TEST = {
  /** Orange Money : tous les paiements échouent en sandbox — ne pas tester OM. */
  orangeMoneyUnavailable: true as const,
  phone: {
    local: '623707722',
    display: '623 70 77 22',
    djomy: '00224623707722',
  },
  paycard: {
    account: '537417414',
    display: '537 417 414',
    otp: '0000',
  },
  soutra: {
    account: '622356781',
    display: '622 35 67 81',
    pin: '1111',
  },
  /** Carte succès frictionless — date expiration future + CVV 3 chiffres. */
  cardSuccess: {
    pan: '2303779999000275',
    panDisplay: '2303 7799 9900 0275',
  },
  maxAmountSoutraPaycardGnf: 10_000,
} as const;

/** @deprecated */
export const DJOMY_SANDBOX_TEST_PAYER_LOCAL = DJOMY_SANDBOX_TEST.soutra.account;
/** @deprecated */
export const DJOMY_SANDBOX_TEST_PAYER_DISPLAY = DJOMY_SANDBOX_TEST.soutra.display;

/**
 * Valeur à mettre dans le champ payeur app (= même identifiant sur Djomy).
 */
export function sandboxPayerHint(method: string): { local: string; display: string; tip: string } {
  switch (method) {
    case 'paycard':
      return {
        local: DJOMY_SANDBOX_TEST.paycard.account,
        display: DJOMY_SANDBOX_TEST.paycard.display,
        tip: `Sur le portail : ${DJOMY_SANDBOX_TEST.paycard.display}, puis OTP ${DJOMY_SANDBOX_TEST.paycard.otp}.`,
      };
    case 'soutra_money':
      return {
        local: DJOMY_SANDBOX_TEST.soutra.account,
        display: DJOMY_SANDBOX_TEST.soutra.display,
        tip: `Sur le portail : ${DJOMY_SANDBOX_TEST.soutra.display}, puis PIN ${DJOMY_SANDBOX_TEST.soutra.pin}.`,
      };
    case 'card':
      return {
        local: DJOMY_SANDBOX_TEST.cardSuccess.pan,
        display: DJOMY_SANDBOX_TEST.cardSuccess.panDisplay,
        tip: `Carte test : ${DJOMY_SANDBOX_TEST.cardSuccess.panDisplay}, expiration future, CVV 3 chiffres.`,
      };
    case 'orange_money':
      return {
        local: '',
        display: '—',
        tip: 'Orange Money échoue en test. Choisissez PayCard, Soutra ou carte.',
      };
    case 'mtn_momo':
      return {
        local: DJOMY_SANDBOX_TEST.phone.local,
        display: DJOMY_SANDBOX_TEST.phone.display,
        tip: `Si le portail le demande : ${DJOMY_SANDBOX_TEST.phone.display}.`,
      };
    default:
      return {
        local: DJOMY_SANDBOX_TEST.soutra.account,
        display: DJOMY_SANDBOX_TEST.soutra.display,
        tip: `Choisissez un moyen sur le portail (Soutra ${DJOMY_SANDBOX_TEST.soutra.display} / PayCard ${DJOMY_SANDBOX_TEST.paycard.display} / carte test).`,
      };
  }
}

export interface CreateDjomyPaymentResult {
  paymentUrl: string;
  paymentIntentId: string;
  amountGnf?: number;
  payerPhone?: string;
  sandboxMode?: boolean;
}

export interface DjomyPaymentStatus {
  status: string;
  fulfillmentStatus: string;
  passGrantStatus: string | null;
  paidAt: string | null;
}

async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  if (!token) throw new Error('Session expirée — reconnectez-vous.');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function createDjomyPayment(
  input: CreateDjomyPaymentInput,
): Promise<CreateDjomyPaymentResult> {
  if (!isDjomyPaymentConfigured()) {
    throw new Error('Serveur de paiement non configuré.');
  }

  const response = await fetch(`${PAYMENT_API_URL}/api/create-payment`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      period: input.period,
      payerPhone: input.payerPhone,
      paymentMethod: input.paymentMethod,
    }),
  });

  const payload = (await response.json()) as {
    paymentUrl?: string;
    paymentIntentId?: string;
    amountGnf?: number;
    payerPhone?: string;
    sandboxMode?: boolean;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Impossible d\'initialiser le paiement.');
  }

  if (!payload.paymentUrl || !payload.paymentIntentId) {
    throw new Error('Réponse paiement incomplète.');
  }

  return {
    paymentUrl: payload.paymentUrl,
    paymentIntentId: payload.paymentIntentId,
    amountGnf: payload.amountGnf,
    payerPhone: payload.payerPhone,
    sandboxMode: Boolean(payload.sandboxMode),
  };
}

/** Force l’activation PASS sans succès portail — uniquement si le serveur est en sandbox. */
export async function forceSandboxPaymentComplete(paymentIntentId: string): Promise<DjomyPaymentStatus> {
  if (!isDjomyPaymentConfigured()) {
    throw new Error('Serveur de paiement non configuré.');
  }

  const response = await fetch(`${PAYMENT_API_URL}/api/payments/${paymentIntentId}/sandbox-complete`, {
    method: 'POST',
    headers: await authHeaders(),
    body: '{}',
  });

  const payload = (await response.json()) as DjomyPaymentStatus & { error?: string; sandboxForced?: boolean };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Impossible de forcer le paiement sandbox.');
  }

  return {
    status: payload.status,
    fulfillmentStatus: payload.fulfillmentStatus,
    passGrantStatus: payload.passGrantStatus,
    paidAt: payload.paidAt,
  };
}

export function isTransientPaymentNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /network request failed|failed to fetch|network error|timed?\s*out|econnreset|enotfound|econnrefused|aborted|socket/i.test(
    msg,
  );
}

/** Réveille l’API (Render Free) avant le polling statut. */
export async function warmPaymentApi(): Promise<void> {
  if (!isDjomyPaymentConfigured()) return;
  try {
    await fetch(`${PAYMENT_API_URL}/health`);
  } catch {
    /* ignore — le polling réessaiera */
  }
}

export async function fetchDjomyPaymentStatus(paymentIntentId: string): Promise<DjomyPaymentStatus> {
  if (!isDjomyPaymentConfigured()) {
    throw new Error('Serveur de paiement non configuré.');
  }

  let response: Response;
  try {
    response = await fetch(`${PAYMENT_API_URL}/api/payments/${paymentIntentId}/status`, {
      method: 'GET',
      headers: await authHeaders(),
    });
  } catch (err) {
    if (isTransientPaymentNetworkError(err)) {
      throw new Error('Network request failed');
    }
    throw err;
  }

  const payload = (await response.json()) as DjomyPaymentStatus & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'Statut paiement indisponible.');
  }

  return payload;
}

export async function waitForDjomyFulfillment(
  paymentIntentId: string,
  options?: { timeoutMs?: number; intervalMs?: number },
): Promise<DjomyPaymentStatus> {
  const timeoutMs = options?.timeoutMs ?? 300_000;
  const intervalMs = options?.intervalMs ?? 2_500;
  const started = Date.now();
  let lastStatus: DjomyPaymentStatus | null = null;
  let sawNetworkError = false;

  await warmPaymentApi();

  while (Date.now() - started < timeoutMs) {
    try {
      const status = await fetchDjomyPaymentStatus(paymentIntentId);
      lastStatus = status;
      sawNetworkError = false;
      if (status.fulfillmentStatus === 'fulfilled') return status;
      if (status.status === 'failed' || status.status === 'cancelled') {
        throw new Error(
          status.status === 'cancelled'
            ? 'Paiement annulé. Vous pouvez réessayer.'
            : 'Paiement refusé. Vérifiez le numéro et le solde, puis réessayez.',
        );
      }
    } catch (err) {
      if (err instanceof Error && /annulé|refusé/i.test(err.message)) {
        throw err;
      }
      if (isTransientPaymentNetworkError(err)) {
        sawNetworkError = true;
        await warmPaymentApi();
      } else {
        throw err;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastStatus?.fulfillmentStatus === 'fulfilled') {
    return lastStatus;
  }

  if (lastStatus?.status === 'paid' || lastStatus?.fulfillmentStatus === 'pending') {
    throw new Error(
      'Paiement reçu, activation en cours. Ouvrez Mon PASS dans quelques instants — tirez pour actualiser si besoin.',
    );
  }

  if (sawNetworkError && !lastStatus) {
    throw new Error(
      'Connexion au serveur de paiement interrompue. Si le débit est déjà passé, ouvrez Mon PASS — l’activation peut prendre quelques minutes.',
    );
  }

  throw new Error(
    'Confirmation en attente. Si vous avez payé, vérifiez Mon PASS sous peu. Sans webhook HTTPS, le serveur active au prochain contrôle de statut.',
  );
}
