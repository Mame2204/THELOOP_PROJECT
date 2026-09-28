import { verifyPayment } from '../lib/djomy.js';
import { mapDjomyGatewayMethodToApp } from '../lib/djomy-fees.js';
import { getSupabaseAdmin, type PaymentIntentRow } from '../lib/supabase-admin.js';
import { PAYMENT_INTENT_COLUMNS } from '../lib/supabase-list.js';
import { fulfillPaymentIntent, markFulfillmentFailed } from './fulfill-pass-payment.js';
import { isDjomyAbandonedStatus } from './reconcile-payment-summary.js';

export const ABANDON_AFTER_MS = 30 * 60 * 1000;

function isOlderThan(iso: string | null | undefined, ms: number): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) || Date.now() - t > ms;
}

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
    payment_method?: string;
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

  const resolvedMethod = mapDjomyGatewayMethodToApp(verified.paymentMethod);
  await stampDjomyCheck(intent.id, {
    djomy_status: djomyStatus || undefined,
    djomy_provider_reference: providerRef,
    ...(resolvedMethod && intent.payment_method === 'all' ? { payment_method: resolvedMethod } : {}),
  });

  if (isPaidStatus(djomyStatus)) {
    const paidAmount = Number(verified.paidAmount ?? verified.receivedAmount ?? intent.amount_gnf);
    try {
      await fulfillPaymentIntent(intent, transactionId, paidAmount);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (intent.fulfillment_status === 'pending') {
        await markFulfillmentFailed(intent, message);
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

  // CREATED / REDIRECTED = portail encore ouvert : le membre peut payer après
  // le premier sondage de l'app. On ne clôt la commande qu'après un délai.
  if (isDjomyAbandonedStatus(djomyStatus) && isOlderThan(intent.created_at, ABANDON_AFTER_MS)) {
    await stampDjomyCheck(intent.id, {
      djomy_status: djomyStatus,
      djomy_provider_reference: providerRef,
      status: 'cancelled',
    });
    return { ...intent, status: 'cancelled', djomy_status: djomyStatus };
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

  let target = intent;
  if (!intent.djomy_transaction_id?.trim()) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('payment_intents')
      .update({ djomy_transaction_id: transactionId, updated_at: new Date().toISOString() })
      .eq('id', intent.id)
      .is('djomy_transaction_id', null);
    if (error) console.warn('[webhook] n° transaction', intent.id, error.message);
    target = { ...intent, djomy_transaction_id: transactionId };
  }

  // Le statut vient toujours de verify_payment : un événement « failed » peut
  // précéder un nouvel essai réussi sur la même transaction.
  await reconcilePaymentIntent(target);
}
