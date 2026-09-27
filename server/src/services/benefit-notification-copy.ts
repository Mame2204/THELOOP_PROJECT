/** Aligné sur mobile/src/lib/benefit-notification-copy.ts */

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

export function buildBenefitNotifyContext(
  privilegeTitle: string,
  contentTitle: string | null | undefined,
  partnerName: string | null | undefined,
): BenefitNotificationContext {
  return {
    privilegeTitle,
    contentTitle,
    partnerName,
  };
}
