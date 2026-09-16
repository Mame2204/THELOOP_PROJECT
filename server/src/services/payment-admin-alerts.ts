import type { SupabaseClient } from '@supabase/supabase-js';
import type { PaymentIntentRow } from '../lib/supabase-admin.js';
import { deliverPushToUserIds } from './push-delivery.js';

type PaymentAlertKind = 'fulfillment_failed' | 'stuck_pending';

const recentAlerts = new Map<string, number>();
const ALERT_TTL_MS = 6 * 60 * 60 * 1000;

function shouldAlert(key: string): boolean {
  const last = recentAlerts.get(key);
  const now = Date.now();
  if (last != null && now - last < ALERT_TTL_MS) return false;
  recentAlerts.set(key, now);
  return true;
}

async function resolveUserCountry(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('users')
    .select('country_code')
    .eq('id', userId)
    .maybeSingle();
  return data?.country_code ? String(data.country_code).toUpperCase() : null;
}

/** Inbox admin + push OS — dédoublonné 6 h par intent + type. */
export async function notifyAdminsPaymentAlert(
  supabase: SupabaseClient,
  input: {
    kind: PaymentAlertKind;
    intent: Pick<
      PaymentIntentRow,
      'id' | 'merchant_reference' | 'amount_gnf' | 'billing_period' | 'user_id'
    >;
    countryCode?: string | null;
  },
): Promise<void> {
  const key = `${input.kind}:${input.intent.id}`;
  if (!shouldAlert(key)) return;

  const countryCode =
    input.countryCode ?? (await resolveUserCountry(supabase, input.intent.user_id));
  const amount = input.intent.amount_gnf.toLocaleString('fr-FR');
  const ref = input.intent.merchant_reference;

  const title =
    input.kind === 'fulfillment_failed'
      ? 'Incident PASS — activation échouée'
      : 'Paiement bloqué — PASS non activé';

  const message =
    input.kind === 'fulfillment_failed'
      ? `Paiement confirmé mais l'activation PASS a échoué (${amount} GNF · ${input.intent.billing_period}). Réf. ${ref}. Consultez Paiements → Incidents.`
      : `Paiement Djomy confirmé depuis plus de 5 min sans activation PASS (${amount} GNF · ${input.intent.billing_period}). Réf. ${ref}. Lancez un Resync si besoin.`;

  const { data, error } = await supabase.rpc('admin_distribute_notifications', {
    p_title: title,
    p_message: message,
    p_audience: 'admin',
    p_country_code: countryCode,
    p_campaign_id: null,
  });

  if (error) {
    console.error('[payment-alert]', error.message);
    return;
  }

  const userIds = Array.isArray(data)
    ? data.map((id) => String(id)).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    : [];

  if (userIds.length) {
    await deliverPushToUserIds(supabase, userIds, title, message, {
      type: 'payment_alert',
      intentId: input.intent.id,
      kind: input.kind,
    });
  }
}
