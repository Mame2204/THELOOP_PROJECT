import { countPartnerValidationMetrics } from '@/lib/benefit-redemption-store';

export interface PartnerMonthlyReport {
  monthLabel: string;
  attractedPeople: number;
  validations: number;
  periodStart: string;
  headline: string;
  subline: string;
}

export function startOfCurrentMonth(at = new Date()): Date {
  const d = new Date(at);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getCurrentMonthLabel(at = new Date(), locale = 'fr-FR'): string {
  return at.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export async function buildPartnerMonthlyAttractionReport(input: {
  partnerKey: string;
  partnerName: string;
  establishmentLabel?: string;
}): Promise<PartnerMonthlyReport> {
  const since = startOfCurrentMonth();
  const { validations, uniqueMembers } = await countPartnerValidationMetrics(
    input.partnerKey,
    input.partnerName,
    since,
  );
  const attractedPeople = Math.max(uniqueMembers, validations > 0 ? uniqueMembers : 0);
  const monthLabel = getCurrentMonthLabel();
  const place = input.establishmentLabel ?? input.partnerName;

  const headline =
    attractedPeople > 0
      ? `Ce mois-ci, THE LOOP a attiré ${attractedPeople} personne${attractedPeople > 1 ? 's' : ''} dans ton établissement.`
      : `Ce mois-ci, commencez à valider les avantages pour voir combien de personnes THE LOOP attire chez ${place}.`;

  const subline =
    validations > 0
      ? `${validations} validation${validations > 1 ? 's' : ''} enregistrée${validations > 1 ? 's' : ''} en ${monthLabel}.`
      : `Aucune validation en ${monthLabel} pour l'instant.`;

  return {
    monthLabel,
    attractedPeople,
    validations,
    periodStart: since.toISOString(),
    headline,
    subline,
  };
}
