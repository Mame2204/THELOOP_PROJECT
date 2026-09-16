import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { sendExpoPushToUserIds } from './expo-push.js';

async function insertBenefitInbox(
  memberUserId: string,
  title: string,
  message: string,
): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(memberUserId)) return;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('user_notifications').insert({
    user_id: memberUserId,
    title,
    message,
    audience: 'individual',
    sent_at: new Date().toISOString(),
  });
  if (error) {
    console.warn('[benefit-notify] inbox', error.message);
  }
}

/** Inbox + push OS après validation privilège (fallback route serveur). */
export async function notifyMemberBenefitValidated(
  memberUserId: string,
  benefitTitle: string,
  placeLabel: string,
): Promise<void> {
  const title = 'Privilège validé';
  const message = `Votre privilège « ${benefitTitle.trim()} » a été validé — ${placeLabel.trim() || 'le partenaire'}.`;
  await insertBenefitInbox(memberUserId, title, message);
  await pushMemberBenefitOutcome(memberUserId, title, message, 'benefit_validated');
}

/** Inbox + push OS après annulation validation privilège. */
export async function notifyMemberBenefitCancelled(
  memberUserId: string,
  benefitTitle: string,
  placeLabel: string,
): Promise<void> {
  const title = 'Validation annulée';
  const message = `La validation de « ${benefitTitle.trim()} » chez ${placeLabel.trim() || 'le partenaire'} a été annulée. Vous pouvez réutiliser le privilège.`;
  await insertBenefitInbox(memberUserId, title, message);
  await pushMemberBenefitOutcome(memberUserId, title, message, 'benefit_cancelled');
}

/** Push OS uniquement (inbox déjà créée par RPC Supabase). */
export async function pushMemberBenefitValidated(
  memberUserId: string,
  benefitTitle: string,
  placeLabel: string,
): Promise<void> {
  const title = 'Privilège validé';
  const message = `Votre privilège « ${benefitTitle.trim()} » a été validé — ${placeLabel.trim() || 'le partenaire'}.`;
  await pushMemberBenefitOutcome(memberUserId, title, message, 'benefit_validated');
}

export async function pushMemberBenefitCancelled(
  memberUserId: string,
  benefitTitle: string,
  placeLabel: string,
): Promise<void> {
  const title = 'Validation annulée';
  const message = `La validation de « ${benefitTitle.trim()} » chez ${placeLabel.trim() || 'le partenaire'} a été annulée. Vous pouvez réutiliser le privilège.`;
  await pushMemberBenefitOutcome(memberUserId, title, message, 'benefit_cancelled');
}

async function pushMemberBenefitOutcome(
  memberUserId: string,
  title: string,
  message: string,
  type: string,
): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(memberUserId)) return;
  const supabase = getSupabaseAdmin();
  const push = await sendExpoPushToUserIds(supabase, [memberUserId], title, message, { type });
  if (push.reason) {
    console.warn('[benefit-notify] push', push.reason);
  }
}
