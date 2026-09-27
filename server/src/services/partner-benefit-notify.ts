import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import {
  copyBenefitCancelledMessage,
  copyBenefitValidatedMessage,
  resolveBenefitNotificationPlace,
} from './benefit-notification-copy.js';
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
function placeFrom(contentTitle: string | null | undefined, partnerName: string | null | undefined): string {
  return resolveBenefitNotificationPlace({
    contentTitle,
    partnerName,
  });
}

export async function notifyMemberBenefitValidated(
  memberUserId: string,
  _benefitTitle: string,
  placeLabel: string,
  contentTitle?: string | null,
): Promise<void> {
  const title = 'Privilège validé';
  const place = placeFrom(contentTitle, placeLabel);
  const message = copyBenefitValidatedMessage(place);
  await insertBenefitInbox(memberUserId, title, message);
  await pushMemberBenefitOutcome(memberUserId, title, message, 'benefit_validated');
}

/** Inbox + push OS après annulation validation privilège. */
export async function notifyMemberBenefitCancelled(
  memberUserId: string,
  _benefitTitle: string,
  placeLabel: string,
  contentTitle?: string | null,
): Promise<void> {
  const title = 'Validation annulée';
  const place = placeFrom(contentTitle, placeLabel);
  const message = copyBenefitCancelledMessage(place);
  await insertBenefitInbox(memberUserId, title, message);
  await pushMemberBenefitOutcome(memberUserId, title, message, 'benefit_cancelled');
}

/** Push OS uniquement (inbox déjà créée par RPC Supabase). */
export async function pushMemberBenefitValidated(
  memberUserId: string,
  _benefitTitle: string,
  placeLabel: string,
  contentTitle?: string | null,
): Promise<void> {
  const title = 'Privilège validé';
  const place = placeFrom(contentTitle, placeLabel);
  const message = copyBenefitValidatedMessage(place);
  await pushMemberBenefitOutcome(memberUserId, title, message, 'benefit_validated');
}

export async function pushMemberBenefitCancelled(
  memberUserId: string,
  _benefitTitle: string,
  placeLabel: string,
  contentTitle?: string | null,
): Promise<void> {
  const title = 'Validation annulée';
  const place = placeFrom(contentTitle, placeLabel);
  const message = copyBenefitCancelledMessage(place);
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
