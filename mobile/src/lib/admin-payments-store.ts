import { isAdminBackendConfigured } from '@/lib/admin-user-backend-api';
import { supabase } from '@/lib/supabase';

const BACKEND_API_URL = (
  process.env.EXPO_PUBLIC_BACKEND_API_URL ??
  process.env.EXPO_PUBLIC_PAYMENT_API_URL ??
  ''
).replace(/\/$/, '');

export interface AdminPaymentIntent {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  billingPeriod: string;
  amountGnf: number;
  payerPhone: string;
  paymentMethod: string;
  merchantReference: string;
  djomyTransactionId: string | null;
  status: string;
  fulfillmentStatus: string;
  passGrantStatus: string | null;
  djomyPaidAmount: number | null;
  djomyStatus: string | null;
  djomyProviderReference: string | null;
  lastCheckedAt: string | null;
  lastWebhookEvent: string | null;
  lastWebhookAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPaymentSummary {
  paid: number;
  failed: number;
  pending: number;
  paidVolumeGnf: number;
}

async function authHeaders(): Promise<HeadersInit> {
  if (!supabase) throw new Error('Supabase non configuré.');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Session administrateur requise.');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export async function listAdminPaymentIntents(options?: {
  status?: string;
  fulfillment?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  intents: AdminPaymentIntent[];
  summary?: AdminPaymentSummary;
  total?: number;
  error?: string;
}> {
  if (!isAdminBackendConfigured()) {
    return {
      intents: [],
      error: 'Backend non configuré (EXPO_PUBLIC_PAYMENT_API_URL ou EXPO_PUBLIC_BACKEND_API_URL).',
    };
  }

  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.fulfillment) params.set('fulfillment', options.fulfillment);
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset != null) params.set('offset', String(options.offset));
  const qs = params.toString();

  try {
    const response = await fetch(
      `${BACKEND_API_URL}/api/admin/payment-intents${qs ? `?${qs}` : ''}`,
      { method: 'GET', headers: await authHeaders() },
    );
    const body = (await response.json()) as {
      intents?: AdminPaymentIntent[];
      summary?: AdminPaymentSummary;
      total?: number;
      error?: string;
    };
    if (!response.ok) {
      return { intents: [], error: body.error ?? 'Impossible de charger les paiements.' };
    }
    return {
      intents: body.intents ?? [],
      summary: body.summary,
      total: body.total,
    };
  } catch {
    return { intents: [], error: 'Impossible de joindre le serveur de paiement.' };
  }
}

export async function reconcileAdminPaymentIntent(
  intentId: string,
): Promise<{ ok: boolean; error?: string; intent?: Partial<AdminPaymentIntent> }> {
  if (!isAdminBackendConfigured()) {
    return { ok: false, error: 'Backend non configuré.' };
  }
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/admin/payment-intents/${intentId}/reconcile`, {
      method: 'POST',
      headers: await authHeaders(),
      body: '{}',
    });
    const body = (await response.json()) as {
      ok?: boolean;
      error?: string;
      intent?: {
        id: string;
        status: string;
        fulfillmentStatus: string;
        passGrantStatus: string | null;
        djomyStatus: string | null;
        djomyPaidAmount: number | null;
        paidAt: string | null;
      };
    };
    if (!response.ok) {
      return { ok: false, error: body.error ?? 'Resynchronisation impossible.' };
    }
    return { ok: true, intent: body.intent };
  } catch {
    return { ok: false, error: 'Impossible de joindre le serveur.' };
  }
}

/** Activité Auth uniquement pour les IDs de la page courante (max 50). */
export async function fetchUsersAuthActivity(userIds: string[]): Promise<{
  activity: Record<string, { lastSignInAt: string | null; email: string | null }>;
  error?: string;
}> {
  if (!userIds.length) return { activity: {} };
  if (!isAdminBackendConfigured()) {
    return { activity: {} };
  }
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/admin/users-activity`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ userIds: userIds.slice(0, 50) }),
    });
    const body = (await response.json()) as {
      activity?: Record<string, { lastSignInAt: string | null; email: string | null }>;
      error?: string;
    };
    if (!response.ok) {
      return { activity: {}, error: body.error ?? 'Activité Auth indisponible.' };
    }
    return { activity: body.activity ?? {} };
  } catch {
    return { activity: {} };
  }
}
