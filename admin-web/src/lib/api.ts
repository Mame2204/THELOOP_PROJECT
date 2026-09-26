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
  lastCheckedAt?: string | null;
  djomyPaidAmount?: number | null;
  grossGnf?: number;
  feeRatePercent?: number | null;
  feeRateLabel?: string;
  feeGnf?: number;
  netGnf?: number;
  createdAt: string;
  paidAt: string | null;
}

export async function fetchPaymentIntents(options?: {
  limit?: number;
  offset?: number;
  status?: string;
  bucket?: 'in_progress' | 'paid' | 'abandoned';
  fulfillment?: string;
  countryCode?: string;
}): Promise<{ intents: PaymentIntent[]; summary?: PaymentSummary; total?: number; error?: string }> {
  if (!API_URL) return { intents: [], error: 'VITE_API_URL manquant.' };
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset != null) params.set('offset', String(options.offset));
  if (options?.status) params.set('status', options.status);
  if (options?.bucket) params.set('bucket', options.bucket);
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

export interface AccountingMethodRow {
  paymentMethod: string;
  paidCount: number;
  grossGnf: number;
  feeGnf: number;
  netGnf: number;
}

export interface AccountingPeriodSummary {
  periodStart: string;
  periodEnd: string;
  paidCount: number;
  grossGnf: number;
  feeGnf: number;
  netGnf: number;
  wiredInPeriodGnf: number;
  remainingInPeriodGnf: number;
  byPaymentMethod: AccountingMethodRow[];
}

export interface AccountingBalance {
  grossGnf: number;
  feeGnf: number;
  netExpectedGnf: number;
  wiredTotalGnf: number;
  remainingOwedGnf: number;
  paidCount: number;
}

export interface AccountingSettlement {
  id: string;
  periodStart: string;
  periodEnd: string;
  wiredAmountGnf: number;
  payoutDate: string;
  bankReference: string | null;
  notes: string | null;
  createdAt: string;
  expectedNetGnf: number;
  periodDeltaGnf: number;
}

export async function fetchAccountingBalance(options?: {
  countryCode?: string;
}): Promise<{ balance?: AccountingBalance; error?: string }> {
  if (!API_URL) return { error: 'VITE_API_URL manquant.' };
  const params = new URLSearchParams();
  if (options?.countryCode) params.set('country', options.countryCode);
  const qs = params.toString();
  try {
    const res = await fetch(`${API_URL}/api/admin/payment-accounting/balance${qs ? `?${qs}` : ''}`, {
      headers: await authHeaders(),
    });
    const body = (await res.json()) as AccountingBalance & { error?: string };
    if (!res.ok) return { error: mapApiError(res.status, body.error) };
    return { balance: body };
  } catch {
    return { error: 'API injoignable.' };
  }
}

export async function fetchAccountingPeriod(options: {
  periodStart: string;
  periodEnd: string;
  countryCode?: string;
}): Promise<{ summary?: AccountingPeriodSummary; error?: string }> {
  if (!API_URL) return { error: 'VITE_API_URL manquant.' };
  const params = new URLSearchParams({
    from: options.periodStart,
    to: options.periodEnd,
  });
  if (options.countryCode) params.set('country', options.countryCode);
  try {
    const res = await fetch(`${API_URL}/api/admin/payment-accounting/period?${params.toString()}`, {
      headers: await authHeaders(),
    });
    const body = (await res.json()) as AccountingPeriodSummary & { error?: string };
    if (!res.ok) return { error: mapApiError(res.status, body.error) };
    return { summary: body };
  } catch {
    return { error: 'API injoignable.' };
  }
}

export async function fetchAccountingSettlements(): Promise<{
  settlements?: AccountingSettlement[];
  error?: string;
}> {
  if (!API_URL) return { error: 'VITE_API_URL manquant.' };
  try {
    const res = await fetch(`${API_URL}/api/admin/payment-accounting/settlements`, {
      headers: await authHeaders(),
    });
    const body = (await res.json()) as { settlements?: AccountingSettlement[]; error?: string };
    if (!res.ok) return { error: mapApiError(res.status, body.error) };
    return { settlements: body.settlements ?? [] };
  } catch {
    return { error: 'API injoignable.' };
  }
}

export async function createAccountingSettlement(input: {
  periodStart: string;
  periodEnd: string;
  wiredAmountGnf: number;
  payoutDate: string;
  bankReference?: string | null;
  notes?: string | null;
}): Promise<{ ok: boolean; settlement?: AccountingSettlement; error?: string }> {
  if (!API_URL) return { ok: false, error: 'VITE_API_URL manquant.' };
  try {
    const res = await fetch(`${API_URL}/api/admin/payment-accounting/settlements`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    });
    const body = (await res.json()) as { settlement?: AccountingSettlement; error?: string };
    if (!res.ok) return { ok: false, error: mapApiError(res.status, body.error) };
    return { ok: true, settlement: body.settlement };
  } catch {
    return { ok: false, error: 'API injoignable.' };
  }
}

export async function reconcilePayment(
  id: string,
): Promise<{ ok: boolean; error?: string; summary?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/admin/payment-intents/${id}/reconcile`, {
      method: 'POST',
      headers: await authHeaders(),
      body: '{}',
    });
    const body = (await res.json()) as { error?: string; summary?: string };
    if (!res.ok) return { ok: false, error: body.error ?? 'Resync impossible.' };
    return { ok: true, summary: body.summary };
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
