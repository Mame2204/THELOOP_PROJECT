import { appendUserNotification } from '@/lib/user-notifications-store';

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
