import { isAdminBackendConfigured } from '@/lib/admin-user-backend-api';
import { supabase } from '@/lib/supabase';

const BACKEND_API_URL = (
  process.env.EXPO_PUBLIC_BACKEND_API_URL ??
  process.env.EXPO_PUBLIC_PAYMENT_API_URL ??
  ''
).replace(/\/$/, '');

/** Resync Djomy utile seulement si une transaction existe et le PASS n’est pas déjà activé. */
export function canReconcilePaymentIntent(intent: Pick<
  AdminPaymentIntent,
  'djomyTransactionId' | 'fulfillmentStatus'
>): boolean {
  const tx = intent.djomyTransactionId?.trim() ?? '';
  if (!tx || tx.startsWith('sandbox-force-')) return false;
  if (intent.fulfillmentStatus === 'fulfilled') return false;
  return intent.fulfillmentStatus === 'pending' || intent.fulfillmentStatus === 'failed';
}

export function reconcileDisabledReason(intent: Pick<
  AdminPaymentIntent,
  'djomyTransactionId' | 'fulfillmentStatus'
>): string | null {
  if (canReconcilePaymentIntent(intent)) return null;
  if (intent.fulfillmentStatus === 'fulfilled') return 'PASS déjà activé';
  if (!intent.djomyTransactionId?.trim()) return 'Pas encore de transaction Djomy';
  return 'Resync non nécessaire';
}

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
  grossGnf?: number;
  feeRatePercent?: number | null;
  feeRateLabel?: string | null;
  feeGnf?: number;
  netGnf?: number;
}

export interface AdminPaymentSummary {
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

export interface AdminPaymentAnalytics {
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
  bucket?: 'in_progress' | 'paid' | 'abandoned';
  fulfillment?: string;
  countryCode?: string;
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
  if (options?.bucket) params.set('bucket', options.bucket);
  if (options?.fulfillment) params.set('fulfillment', options.fulfillment);
  if (options?.countryCode) params.set('country', options.countryCode);
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

export async function fetchAdminPaymentAnalytics(options?: {
  countryCode?: string;
  days?: number;
}): Promise<{ analytics?: AdminPaymentAnalytics; error?: string }> {
  if (!isAdminBackendConfigured()) {
    return { error: 'Backend non configuré.' };
  }
  const params = new URLSearchParams();
  if (options?.countryCode) params.set('country', options.countryCode);
  if (options?.days) params.set('days', String(options.days));
  const qs = params.toString();
  try {
    const response = await fetch(
      `${BACKEND_API_URL}/api/admin/payment-intents/analytics${qs ? `?${qs}` : ''}`,
      { method: 'GET', headers: await authHeaders() },
    );
    const body = (await response.json()) as AdminPaymentAnalytics & { error?: string };
    if (!response.ok) {
      return { error: body.error ?? 'Analytics indisponibles.' };
    }
    return { analytics: body };
  } catch {
    return { error: 'Impossible de joindre le serveur de paiement.' };
  }
}

export async function fetchAdminPaymentCsv(options?: {
  countryCode?: string;
  fulfillment?: string;
  days?: number;
}): Promise<{ csv?: string; error?: string }> {
  if (!isAdminBackendConfigured()) {
    return { error: 'Backend non configuré.' };
  }
  const params = new URLSearchParams();
  if (options?.countryCode) params.set('country', options.countryCode);
  if (options?.fulfillment) params.set('fulfillment', options.fulfillment);
  if (options?.days) params.set('days', String(options.days ?? 90));
  try {
    const response = await fetch(
      `${BACKEND_API_URL}/api/admin/payment-intents/export.csv?${params.toString()}`,
      { method: 'GET', headers: await authHeaders() },
    );
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      return { error: body.error ?? 'Export impossible.' };
    }
    const csv = await response.text();
    return { csv };
  } catch {
    return { error: 'Impossible de joindre le serveur.' };
  }
}

export async function reconcileAdminPaymentIntent(
  intentId: string,
): Promise<{ ok: boolean; error?: string; summary?: string; intent?: Partial<AdminPaymentIntent> }> {
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
      summary?: string;
      intent?: {
        id: string;
        status: string;
        fulfillmentStatus: string;
        passGrantStatus: string | null;
        djomyStatus: string | null;
        djomyPaidAmount: number | null;
        paidAt: string | null;
        lastCheckedAt: string | null;
      };
    };
    if (!response.ok) {
      return { ok: false, error: body.error ?? 'Resynchronisation impossible.' };
    }
    return { ok: true, summary: body.summary, intent: body.intent };
  } catch {
    return { ok: false, error: 'Impossible de joindre le serveur.' };
  }
}

/** Activité Auth uniquement pour les IDs de la page courante (max 50). */
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
  if (!isAdminBackendConfigured()) return { error: 'Backend non configuré.' };
  const params = new URLSearchParams();
  if (options?.countryCode) params.set('country', options.countryCode);
  const qs = params.toString();
  try {
    const response = await fetch(
      `${BACKEND_API_URL}/api/admin/payment-accounting/balance${qs ? `?${qs}` : ''}`,
      { method: 'GET', headers: await authHeaders() },
    );
    const body = (await response.json()) as AccountingBalance & { error?: string };
    if (!response.ok) return { error: body.error ?? 'Solde compta indisponible.' };
    return { balance: body };
  } catch {
    return { error: 'Impossible de joindre le serveur.' };
  }
}

export async function fetchAccountingPeriod(options: {
  periodStart: string;
  periodEnd: string;
  countryCode?: string;
}): Promise<{ summary?: AccountingPeriodSummary; error?: string }> {
  if (!isAdminBackendConfigured()) return { error: 'Backend non configuré.' };
  const params = new URLSearchParams({ from: options.periodStart, to: options.periodEnd });
  if (options.countryCode) params.set('country', options.countryCode);
  try {
    const response = await fetch(
      `${BACKEND_API_URL}/api/admin/payment-accounting/period?${params.toString()}`,
      { method: 'GET', headers: await authHeaders() },
    );
    const body = (await response.json()) as AccountingPeriodSummary & { error?: string };
    if (!response.ok) return { error: body.error ?? 'Période compta indisponible.' };
    return { summary: body };
  } catch {
    return { error: 'Impossible de joindre le serveur.' };
  }
}

export async function fetchAccountingSettlements(): Promise<{
  settlements?: AccountingSettlement[];
  error?: string;
}> {
  if (!isAdminBackendConfigured()) return { error: 'Backend non configuré.' };
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/admin/payment-accounting/settlements`, {
      method: 'GET',
      headers: await authHeaders(),
    });
    const body = (await response.json()) as { settlements?: AccountingSettlement[]; error?: string };
    if (!response.ok) return { error: body.error ?? 'Historique indisponible.' };
    return { settlements: body.settlements ?? [] };
  } catch {
    return { error: 'Impossible de joindre le serveur.' };
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
  if (!isAdminBackendConfigured()) return { ok: false, error: 'Backend non configuré.' };
  try {
    const response = await fetch(`${BACKEND_API_URL}/api/admin/payment-accounting/settlements`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(input),
    });
    const body = (await response.json()) as { settlement?: AccountingSettlement; error?: string };
    if (!response.ok) return { ok: false, error: body.error ?? 'Enregistrement impossible.' };
    return { ok: true, settlement: body.settlement };
  } catch {
    return { ok: false, error: 'Impossible de joindre le serveur.' };
  }
}

function parseSignInActivityRpc(
  raw: unknown,
): Record<string, { lastSignInAt: string | null; email: string | null }> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, { lastSignInAt: string | null; email: string | null }> = {};
  for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
    const row = entry as { lastSignInAt?: string | null };
    out[id] = {
      lastSignInAt: typeof row.lastSignInAt === 'string' ? row.lastSignInAt : null,
      email: null,
    };
  }
  return out;
}

export async function fetchUsersAuthActivity(userIds: string[]): Promise<{
  activity: Record<string, { lastSignInAt: string | null; email: string | null }>;
  error?: string;
}> {
  if (!userIds.length) return { activity: {} };

  if (supabase) {
    const slice = userIds.slice(0, 50);
    const { data, error } = await supabase.rpc('admin_users_sign_in_activity', {
      p_user_ids: slice,
    });
    if (!error) {
      return { activity: parseSignInActivityRpc(data) };
    }
  }

  if (!isAdminBackendConfigured()) {
    return { activity: {}, error: 'Activité Auth indisponible.' };
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
