import type { SupabaseClient } from '@supabase/supabase-js';
import { PAYMENT_INTENT_COLUMNS } from '../lib/supabase-list.js';
import type { PaymentIntentRow } from '../lib/supabase-admin.js';
import {
  loadPaymentIntentForUser,
  reconcilePaymentIntent,
} from './reconcile-payment-intent.js';
import { notifyAdminsPaymentAlert } from './payment-admin-alerts.js';
import {
  isDjomyAbandonedStatus,
  isDjomyPaidStatus,
} from './reconcile-payment-summary.js';

export interface PaymentReconcileCronResult {
  scanned: number;
  reconciled: number;
  errors: string[];
}

const STUCK_MIN_AGE_MS = 5 * 60 * 1000;

function isTerminalWithoutPass(intent: PaymentIntentRow): boolean {
  if (intent.status === 'cancelled' || intent.status === 'failed') return true;
  return isDjomyAbandonedStatus(intent.djomy_status ?? undefined);
}

function isPaidButPassPending(intent: PaymentIntentRow): boolean {
  if (intent.fulfillment_status !== 'pending') return false;
  if (intent.status === 'paid') return true;
  return isDjomyPaidStatus(intent.djomy_status ?? undefined);
}

/** Réconcilie les intents payés Djomy mais PASS non activé (webhook/poll raté). */
export async function runStuckPaymentReconciliation(
  supabase: SupabaseClient,
): Promise<PaymentReconcileCronResult> {
  const result: PaymentReconcileCronResult = { scanned: 0, reconciled: 0, errors: [] };
  const cutoff = new Date(Date.now() - STUCK_MIN_AGE_MS).toISOString();

  const { data, error } = await supabase
    .from('payment_intents')
    .select(PAYMENT_INTENT_COLUMNS)
    .eq('fulfillment_status', 'pending')
    .in('status', ['created', 'redirected', 'paid'])
    .not('djomy_transaction_id', 'is', null)
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true })
    .limit(25);

  if (error) {
    result.errors.push(error.message);
    return result;
  }

  for (const row of (data ?? []) as unknown as PaymentIntentRow[]) {
    const tx = row.djomy_transaction_id?.trim() ?? '';
    if (!tx || tx.startsWith('sandbox-force-')) continue;

    result.scanned += 1;

    let intent = row;
    try {
      await reconcilePaymentIntent(row);
      const refreshed = await loadPaymentIntentForUser(row.id, row.user_id);
      if (refreshed) intent = refreshed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${row.id}: ${message}`);
      continue;
    }

    if (intent.fulfillment_status === 'fulfilled') {
      result.reconciled += 1;
      continue;
    }

    if (isTerminalWithoutPass(intent)) {
      continue;
    }

    if (!isPaidButPassPending(intent)) {
      continue;
    }

    try {
      await notifyAdminsPaymentAlert(supabase, { kind: 'stuck_pending', intent });
    } catch (alertErr) {
      const message = alertErr instanceof Error ? alertErr.message : String(alertErr);
      result.errors.push(`${row.id}: alert ${message}`);
    }
  }

  return result;
}
