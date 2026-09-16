import { getAccessToken } from './supabase';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export function getApiUrl(): string {
  return API_URL;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Session expirée — reconnectez-vous à la console admin.');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

function mapApiError(status: number, bodyError?: string): string {
  if (status === 401) {
    return bodyError?.includes('Session')
      ? `${bodyError} Reconnectez-vous à la console admin.`
      : 'Session expirée — reconnectez-vous à la console admin.';
  }
  if (status === 403) return 'Accès refusé — compte admin requis.';
  return bodyError ?? 'Erreur serveur.';
}

export interface PaymentSummary {
  paid: number;
  failed: number;
  pending: number;
  fulfillmentFailed?: number;
  paidVolumeGnf: number;
}

export interface PaymentBreakdownRow {
  key: string;
  count: number;
  volumeGnf: number;
}

export interface PaymentAnalytics {
  periodDays: number;
  from: string;
  to: string;
  revenue: {
    paidCount: number;
    totalVolumeGnf: number;
    averageTicketGnf: number;
  };
  byBillingPeriod: PaymentBreakdownRow[];
  byPaymentMethod: PaymentBreakdownRow[];
  funnel: {
    created: number;
    redirected: number;
    paid: number;
    fulfilled: number;
    fulfillmentFailed: number;
    paymentFailed: number;
  };
  dailyVolume: Array<{ date: string; count: number; volumeGnf: number }>;
  stuckPending: number;
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
  fulfillment?: string;
  countryCode?: string;
}): Promise<{ intents: PaymentIntent[]; summary?: PaymentSummary; total?: number; error?: string }> {
  if (!API_URL) return { intents: [], error: 'VITE_API_URL manquant.' };
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset != null) params.set('offset', String(options.offset));
  if (options?.status) params.set('status', options.status);
  if (options?.fulfillment) params.set('fulfillment', options.fulfillment);
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
    if (!res.ok) return { intents: [], error: mapApiError(res.status, body.error) };
    return { intents: body.intents ?? [], summary: body.summary, total: body.total };
  } catch {
    return { intents: [], error: 'API injoignable — vérifiez api.theloop-app.com.' };
  }
}

export async function fetchPaymentAnalytics(options?: {
  countryCode?: string;
  days?: number;
}): Promise<{ analytics?: PaymentAnalytics; error?: string }> {
  if (!API_URL) return { error: 'VITE_API_URL manquant.' };
  const params = new URLSearchParams();
  if (options?.countryCode) params.set('country', options.countryCode);
  if (options?.days) params.set('days', String(options.days));
  const qs = params.toString();
  try {
    const res = await fetch(`${API_URL}/api/admin/payment-intents/analytics${qs ? `?${qs}` : ''}`, {
      headers: await authHeaders(),
    });
    const body = (await res.json()) as PaymentAnalytics & { error?: string };
    if (!res.ok) return { error: body.error ?? 'Analytics indisponibles.' };
    return { analytics: body };
  } catch {
    return { error: 'API injoignable.' };
  }
}

export async function downloadPaymentCsv(options?: {
  countryCode?: string;
  status?: string;
  fulfillment?: string;
  days?: number;
}): Promise<{ ok: boolean; error?: string }> {
  if (!API_URL) return { ok: false, error: 'VITE_API_URL manquant.' };
  const params = new URLSearchParams();
  if (options?.countryCode) params.set('country', options.countryCode);
  if (options?.status) params.set('status', options.status);
  if (options?.fulfillment) params.set('fulfillment', options.fulfillment);
  if (options?.days) params.set('days', String(options.days ?? 90));
  try {
    const res = await fetch(`${API_URL}/api/admin/payment-intents/export.csv?${params.toString()}`, {
      headers: await authHeaders(),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      return { ok: false, error: body.error ?? 'Export impossible.' };
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `loop-paiements-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    return { ok: true };
  } catch {
    return { ok: false, error: 'API injoignable.' };
  }
}

export interface BankPayoutLineRecord {
  id: string;
  paymentMethod: string;
  wiredAmountGnf: number;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string | null;
}

export interface BankPayoutRecord {
  id: string;
  payoutDate: string;
  bankReference: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: string | null;
  totalWiredGnf: number;
  lines: BankPayoutLineRecord[];
}

export interface PayoutReconciliationRow {
  paymentMethod: string;
  paidCount: number;
  grossVolumeGnf: number;
  estimatedFeeGnf: number;
  estimatedNetGnf: number;
  wiredRecordedGnf: number;
  deltaGnf: number;
}

export interface PayoutReconciliationSummary {
  periodDays: number;
  from: string;
  to: string;
  totals: {
    grossVolumeGnf: number;
    estimatedFeeGnf: number;
    estimatedNetGnf: number;
    wiredRecordedGnf: number;
    deltaGnf: number;
  };
  byPaymentMethod: PayoutReconciliationRow[];
}

export async function fetchBankPayouts(): Promise<{ payouts?: BankPayoutRecord[]; error?: string }> {
  if (!API_URL) return { error: 'VITE_API_URL manquant.' };
  try {
    const res = await fetch(`${API_URL}/api/admin/payment-payouts`, { headers: await authHeaders() });
    const body = (await res.json()) as { payouts?: BankPayoutRecord[]; error?: string };
    if (!res.ok) return { error: body.error ?? 'Versements indisponibles.' };
    return { payouts: body.payouts ?? [] };
  } catch {
    return { error: 'API injoignable.' };
  }
}

export async function fetchBankPayoutReconciliation(options?: {
  countryCode?: string;
  days?: number;
}): Promise<{ summary?: PayoutReconciliationSummary; error?: string }> {
  if (!API_URL) return { error: 'VITE_API_URL manquant.' };
  const params = new URLSearchParams();
  if (options?.countryCode) params.set('country', options.countryCode);
  if (options?.days) params.set('days', String(options.days));
  const qs = params.toString();
  try {
    const res = await fetch(
      `${API_URL}/api/admin/payment-payouts/reconciliation${qs ? `?${qs}` : ''}`,
      { headers: await authHeaders() },
    );
    const body = (await res.json()) as PayoutReconciliationSummary & { error?: string };
    if (!res.ok) return { error: body.error ?? 'Réconciliation indisponible.' };
    return { summary: body };
  } catch {
    return { error: 'API injoignable.' };
  }
}

export async function createBankPayout(input: {
  payoutDate: string;
  bankReference?: string | null;
  notes?: string | null;
  lines: Array<{
    paymentMethod: string;
    wiredAmountGnf: number;
    periodStart?: string | null;
    periodEnd?: string | null;
    notes?: string | null;
  }>;
}): Promise<{ ok: boolean; payout?: BankPayoutRecord; error?: string }> {
  if (!API_URL) return { ok: false, error: 'VITE_API_URL manquant.' };
  try {
    const res = await fetch(`${API_URL}/api/admin/payment-payouts`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    });
    const body = (await res.json()) as { payout?: BankPayoutRecord; error?: string };
    if (!res.ok) return { ok: false, error: body.error ?? 'Enregistrement impossible.' };
    return { ok: true, payout: body.payout };
  } catch {
    return { ok: false, error: 'API injoignable.' };
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

export async function deliverPushToUsers(input: {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<{ ok: boolean; sent?: number; failed?: number; error?: string }> {
  if (!API_URL) return { ok: false, error: 'VITE_API_URL manquant.' };
  const ids = [...new Set(input.userIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!ids.length) return { ok: true, sent: 0, failed: 0 };
  try {
    const res = await fetch(`${API_URL}/api/admin/push/deliver`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        userIds: ids,
        title: input.title,
        body: input.body,
        data: input.data,
      }),
    });
    const body = (await res.json()) as {
      ok?: boolean;
      sent?: number;
      failed?: number;
      error?: string;
      reason?: string | null;
    };
    if (!res.ok) return { ok: false, error: body.error ?? 'Push impossible.' };
    return { ok: true, sent: body.sent ?? 0, failed: body.failed ?? 0 };
  } catch {
    return { ok: false, error: 'API injoignable — push OS non envoyé.' };
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
