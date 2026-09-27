/** Aligné sur mobile/src/lib/benefit-notification-copy.ts */
export function resolveBenefitNotificationPlace(input: {
  contentTitle?: string | null;
  placeLabel?: string | null;
  partnerName?: string | null;
}): string {
  const content = input.contentTitle?.trim();
  if (content) return content;
  const place = input.placeLabel?.trim();
  if (place) return place;
  const partner = input.partnerName?.trim();
  if (partner) return partner;
  return "l'établissement";
}

export function copyBenefitValidatedMessage(place: string): string {
  return `Validation confirmée à ${place}.`;
}

export function copyBenefitCancelledMessage(place: string): string {
  return `La validation à ${place} a été annulée. Vous pouvez réutiliser votre privilège.`;
}
