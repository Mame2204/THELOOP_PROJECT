import type { SupabaseClient } from '@supabase/supabase-js';
import { PAYMENT_INTENT_COLUMNS } from '../lib/supabase-list.js';
import type { PaymentIntentRow } from '../lib/supabase-admin.js';
import { reconcilePaymentIntent } from './reconcile-payment-intent.js';

export interface PaymentReconcileCronResult {
  scanned: number;
  reconciled: number;
  errors: string[];
}

const STUCK_MIN_AGE_MS = 5 * 60 * 1000;

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
    try {
      const before = row.fulfillment_status;
      const after = await reconcilePaymentIntent(row);
      if (after.fulfillment_status === 'fulfilled' && before !== 'fulfilled') {
        result.reconciled += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`${row.id}: ${message}`);
    }
  }

  return result;
}
