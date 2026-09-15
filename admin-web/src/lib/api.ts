import { getAccessToken } from './supabase';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export function getApiUrl(): string {
  return API_URL;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  if (!token) throw new Error('Session expirée.');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export interface PaymentSummary {
  paid: number;
  failed: number;
  pending: number;
  paidVolumeGnf: number;
}

export interface PaymentIntent {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  countryCode?: string | null;
  billingPeriod: string;
  amountGnf: number;
  payerPhone?: string | null;
  paymentMethod?: string | null;
  merchantReference?: string | null;
  status: string;
  fulfillmentStatus: string;
  passGrantStatus?: string | null;
  djomyTransactionId: string | null;
  djomyStatus: string | null;
  djomyProviderReference?: string | null;
  djomyPaidAmount?: number | null;
  createdAt: string;
  paidAt: string | null;
}

export async function fetchPaymentIntents(options?: {
  limit?: number;
  offset?: number;
  status?: string;
  countryCode?: string;
}): Promise<{ intents: PaymentIntent[]; summary?: PaymentSummary; total?: number; error?: string }> {
  if (!API_URL) return { intents: [], error: 'VITE_API_URL manquant.' };
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset != null) params.set('offset', String(options.offset));
  if (options?.status) params.set('status', options.status);
  if (options?.countryCode) params.set('country', options.countryCode);
  const qs = params.toString();
  try {
    const res = await fetch(`${API_URL}/api/admin/payment-intents${qs ? `?${qs}` : ''}`, {
      headers: await authHeaders(),
    });
    const body = (await res.json()) as {
      intents?: PaymentIntent[];
      summary?: PaymentSummary;
      total?: number;
      error?: string;
    };
    if (!res.ok) return { intents: [], error: body.error ?? 'Erreur paiements.' };
    return { intents: body.intents ?? [], summary: body.summary, total: body.total };
  } catch {
    return { intents: [], error: 'API injoignable — vérifiez api.theloop-app.com.' };
  }
}

export async function reconcilePayment(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/admin/payment-intents/${id}/reconcile`, {
      method: 'POST',
      headers: await authHeaders(),
      body: '{}',
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? 'Resync impossible.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'API injoignable.' };
  }
}

export async function fetchUsersActivity(
  userIds: string[],
): Promise<Record<string, { lastSignInAt: string | null }>> {
  if (!API_URL || userIds.length === 0) return {};
  try {
    const res = await fetch(`${API_URL}/api/admin/users-activity`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ userIds }),
    });
    const body = (await res.json()) as {
      activity?: Record<string, { lastSignInAt: string | null }>;
    };
    if (!res.ok) return {};
    return body.activity ?? {};
  } catch {
    return {};
  }
}
