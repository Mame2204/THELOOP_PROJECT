import type { SupabaseClient } from '@supabase/supabase-js';
import { PAYMENT_INTENT_COLUMNS } from '../lib/supabase-list.js';
import type { PaymentIntentRow } from '../lib/supabase-admin.js';
import {
  loadPaymentIntentForUser,
  reconcilePaymentIntent,
} from './reconcile-payment-intent.js';
import { notifyAdminsPaymentAlert } from './payment-admin-alerts.js';
import {
  isPaidButPassPending,
  isTerminalWithoutPass,
} from './reconcile-payment-summary.js';

export interface PaymentReconcileCronResult {
  scanned: number;
  reconciled: number;
  errors: string[];
}

const STUCK_MIN_AGE_MS = 5 * 60 * 1000;
/** Commandes closes (échec, annulation, livraison ratée) revérifiées moins souvent. */
const CLOSED_RECHECK_MS = 30 * 60 * 1000;
const CLOSED_LOOKBACK_MS = 72 * 60 * 60 * 1000;

/** Réconcilie les intents payés Djomy mais PASS non activé (webhook/poll raté). */
export async function runStuckPaymentReconciliation(
  supabase: SupabaseClient,
): Promise<PaymentReconcileCronResult> {
  const result: PaymentReconcileCronResult = { scanned: 0, reconciled: 0, errors: [] };
  const cutoff = new Date(Date.now() - STUCK_MIN_AGE_MS).toISOString();
  const closedCutoff = new Date(Date.now() - CLOSED_RECHECK_MS).toISOString();
  const lookback = new Date(Date.now() - CLOSED_LOOKBACK_MS).toISOString();

  const [open, closed] = await Promise.all([
    supabase
      .from('payment_intents')
      .select(PAYMENT_INTENT_COLUMNS)
      .eq('fulfillment_status', 'pending')
      .in('status', ['created', 'redirected', 'paid'])
      .not('djomy_transaction_id', 'is', null)
      .lt('updated_at', cutoff)
      .order('updated_at', { ascending: true })
      .limit(25),
    // Débit arrivé après une annulation, ou livraison en échec à retenter.
    supabase
      .from('payment_intents')
      .select(PAYMENT_INTENT_COLUMNS)
      .in('fulfillment_status', ['pending', 'failed'])
      .in('status', ['failed', 'cancelled', 'paid'])
      .not('djomy_transaction_id', 'is', null)
      .gt('created_at', lookback)
      .lt('updated_at', closedCutoff)
      .order('updated_at', { ascending: true })
      .limit(10),
  ]);

  if (open.error) result.errors.push(open.error.message);
  if (closed.error) result.errors.push(closed.error.message);

  const rows = new Map<string, PaymentIntentRow>();
  for (const row of [...(open.data ?? []), ...(closed.data ?? [])] as unknown as PaymentIntentRow[]) {
    rows.set(row.id, row);
  }

  for (const row of rows.values()) {
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
