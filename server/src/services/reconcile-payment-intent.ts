import { verifyPayment } from '../lib/djomy.js';
import { getSupabaseAdmin, type PaymentIntentRow } from '../lib/supabase-admin.js';
import { PAYMENT_INTENT_COLUMNS } from '../lib/supabase-list.js';
import { fulfillPaymentIntent, markFulfillmentFailed } from './fulfill-pass-payment.js';

function isPaidStatus(status: string | undefined): boolean {
  const normalized = String(status ?? '').toUpperCase();
  return normalized === 'SUCCESS' || normalized === 'CAPTURED';
}

function isFailedStatus(status: string | undefined): boolean {
  const normalized = String(status ?? '').toUpperCase();
  return normalized === 'FAILED' || normalized === 'CANCELLED' || normalized === 'CANCELED' || normalized === 'TIMEOUT';
}

export async function loadPaymentIntentForUser(
  intentId: string,
  userId: string,
): Promise<PaymentIntentRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('payment_intents')
    .select(PAYMENT_INTENT_COLUMNS)
    .eq('id', intentId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PaymentIntentRow | null) ?? null;
}

export async function loadIntentByReference(reference: string): Promise<PaymentIntentRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('payment_intents')
    .select(PAYMENT_INTENT_COLUMNS)
    .eq('merchant_reference', reference)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PaymentIntentRow | null) ?? null;
}

export async function loadIntentByTransactionId(transactionId: string): Promise<PaymentIntentRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('payment_intents')
    .select(PAYMENT_INTENT_COLUMNS)
    .eq('djomy_transaction_id', transactionId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PaymentIntentRow | null) ?? null;
}

async function stampDjomyCheck(
  intentId: string,
  fields: {
    djomy_status?: string;
    djomy_provider_reference?: string | null;
    status?: string;
  },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('payment_intents')
    .update({
      ...fields,
      last_checked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', intentId);
}

/** Vérifie Djomy et active le PASS si paiement confirmé (webhook ou polling sans tunnel). */
export async function reconcilePaymentIntent(intent: PaymentIntentRow): Promise<PaymentIntentRow> {
  if (intent.fulfillment_status === 'fulfilled') {
    return intent;
  }

  const transactionId = intent.djomy_transaction_id?.trim();
  if (!transactionId) {
    return intent;
  }

  // Ignore les IDs de force sandbox locaux.
  if (transactionId.startsWith('sandbox-force-')) {
    return intent;
  }

  const verified = await verifyPayment(transactionId);
  const djomyStatus = String(verified.status ?? '');
  const providerRef = verified.providerReference?.trim() || null;

  await stampDjomyCheck(intent.id, {
    djomy_status: djomyStatus || undefined,
    djomy_provider_reference: providerRef,
  });

  if (isPaidStatus(djomyStatus)) {
    const paidAmount = Number(verified.paidAmount ?? verified.receivedAmount ?? intent.amount_gnf);
    try {
      await fulfillPaymentIntent(intent, transactionId, paidAmount);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (intent.fulfillment_status === 'pending') {
        await markFulfillmentFailed(intent.id, message);
      }
      throw err;
    }
    const refreshed = await loadPaymentIntentForUser(intent.id, intent.user_id);
    return refreshed ?? intent;
  }

  if (isFailedStatus(djomyStatus)) {
    console.warn('[reconcile] Paiement Djomy refusé', intent.id, djomyStatus);
    const nextStatus =
      djomyStatus.toUpperCase() === 'CANCELLED' || djomyStatus.toUpperCase() === 'CANCELED'
        ? 'cancelled'
        : 'failed';
    await stampDjomyCheck(intent.id, {
      djomy_status: djomyStatus,
      djomy_provider_reference: providerRef,
      status: nextStatus,
    });

    return { ...intent, status: nextStatus, djomy_status: djomyStatus };
  }

  return {
    ...intent,
    djomy_status: djomyStatus || intent.djomy_status,
    djomy_provider_reference: providerRef ?? intent.djomy_provider_reference,
  };
}

export async function recordWebhookEvent(
  intent: PaymentIntentRow,
  eventType: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase
    .from('payment_intents')
    .update({
      last_webhook_event: eventType,
      last_webhook_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', intent.id);
}

export async function processSuccessfulDjomyPayment(
  transactionId: string,
  merchantReference?: string,
): Promise<void> {
  const intent =
    (merchantReference ? await loadIntentByReference(merchantReference) : null) ??
    (await loadIntentByTransactionId(transactionId));

  if (!intent) {
    console.warn('[payment] Intent introuvable pour', transactionId, merchantReference);
    return;
  }

  await reconcilePaymentIntent(intent);
}

export async function processDjomyWebhookEvent(
  eventType: string,
  transactionId: string,
  merchantReference?: string,
): Promise<void> {
  const intent =
    (merchantReference ? await loadIntentByReference(merchantReference) : null) ??
    (await loadIntentByTransactionId(transactionId));

  if (!intent) {
    console.warn('[webhook] Intent introuvable', eventType, transactionId, merchantReference);
    return;
  }

  await recordWebhookEvent(intent, eventType);

  if (eventType === 'payment.success') {
    await reconcilePaymentIntent(intent);
    return;
  }

  if (
    eventType === 'payment.failed' ||
    eventType === 'payment.cancelled' ||
    eventType === 'payment.canceled'
  ) {
    const nextStatus = eventType.includes('cancel') ? 'cancelled' : 'failed';
    const supabase = getSupabaseAdmin();
    await supabase
      .from('payment_intents')
      .update({
        status: nextStatus,
        djomy_status: eventType.replace('payment.', '').toUpperCase(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', intent.id)
      .eq('fulfillment_status', 'pending');
  }
}
