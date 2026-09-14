import { Router } from 'express';
import { getSupabaseAdmin, type PaymentIntentRow } from '../lib/supabase-admin.js';
import { PAYMENT_INTENT_COLUMNS } from '../lib/supabase-list.js';
import { requireSupabaseAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/require-admin.js';
import {
  loadPaymentIntentForUser,
  reconcilePaymentIntent,
} from '../services/reconcile-payment-intent.js';

export const adminRouter = Router();

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function validateSyncEmail(email: string): string | null {
  if (!email) return 'email_required';
  if (email.length > 254 || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
    return 'email_invalid';
  }
  if (/^[0-9]+@theloop\.gn$/.test(email)) return 'synthetic_email_blocked';
  return null;
}

function paramId(raw: string | string[] | undefined): string {
  return Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '');
}

/**
 * POST /api/admin/sync-user-email
 * Body: { userId, email }
 * Aligne auth.users + public.users (service role — sans RPC SQL).
 */
adminRouter.post('/admin/sync-user-email', requireSupabaseAuth, requireAdmin, async (req, res) => {
  try {
    const userId = String(req.body?.userId ?? '').trim();
    const email = normalizeEmail(String(req.body?.email ?? ''));

    if (!userId) {
      res.status(400).json({ error: 'user_id_required' });
      return;
    }

    const emailError = validateSyncEmail(email);
    if (emailError) {
      res.status(400).json({ error: emailError });
      return;
    }

    const supabase = getSupabaseAdmin();

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      res.status(500).json({ error: profileError.message });
      return;
    }
    if (!profile) {
      res.status(404).json({ error: 'user_not_found' });
      return;
    }

    const { data: conflict } = await supabase
      .from('users')
      .select('id')
      .ilike('email', email)
      .neq('id', userId)
      .maybeSingle();

    if (conflict) {
      res.status(409).json({ error: 'email_already_used' });
      return;
    }

    const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });

    if (authError) {
      const msg = authError.message.toLowerCase();
      if (msg.includes('already') || msg.includes('duplicate')) {
        res.status(409).json({ error: 'email_already_used' });
        return;
      }
      if (msg.includes('not found')) {
        res.status(404).json({ error: 'auth_user_not_found' });
        return;
      }
      res.status(500).json({ error: authError.message });
      return;
    }

    const { error: dbError } = await supabase
      .from('users')
      .update({ email, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (dbError) {
      res.status(500).json({ error: dbError.message });
      return;
    }

    res.json({ ok: true, userId, email });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur.';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/admin/payment-intents?status=&fulfillment=&limit=&offset=
 * Liste paginée + résumé KPI rapide.
 */
adminRouter.get('/admin/payment-intents', requireSupabaseAuth, requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status ?? '').trim();
    const fulfillment = String(req.query.fulfillment ?? '').trim();
    const limitRaw = Number(req.query.limit ?? 30);
    const offsetRaw = Number(req.query.offset ?? 0);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(1, limitRaw), 100) : 30;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    const supabase = getSupabaseAdmin();

    const [paidCountRes, failedCountRes, pendingCountRes, volumeRes] = await Promise.all([
      supabase
        .from('payment_intents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'paid'),
      supabase
        .from('payment_intents')
        .select('id', { count: 'exact', head: true })
        .in('status', ['failed', 'cancelled']),
      supabase
        .from('payment_intents')
        .select('id', { count: 'exact', head: true })
        .in('status', ['created', 'redirected']),
      supabase
        .from('payment_intents')
        .select('djomy_paid_amount, amount_gnf')
        .eq('status', 'paid')
        .limit(500),
    ]);

    const paidVolumeGnf = (volumeRes.data ?? []).reduce((sum, row) => {
      const n = Number(row.djomy_paid_amount ?? row.amount_gnf ?? 0);
      return sum + (Number.isFinite(n) ? n : 0);
    }, 0);

    let query = supabase
      .from('payment_intents')
      .select(PAYMENT_INTENT_COLUMNS, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (fulfillment) query = query.eq('fulfillment_status', fulfillment);

    const { data, error, count } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    const intents = (data ?? []) as unknown as PaymentIntentRow[];
    const userIds = [...new Set(intents.map((i) => i.user_id))];

    const usersById = new Map<
      string,
      { email: string | null; firstName: string | null; lastName: string | null }
    >();

    if (userIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, email, first_name, last_name')
        .in('id', userIds);
      for (const u of users ?? []) {
        usersById.set(u.id, {
          email: u.email ?? null,
          firstName: u.first_name ?? null,
          lastName: u.last_name ?? null,
        });
      }
    }

    res.json({
      summary: {
        paid: paidCountRes.count ?? 0,
        failed: failedCountRes.count ?? 0,
        pending: pendingCountRes.count ?? 0,
        paidVolumeGnf,
      },
      total: count ?? intents.length,
      limit,
      offset,
      intents: intents.map((intent) => {
        const user = usersById.get(intent.user_id);
        return {
          id: intent.id,
          userId: intent.user_id,
          userEmail: user?.email ?? null,
          userName: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || null,
          billingPeriod: intent.billing_period,
          amountGnf: intent.amount_gnf,
          payerPhone: intent.payer_phone,
          paymentMethod: intent.payment_method,
          merchantReference: intent.merchant_reference,
          djomyTransactionId: intent.djomy_transaction_id,
          status: intent.status,
          fulfillmentStatus: intent.fulfillment_status,
          passGrantStatus: intent.pass_grant_status,
          djomyPaidAmount: intent.djomy_paid_amount,
          djomyStatus: intent.djomy_status ?? null,
          djomyProviderReference: intent.djomy_provider_reference ?? null,
          lastCheckedAt: intent.last_checked_at ?? null,
          lastWebhookEvent: intent.last_webhook_event ?? null,
          lastWebhookAt: intent.last_webhook_at ?? null,
          paidAt: intent.paid_at,
          createdAt: intent.created_at,
          updatedAt: intent.updated_at,
        };
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur.';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/admin/payment-intents/:id/reconcile
 * Relance verify Djomy + fulfill si SUCCESS.
 */
adminRouter.post(
  '/admin/payment-intents/:id/reconcile',
  requireSupabaseAuth,
  requireAdmin,
  async (req, res) => {
    try {
      const intentId = paramId(req.params.id);
      if (!intentId) {
        res.status(400).json({ error: 'Identifiant manquant.' });
        return;
      }

      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('payment_intents')
        .select(PAYMENT_INTENT_COLUMNS)
        .eq('id', intentId)
        .maybeSingle();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      if (!data) {
        res.status(404).json({ error: 'Commande introuvable.' });
        return;
      }

      const intent = data as unknown as PaymentIntentRow;
      const updated = await reconcilePaymentIntent(intent);
      const refreshed =
        (await loadPaymentIntentForUser(updated.id, updated.user_id)) ?? updated;

      res.json({
        ok: true,
        intent: {
          id: refreshed.id,
          status: refreshed.status,
          fulfillmentStatus: refreshed.fulfillment_status,
          passGrantStatus: refreshed.pass_grant_status,
          djomyStatus: refreshed.djomy_status ?? null,
          djomyPaidAmount: refreshed.djomy_paid_amount,
          paidAt: refreshed.paid_at,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur serveur.';
      res.status(500).json({ error: message });
    }
  },
);

/**
 * POST /api/admin/users-activity
 * Body: { userIds: string[] } — activité Auth uniquement pour les IDs demandés (pas tout le parc).
 */
adminRouter.post('/admin/users-activity', requireSupabaseAuth, requireAdmin, async (req, res) => {
  try {
    const rawIds: unknown[] = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
    const userIds = rawIds
      .map((id) => String(id ?? '').trim())
      .filter((id) => id.length > 0)
      .filter((id, index, arr) => arr.indexOf(id) === index)
      .slice(0, 50);

    if (userIds.length === 0) {
      res.json({ activity: {} });
      return;
    }

    const supabase = getSupabaseAdmin();
    const activity: Record<string, { lastSignInAt: string | null; email: string | null }> = {};

    await Promise.all(
      userIds.map(async (id) => {
        const { data, error } = await supabase.auth.admin.getUserById(id);
        if (error || !data.user) {
          activity[id] = { lastSignInAt: null, email: null };
          return;
        }
        activity[id] = {
          lastSignInAt: data.user.last_sign_in_at ?? null,
          email: data.user.email ?? null,
        };
      }),
    );

    res.json({ activity });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur.';
    res.status(500).json({ error: message });
  }
});
