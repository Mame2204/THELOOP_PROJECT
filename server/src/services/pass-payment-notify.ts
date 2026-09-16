import { passLabel, type BillingPeriod } from '../config.js';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { sendExpoPushToUserIds } from './expo-push.js';

function formatDateFr(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

/** Inbox + push OS après fulfillment PASS Djomy (webhook ou polling). */
export async function notifyUserPassPaymentFulfilled(
  userId: string,
  billingPeriod: BillingPeriod,
  passGrantStatus: 'active' | 'pending',
  expiresAt: string | null,
  scheduledStartAt: string | null,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const label = passLabel(billingPeriod);
  const title = `Achat confirmé — ${label}`;
  const message =
    passGrantStatus === 'active'
      ? `Votre ${label} est actif.${
          expiresAt ? ` Valable jusqu'au ${formatDateFr(expiresAt)}.` : ' Sans expiration.'
        }`
      : `Votre ${label} est en file d'attente.${
          scheduledStartAt
            ? ` Il démarrera le ${formatDateFr(scheduledStartAt)}.`
            : ' Il démarrera à la fin de votre PASS actuel.'
        }`;

  const { error } = await supabase.from('user_notifications').insert({
    user_id: userId,
    title,
    message,
    audience: 'individual',
    sent_at: new Date().toISOString(),
  });
  if (error) {
    console.warn('[pass-notify] inbox', error.message);
  }

  const push = await sendExpoPushToUserIds(supabase, [userId], title, message, {
    type: 'pass_payment',
  });
  if (push.reason) {
    console.warn('[pass-notify] push', push.reason);
  }
}
