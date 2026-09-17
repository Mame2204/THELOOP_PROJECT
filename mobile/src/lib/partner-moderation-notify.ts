import { appendUserNotification, notifyAdminUsers } from '@/lib/user-notifications-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export async function notifyPartnerModerationDecision(params: {
  partnerUserId: string;
  kind: 'event' | 'spot' | 'tool';
  title: string;
  approve: boolean;
  reason?: string | null;
}): Promise<void> {
  const kindLabel =
    params.kind === 'event' ? 'Événement' : params.kind === 'tool' ? 'Outil' : 'Spot';

  if (params.approve) {
    await appendUserNotification(params.partnerUserId, {
      title: `${kindLabel} validé`,
      message: `Votre soumission « ${params.title} » a été approuvée par THE LOOP et est maintenant visible dans l'application.`,
      audience: 'partner',
    });
    return;
  }

  const reasonLine = params.reason?.trim()
    ? `\n\nMotif : ${params.reason.trim()}`
    : '\n\nVous pouvez modifier et resoumettre votre contenu depuis Mon contenu.';

  await appendUserNotification(params.partnerUserId, {
    title: `${kindLabel} refusé`,
    message: `Votre soumission « ${params.title} » n'a pas été retenue.${reasonLine}`,
    audience: 'partner',
  });
}

export async function notifyAdminPendingSubmission(params: {
  kind: 'event' | 'spot' | 'tool';
  title: string;
  partnerName: string;
  countryCode?: string | null;
}): Promise<void> {
  const kindLabel =
    params.kind === 'event' ? 'événement' : params.kind === 'tool' ? 'outil' : 'spot';
  await notifyAdminUsers({
    title: 'Contenu à modérer',
    message: `${params.partnerName} a soumis un ${kindLabel} : « ${params.title} ». Consultez Modération.`,
    countryCode: params.countryCode ?? undefined,
  });
}

export async function notifyAdminWithdrawalRequest(params: {
  kind: 'event' | 'spot' | 'tool';
  title: string;
  partnerName: string;
  countryCode?: string | null;
}): Promise<void> {
  const kindLabel =
    params.kind === 'event' ? 'Événement' : params.kind === 'tool' ? 'Outil' : 'Spot';
  const title = 'Demande de retrait partenaire';
  const message = `${params.partnerName} demande le retrait de « ${params.title} » (${kindLabel}). Consultez Modération → Demandes de retrait.`;

  await notifyAdminUsers({ title, message, countryCode: params.countryCode ?? undefined });
}

export async function notifyPartnerWithdrawalDecision(params: {
  partnerUserId: string;
  kind: 'event' | 'spot' | 'tool';
  title: string;
  approved: boolean;
}): Promise<void> {
  const kindLabel =
    params.kind === 'event' ? 'Événement' : params.kind === 'tool' ? 'Outil' : 'Spot';

  if (params.approved) {
    await appendUserNotification(params.partnerUserId, {
      title: `${kindLabel} retiré`,
      message: `Votre demande de retrait pour « ${params.title} » a été acceptée. Le contenu n'est plus visible dans l'application.`,
      audience: 'partner',
    });
    return;
  }

  await appendUserNotification(params.partnerUserId, {
    title: 'Retrait refusé',
    message: `Votre demande de retrait pour « ${params.title} » a été refusée. Le contenu reste publié.`,
    audience: 'partner',
  });
}
