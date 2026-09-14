import { randomUUID } from 'node:crypto';
import { computePassExpiry, passLabel, type BillingPeriod } from '../config.js';
import { resolveChargedPassPrice, resolveMaxPendingPasses } from '../lib/pass-commerce-settings.js';
import { getSupabaseAdmin, type PaymentIntentRow } from '../lib/supabase-admin.js';

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
    .order('created_at', { ascending: false })
    .limit(15);

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

export async function fulfillPaymentIntent(
  intent: PaymentIntentRow,
  transactionId: string,
  paidAmount: number,
): Promise<{ passGrantStatus: 'active' | 'pending' }> {
  if (intent.fulfillment_status === 'fulfilled') {
    return { passGrantStatus: (intent.pass_grant_status as 'active' | 'pending') ?? 'active' };
  }

  if (paidAmount < intent.amount_gnf) {
    throw new Error(`Montant insuffisant : ${paidAmount} < ${intent.amount_gnf}`);
  }

  if (!isBillingPeriod(intent.billing_period)) {
    throw new Error('Période de facturation invalide.');
  }

  const plan = await buildFulfillmentPlan(intent.user_id, intent.billing_period);
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const label = passLabel(intent.billing_period);

  const { error: rpcError } = await supabase.rpc('fulfill_djomy_pass_payment', {
    p_user_id: intent.user_id,
    p_local_pass_id: intent.local_pass_id,
    p_pass_catalog_id: `prime-${intent.billing_period}`,
    p_label: label,
    p_status: plan.passStatus,
    p_started_at: plan.startedAt,
    p_expires_at: plan.expiresAt,
    p_amount_gnf: intent.amount_gnf,
    p_payment_method: intent.payment_method,
    p_paid_at: now,
    p_billing_period: intent.billing_period,
    p_scheduled_start_at: plan.scheduledStartAt,
    p_promote_prime: plan.promotePrime,
    p_djomy_transaction_id: transactionId,
    p_merchant_reference: intent.merchant_reference,
  });

  if (rpcError) {
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
