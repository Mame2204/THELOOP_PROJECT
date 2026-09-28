import { randomUUID } from 'node:crypto';
import { computePassExpiry, passLabel, type BillingPeriod } from '../config.js';
import { resolveChargedPassPrice, resolveMaxPendingPasses } from '../lib/pass-commerce-settings.js';
import { getSupabaseAdmin, type PaymentIntentRow } from '../lib/supabase-admin.js';
import { notifyAdminsPaymentAlert } from './payment-admin-alerts.js';
import { notifyUserPassPaymentFulfilled } from './pass-payment-notify.js';

function isBillingPeriod(value: string): value is BillingPeriod {
  return value === 'monthly' || value === 'quarterly' || value === 'annual' || value === 'lifetime';
}

interface PassGrantRow {
  status: string;
  expires_at: string | null;
  pass_kind: string | null;
  label: string | null;
  billing_period: string | null;
  scheduled_start_at: string | null;
}

function isActiveGrant(row: PassGrantRow, at = new Date()): boolean {
  if (row.status !== 'active') return false;
  if (row.pass_kind === 'heritage' || row.pass_kind === 'bonus') return true;
  if (!row.expires_at) return true;
  return new Date(row.expires_at) > at;
}

function isHeritageLabel(label: string | null | undefined): boolean {
  const n = (label ?? '').toLowerCase();
  return n.includes('heritage') || n.includes('affinit') || (n.includes('bonus') && n.includes('pass'));
}

async function loadUserPassGrants(userId: string): Promise<PassGrantRow[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('user_pass_grants')
    .select('status, expires_at, pass_kind, label, billing_period, scheduled_start_at')
    .eq('user_id', userId)
    .in('status', ['active', 'pending'])
    .order('paid_at', { ascending: true, nullsFirst: true })
    .order('started_at', { ascending: true })
    .limit(100);

  if (error) throw new Error(`Lecture PASS : ${error.message}`);
  return (data ?? []) as PassGrantRow[];
}

function estimateQueueStart(activeExpiry: string | null, pending: PassGrantRow[]): string {
  let cursor = activeExpiry ?? new Date().toISOString();
  for (const p of pending) {
    if (p.scheduled_start_at) cursor = p.scheduled_start_at;
    const period = (p.billing_period as BillingPeriod | null) ?? 'monthly';
    const end = computePassExpiry(period, new Date(cursor));
    if (end) cursor = end;
  }
  return cursor;
}

export interface FulfillmentPlan {
  passStatus: 'active' | 'pending';
  startedAt: string;
  expiresAt: string | null;
  scheduledStartAt: string | null;
  promotePrime: boolean;
}

export async function buildFulfillmentPlan(
  userId: string,
  period: BillingPeriod,
): Promise<FulfillmentPlan> {
  const grants = await loadUserPassGrants(userId);
  const active = grants.find((g) => isActiveGrant(g));
  const pending = grants.filter((g) => g.status === 'pending');
  const now = new Date().toISOString();

  if (active && (isHeritageLabel(active.label) || !active.expires_at)) {
    throw new Error('lifetime_active');
  }

  if (pending.some((g) => g.billing_period === 'lifetime')) {
    throw new Error('lifetime_queued');
  }

  const maxPending = await resolveMaxPendingPasses();
  if (active && pending.length >= maxPending) {
    throw new Error('pending_limit');
  }

  if (!active) {
    return {
      passStatus: 'active',
      startedAt: now,
      expiresAt: computePassExpiry(period),
      scheduledStartAt: null,
      promotePrime: true,
    };
  }

  return {
    passStatus: 'pending',
    startedAt: now,
    expiresAt: null,
    scheduledStartAt: estimateQueueStart(active.expires_at, pending),
    promotePrime: false,
  };
}

export async function markFulfillmentFailed(
  intent: Pick<
    PaymentIntentRow,
    'id' | 'merchant_reference' | 'amount_gnf' | 'billing_period' | 'user_id'
  >,
  reason: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  console.error('[fulfillment] Échec intent', intent.id, reason);
  const { data } = await supabase
    .from('payment_intents')
    .update({
      fulfillment_status: 'failed',
      status: 'paid',
      updated_at: now,
      last_webhook_event: 'fulfillment_failed',
      last_webhook_at: now,
    })
    .eq('id', intent.id)
    .eq('fulfillment_status', 'pending')
    .select('id');

  // Les nouvelles tentatives (cron, resync) ne renvoient pas la même alerte.
  if ((data ?? []).length > 0) {
    await notifyAdminsPaymentAlert(supabase, { kind: 'fulfillment_failed', intent });
  }
}

interface FulfillIntentRpcResult {
  already: boolean;
  pass_status: 'active' | 'pending';
  expires_at: string | null;
  scheduled_start_at: string | null;
}

function isMissingRpc(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || /could not find the function/i.test(error.message ?? '');
}

export async function fulfillPaymentIntent(
  intent: PaymentIntentRow,
  transactionId: string,
  paidAmount: number,
): Promise<{ passGrantStatus: 'active' | 'pending' }> {
  if (intent.fulfillment_status === 'fulfilled') {
    return { passGrantStatus: (intent.pass_grant_status as 'active' | 'pending') ?? 'active' };
  }

  if (!Number.isFinite(paidAmount) || paidAmount < intent.amount_gnf) {
    throw new Error(`Montant insuffisant : ${paidAmount} < ${intent.amount_gnf}`);
  }

  if (!isBillingPeriod(intent.billing_period)) {
    throw new Error('Période de facturation invalide.');
  }

  const supabase = getSupabaseAdmin();
  const { data: rpcData, error: atomicError } = await supabase.rpc('fulfill_payment_intent', {
    p_intent_id: intent.id,
    p_transaction_id: transactionId,
    p_paid_amount: Math.round(paidAmount),
  });

  if (!atomicError) {
    const result = rpcData as FulfillIntentRpcResult;
    if (!result.already) {
      try {
        await notifyUserPassPaymentFulfilled(
          intent.user_id,
          intent.billing_period,
          result.pass_status,
          result.expires_at,
          result.scheduled_start_at,
        );
      } catch (notifyErr) {
        console.warn('[fulfillment] notification PASS', notifyErr);
      }
    }
    return { passGrantStatus: result.pass_status };
  }

  if (!isMissingRpc(atomicError)) {
    await markFulfillmentFailed(intent, `Fulfillment RPC : ${atomicError.message}`);
    throw new Error(`Fulfillment RPC : ${atomicError.message}`);
  }

  // Base sans la migration 20260958 : ancien chemin, non atomique.
  return fulfillPaymentIntentLegacy(intent, transactionId, paidAmount, intent.billing_period);
}

async function fulfillPaymentIntentLegacy(
  intent: PaymentIntentRow,
  transactionId: string,
  paidAmount: number,
  period: BillingPeriod,
): Promise<{ passGrantStatus: 'active' | 'pending' }> {
  const plan = await buildFulfillmentPlan(intent.user_id, period);
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const label = passLabel(period);

  const { error: rpcError } = await supabase.rpc('fulfill_djomy_pass_payment', {
    p_user_id: intent.user_id,
    p_local_pass_id: intent.local_pass_id,
    p_pass_catalog_id: `prime-${period}`,
    p_label: label,
    p_status: plan.passStatus,
    p_started_at: plan.startedAt,
    p_expires_at: plan.expiresAt,
    p_amount_gnf: intent.amount_gnf,
    p_payment_method: intent.payment_method,
    p_paid_at: now,
    p_billing_period: period,
    p_scheduled_start_at: plan.scheduledStartAt,
    p_promote_prime: plan.promotePrime,
    p_djomy_transaction_id: transactionId,
    p_merchant_reference: intent.merchant_reference,
  });

  if (rpcError) {
    await markFulfillmentFailed(intent, `Fulfillment RPC : ${rpcError.message}`);
    throw new Error(`Fulfillment RPC : ${rpcError.message}`);
  }

  const { error: updateError } = await supabase
    .from('payment_intents')
    .update({
      status: 'paid',
      fulfillment_status: 'fulfilled',
      pass_grant_status: plan.passStatus,
      djomy_transaction_id: transactionId,
      djomy_paid_amount: paidAmount,
      paid_at: now,
      updated_at: now,
    })
    .eq('id', intent.id)
    .eq('fulfillment_status', 'pending');

  if (updateError) {
    throw new Error(`Mise à jour intent : ${updateError.message}`);
  }

  try {
    await notifyUserPassPaymentFulfilled(
      intent.user_id,
      period,
      plan.passStatus,
      plan.expiresAt,
      plan.scheduledStartAt,
    );
  } catch (notifyErr) {
    console.warn('[fulfillment] notification PASS', notifyErr);
  }

  return { passGrantStatus: plan.passStatus };
}

export function buildMerchantReference(userId: string): string {
  return `LOOP-${userId.slice(0, 8).toUpperCase()}-${Date.now()}`;
}

export function buildLocalPassId(): string {
  return `prime-${randomUUID()}`;
}

/** @deprecated Utiliser resolveChargedPassPrice (async, lit app_settings). */
export async function resolveServerPassPrice(period: BillingPeriod): Promise<number> {
  return resolveChargedPassPrice(period);
}
