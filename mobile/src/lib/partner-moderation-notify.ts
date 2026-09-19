import {
  appendUserNotification,
  deliverPushToAdminUserIds,
  notifyAdminUsers,
} from '@/lib/user-notifications-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolvePartnerNotifyUserId(
  partnerUserId: string,
  partnerName?: string | null,
): Promise<string | null> {
  const raw = partnerUserId.trim();
  if (UUID_RE.test(raw)) return raw;

  const { resolvePartnerQueryUserId } = await import('@/lib/partner-catalog-ids');
  const fromQuery = await resolvePartnerQueryUserId(raw, partnerName ?? '');
  if (fromQuery && UUID_RE.test(fromQuery)) return fromQuery;

  const { resolvePartnerUserIdForSync } = await import('@/lib/partner-user-resolve');
  const fromSync = await resolvePartnerUserIdForSync(raw, partnerName ?? '');
  return fromSync && UUID_RE.test(fromSync) ? fromSync : null;
}

async function notifyPartnerUser(params: {
  partnerUserId: string;
  partnerName?: string | null;
  localId?: string | null;
  submissionKind?: 'event' | 'spot' | 'tool' | null;
  title: string;
  message: string;
}): Promise<void> {
  const title = params.title.trim();
  const message = params.message.trim();
  if (!title || !message) return;

  const resolvedPartnerId = await resolvePartnerNotifyUserId(
    params.partnerUserId,
    params.partnerName,
  );

  if (isSupabaseConfigured() && supabase) {
    const { data: partnerIds, error } = await supabase.rpc('notify_partner_user', {
      p_partner_user_id: resolvedPartnerId,
      p_title: title,
      p_message: message,
      p_audience: 'partner',
      p_local_id: params.localId?.trim() || null,
      p_submission_kind: params.submissionKind ?? null,
    });
    if (!error) {
      await deliverPushToAdminUserIds(partnerIds, title, message, 'partner');
      return;
    }
    if (!error.message.includes('Could not find the function')) {
      console.warn('[Modération] notify_partner_user:', error.message);
    }
  }

  if (!resolvedPartnerId) {
    console.warn('[Modération] partenaire introuvable pour notification');
    return;
  }

  await appendUserNotification(resolvedPartnerId, {
    title,
    message,
    audience: 'partner',
  });
}

async function notifyAdminsForPartnerSubmission(params: {
  kind: 'event' | 'spot' | 'tool';
  title: string;
  partnerName: string;
  countryCode?: string | null;
  localId?: string | null;
  notifTitle?: string;
  messageOverride?: string;
}): Promise<void> {
  const kindLabel =
    params.kind === 'event' ? 'événement' : params.kind === 'tool' ? 'outil' : 'spot';
  const title = params.notifTitle?.trim() || 'Contenu à modérer';
  const message =
    params.messageOverride?.trim()
    || `${params.partnerName} a soumis un ${kindLabel} : « ${params.title} ». Consultez Modération.`;
  const countryCode = params.countryCode?.trim().toUpperCase().slice(0, 2) || null;

  if (isSupabaseConfigured() && supabase) {
    const { data: adminIds, error } = await supabase.rpc('notify_admins_for_partner_submission', {
      p_kind: params.kind,
      p_title: params.title,
      p_partner_name: params.partnerName,
      p_country_code: countryCode,
      p_local_id: params.localId?.trim() || null,
      p_notif_title: title,
      p_message_override: params.messageOverride?.trim() || null,
    });
    if (!error) {
      await deliverPushToAdminUserIds(adminIds, title, message, 'admin');
      return;
    }
    if (!error.message.includes('Could not find the function')) {
      console.warn('[Modération] notify_admins_for_partner_submission:', error.message);
    }
  }

  await notifyAdminUsers({ title, message, countryCode: countryCode ?? undefined });
}

export async function notifyPartnerModerationDecision(params: {
  partnerUserId: string;
  partnerName?: string | null;
  localId?: string | null;
  kind: 'event' | 'spot' | 'tool';
  title: string;
  approve: boolean;
  reason?: string | null;
}): Promise<void> {
  const kindLabel =
    params.kind === 'event' ? 'Événement' : params.kind === 'tool' ? 'Outil' : 'Spot';

  if (params.approve) {
    await notifyPartnerUser({
      partnerUserId: params.partnerUserId,
      partnerName: params.partnerName,
      localId: params.localId,
      submissionKind: params.kind,
      title: `${kindLabel} validé`,
      message: `Votre soumission « ${params.title} » a été approuvée par THE LOOP et est maintenant visible dans l'application.`,
    });
    return;
  }

  const reasonLine = params.reason?.trim()
    ? `\n\nMotif : ${params.reason.trim()}`
    : '\n\nVous pouvez modifier et resoumettre votre contenu depuis Mon contenu.';

  await notifyPartnerUser({
    partnerUserId: params.partnerUserId,
    partnerName: params.partnerName,
    localId: params.localId,
    submissionKind: params.kind,
    title: `${kindLabel} refusé`,
    message: `Votre soumission « ${params.title} » n'a pas été retenue.${reasonLine}`,
  });
}

export async function notifyAdminPendingSubmission(params: {
  kind: 'event' | 'spot' | 'tool';
  title: string;
  partnerName: string;
  countryCode?: string | null;
  localId?: string | null;
}): Promise<void> {
  await notifyAdminsForPartnerSubmission(params);
}

export async function notifyAdminWithdrawalRequest(params: {
  kind: 'event' | 'spot' | 'tool';
  title: string;
  partnerName: string;
  countryCode?: string | null;
}): Promise<void> {
  const kindLabel =
    params.kind === 'event' ? 'Événement' : params.kind === 'tool' ? 'Outil' : 'Spot';
  await notifyAdminsForPartnerSubmission({
    kind: params.kind,
    title: params.title,
    partnerName: params.partnerName,
    countryCode: params.countryCode,
    notifTitle: 'Demande de retrait',
    messageOverride: `${params.partnerName} demande le retrait de « ${params.title} » (${kindLabel}). Consultez Modération → Demandes de retrait.`,
  });
}

export async function notifyPartnerWithdrawalDecision(params: {
  partnerUserId: string;
  partnerName?: string | null;
  localId?: string | null;
  kind: 'event' | 'spot' | 'tool';
  title: string;
  approved: boolean;
}): Promise<void> {
  const kindLabel =
    params.kind === 'event' ? 'Événement' : params.kind === 'tool' ? 'Outil' : 'Spot';

  if (params.approved) {
    await notifyPartnerUser({
      partnerUserId: params.partnerUserId,
      partnerName: params.partnerName,
      localId: params.localId,
      submissionKind: params.kind,
      title: `${kindLabel} retiré`,
      message: `Votre demande de retrait pour « ${params.title} » a été acceptée. Le contenu n'est plus visible dans l'application.`,
    });
    return;
  }

  await notifyPartnerUser({
    partnerUserId: params.partnerUserId,
    partnerName: params.partnerName,
    localId: params.localId,
    submissionKind: params.kind,
    title: 'Retrait refusé',
    message: `Votre demande de retrait pour « ${params.title} » a été refusée. Le contenu reste publié.`,
  });
}
