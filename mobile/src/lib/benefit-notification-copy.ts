/** Libellé lieu pour notifs privilège : contenu lié (spot / event / outil) > partenaire. */
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

export function copyBenefitPendingMessage(place: string, timeoutMinutes: number): string {
  return `Présentez votre QR code à ${place} (${timeoutMinutes} min max).`;
}

/** Titre affiché côté partenaire (scan) : lieu lié, pas le nom catalogue seul. */
export function resolvePartnerPendingBenefitHeadline(input: {
  contentTitle?: string | null;
  establishmentTitle?: string | null;
  partnerName?: string | null;
  catalogTitle?: string | null;
}): string {
  const linked =
    input.contentTitle?.trim() ||
    input.establishmentTitle?.trim() ||
    input.partnerName?.trim();
  if (linked) return linked;
  return input.catalogTitle?.trim() || 'Demande de validation';
}

export function shouldShowCatalogSubtitle(
  headline: string,
  catalogTitle?: string | null,
): boolean {
  const cat = catalogTitle?.trim();
  if (!cat) return false;
  return cat.toLowerCase() !== headline.trim().toLowerCase();
}
