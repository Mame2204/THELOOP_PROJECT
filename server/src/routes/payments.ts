import { Router } from 'express';
import { config, type BillingPeriod } from '../config.js';
import {
  createPaymentGateway,
  mapPaymentMethodToDjomy,
  parseAppPaymentMethod,
  resolvePaymentUrl,
} from '../lib/djomy.js';
import { getSupabaseAdmin, type PaymentIntentRow } from '../lib/supabase-admin.js';
import { PAYMENT_INTENT_COLUMNS } from '../lib/supabase-list.js';
import { requireSupabaseAuth } from '../middleware/auth.js';
import {
  fulfillPaymentIntent,
  buildFulfillmentPlan,
  buildLocalPassId,
  buildMerchantReference,
  resolveServerPassPrice,
} from '../services/fulfill-pass-payment.js';
import {
  loadPaymentIntentForUser,
  reconcilePaymentIntent,
} from '../services/reconcile-payment-intent.js';
import { normalizePayerIdentifierForDjomy } from '../lib/payer-phone.js';

export const paymentsRouter = Router();

function parsePeriod(raw: unknown): BillingPeriod | null {
  if (raw === 'monthly' || raw === 'quarterly' || raw === 'annual' || raw === 'lifetime') return raw;
  return null;
}

/**
 * POST /api/create-payment
 * Body: { period, payerPhone, paymentMethod? }
 * Réponse: { paymentUrl, paymentIntentId }
 */
paymentsRouter.post('/create-payment', requireSupabaseAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const period = parsePeriod(req.body?.period);
    const payerPhoneRaw = String(req.body?.payerPhone ?? '').trim();
    const paymentMethod = parseAppPaymentMethod(req.body?.paymentMethod);

    if (!period) {
      res.status(400).json({ error: 'Période PASS invalide.' });
      return;
    }

    if (!payerPhoneRaw) {
      res.status(400).json({ error: 'Numéro de paiement requis.' });
      return;
    }

    const amountGnf = await resolveServerPassPrice(period);
    const payerPhone = normalizePayerIdentifierForDjomy(payerPhoneRaw, paymentMethod);
    const localPassId = buildLocalPassId();
    const merchantReference = buildMerchantReference(userId);
    const supabase = getSupabaseAdmin();

    // Refuse avant Djomy si file pleine / PASS à vie (même règles que le fulfillment).
    try {
      await buildFulfillmentPlan(userId, period);
    } catch (planErr) {
      const code = planErr instanceof Error ? planErr.message : 'purchase_blocked';
      if (code === 'lifetime_active') {
        res.status(409).json({ error: 'Vous avez déjà un PASS à vie.' });
        return;
      }
      if (code === 'pending_limit') {
        res.status(409).json({ error: 'File d\'attente PASS pleine. Attendez qu\'un PASS se déclenche.' });
        return;
      }
      res.status(409).json({ error: code });
      return;
    }

    const { data: intent, error: insertError } = await supabase
      .from('payment_intents')
      .insert({
        user_id: userId,
        billing_period: period,
        amount_gnf: amountGnf,
        payer_phone: payerPhoneRaw,
        payment_method: paymentMethod,
        local_pass_id: localPassId,
        merchant_reference: merchantReference,
        status: 'created',
        fulfillment_status: 'pending',
      })
      .select(PAYMENT_INTENT_COLUMNS)
      .single();

    if (insertError || !intent) {
      res.status(500).json({ error: insertError?.message ?? 'Impossible de créer la commande.' });
      return;
    }

    const intentRow = intent as unknown as PaymentIntentRow;
    const allowedPaymentMethods = mapPaymentMethodToDjomy(paymentMethod);

    const gateway = await createPaymentGateway({
      amount: amountGnf,
      countryCode: 'GN',
      payerNumber: payerPhone,
      ...(allowedPaymentMethods ? { allowedPaymentMethods } : {}),
      description: `THE LOOP — ${period}`,
      merchantPaymentReference: merchantReference,
      returnUrl: config.djomyReturnUrl,
      cancelUrl: config.djomyCancelUrl,
      metadata: {
        payment_intent_id: intentRow.id,
        user_id: userId,
        billing_period: period,
      },
    });

    const paymentUrl = resolvePaymentUrl(gateway);
    if (!paymentUrl) {
      res.status(502).json({ error: 'Djomy n\'a pas renvoyé d\'URL de paiement.' });
      return;
    }

    console.log('[create-payment]', {
      intentId: intentRow.id,
      transactionId: gateway.transactionId,
      amountGnf,
      payerPhone,
      paymentUrl,
    });

    await supabase
      .from('payment_intents')
      .update({
        djomy_transaction_id: gateway.transactionId,
        status: 'redirected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', intentRow.id);

    res.json({
      paymentUrl,
      paymentIntentId: intentRow.id,
      amountGnf,
      payerPhone,
      sandboxMode: config.paymentSandboxAmounts,
    });
  } catch (err) {
    console.error('[create-payment]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erreur serveur.' });
  }
});

/**
 * POST /api/payments/:id/sandbox-complete
 * Uniquement si PAYMENT_SANDBOX_AMOUNTS — force fulfillment sans succès portail Djomy.
 * Sert aux tests internes quand le sandbox Djomy refuse l’OTP / le vrai numéro.
 */
paymentsRouter.post('/payments/:id/sandbox-complete', requireSupabaseAuth, async (req, res) => {
  try {
    if (!config.paymentSandboxAmounts) {
      res.status(403).json({ error: 'Réservé au mode sandbox serveur.' });
      return;
    }

    const userId = req.authUser!.id;
    const intentId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id ?? '');
    if (!intentId) {
      res.status(400).json({ error: 'Identifiant commande manquant.' });
      return;
    }
    let data = await loadPaymentIntentForUser(intentId, userId);
    if (!data) {
      res.status(404).json({ error: 'Commande introuvable.' });
      return;
    }

    if (data.fulfillment_status === 'fulfilled') {
      res.json({
        status: data.status,
        fulfillmentStatus: data.fulfillment_status,
        passGrantStatus: data.pass_grant_status,
        paidAt: data.paid_at,
        sandboxForced: true,
      });
      return;
    }

    const txId = data.djomy_transaction_id?.trim() || `sandbox-force-${data.id}`;
    await fulfillPaymentIntent(data, txId, Number(data.amount_gnf));
    data = (await loadPaymentIntentForUser(intentId, userId)) ?? data;

    console.log('[sandbox-complete]', { intentId, userId, status: data.status });

    res.json({
      status: data.status,
      fulfillmentStatus: data.fulfillment_status,
      passGrantStatus: data.pass_grant_status,
      paidAt: data.paid_at,
      sandboxForced: true,
    });
  } catch (err) {
    console.error('[sandbox-complete]', err);
    const message = err instanceof Error ? err.message : 'Erreur serveur.';
    if (message === 'lifetime_active' || message === 'pending_limit') {
      res.status(409).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

paymentsRouter.get('/payments/:id/status', requireSupabaseAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const intentId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id ?? '');
    let data = await loadPaymentIntentForUser(intentId, userId);

    if (!data) {
      res.status(404).json({ error: 'Commande introuvable.' });
      return;
    }

    if (data.fulfillment_status === 'pending' && data.djomy_transaction_id) {
      try {
        data = await reconcilePaymentIntent(data);
      } catch (reconcileErr) {
        console.warn('[payment-status] reconcile', reconcileErr);
      }
    }

    res.json({
      status: data.status,
      fulfillmentStatus: data.fulfillment_status,
      passGrantStatus: data.pass_grant_status,
      paidAt: data.paid_at,
    });
  } catch (err) {
    console.error('[payment-status]', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});
