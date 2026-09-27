/** Contexte notif / push privilège : toujours le titre catalogue + lieu lié si distinct. */
export type BenefitNotificationContext = {
  privilegeTitle: string;
  contentTitle?: string | null;
  placeLabel?: string | null;
  partnerName?: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? '').trim();
}

function sameLabel(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Lieu « chez … » = spot / événement / outil (content_title), sinon partenaire si ≠ nom privilège. */
export function resolveBenefitLinkedPlace(input: BenefitNotificationContext): string | null {
  const privilege = norm(input.privilegeTitle) || 'Privilège';
  const content = norm(input.contentTitle);
  if (content && !sameLabel(content, privilege)) return content;
  if (content) return null;

  const place = norm(input.placeLabel);
  if (place && !sameLabel(place, privilege)) return place;

  const partner = norm(input.partnerName);
  if (partner && !sameLabel(partner, privilege)) return partner;

  return null;
}

export function normalizeBenefitNotificationLabels(input: BenefitNotificationContext): {
  privilege: string;
  place: string | null;
} {
  const privilege = norm(input.privilegeTitle) || 'Privilège';
  const place = resolveBenefitLinkedPlace(input);
  return { privilege, place };
}

export function copyBenefitValidatedMessage(input: BenefitNotificationContext): string {
  const { privilege, place } = normalizeBenefitNotificationLabels(input);
  if (place) {
    return `Votre privilège « ${privilege} » a été validé chez ${place}.`;
  }
  return `Votre privilège « ${privilege} » a été validé.`;
}

export function copyBenefitCancelledMessage(input: BenefitNotificationContext): string {
  const { privilege, place } = normalizeBenefitNotificationLabels(input);
  if (place) {
    return `La validation du privilège « ${privilege} » chez ${place} a été annulée. Vous pouvez réutiliser votre privilège.`;
  }
  return `La validation du privilège « ${privilege} » a été annulée. Vous pouvez réutiliser votre privilège.`;
}

export function copyBenefitPendingMessage(input: BenefitNotificationContext, timeoutMinutes: number): string {
  const { privilege, place } = normalizeBenefitNotificationLabels(input);
  if (place) {
    return `Présentez votre QR code chez ${place} pour le privilège « ${privilege} » (${timeoutMinutes} min max).`;
  }
  return `Présentez votre QR code pour le privilège « ${privilege} » (${timeoutMinutes} min max).`;
}

/** Écran partenaire (scan) : lieu en titre, privilège catalogue en sous-ligne. */
export function resolvePartnerPendingBenefitHeadline(input: {
  contentTitle?: string | null;
  establishmentTitle?: string | null;
  partnerName?: string | null;
  catalogTitle?: string | null;
}): string {
  const privilege = norm(input.catalogTitle) || 'Privilège';
  const linked =
    norm(input.contentTitle) || norm(input.establishmentTitle) || norm(input.partnerName);
  if (linked && !sameLabel(linked, privilege)) return linked;
  return privilege;
}

/** Afficher la ligne « Privilège : … » sous le lieu (plusieurs privilèges sur un même spot). */
export function shouldShowPrivilegeSubtitle(
  headline: string,
  catalogTitle?: string | null,
): boolean {
  const cat = norm(catalogTitle);
  if (!cat) return false;
  return !sameLabel(headline, cat);
}
