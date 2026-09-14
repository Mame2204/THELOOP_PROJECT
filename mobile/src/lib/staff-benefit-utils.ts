import type { BenefitCatalogItem } from '@/lib/benefit-catalog-store';
import type { PrimeBenefit } from '@/lib/prime-benefits-store';
import type { CountryCode } from '@/lib/countries';

function isCatalogOfferStillValid(item: BenefitCatalogItem | undefined, benefit: PrimeBenefit): boolean {
  if (!item) return true;
  if (!item.isActive && (benefit.status === 'active' || benefit.status === 'pending_validation')) {
    return false;
  }
  if (item.validityEndsAt && (benefit.status === 'active' || benefit.status === 'pending_validation')) {
    const end = new Date(item.validityEndsAt);
    if (!Number.isNaN(end.getTime()) && end.getTime() < Date.now()) return false;
  }
  return true;
}

/** Avantages actifs dont le partenaire / catalogue correspond au pays (ou sans pays ciblé). */
export function catalogForCountry(items: BenefitCatalogItem[], countryCode: CountryCode): BenefitCatalogItem[] {
  return items.filter((item) => !item.countryCode || item.countryCode === countryCode);
}

export function benefitMatchesViewCountry(
  benefit: PrimeBenefit,
  catalogById: Map<string, BenefitCatalogItem>,
  countryCode: CountryCode,
): boolean {
  const item = catalogById.get(benefit.catalogId);
  if (!isCatalogOfferStillValid(item, benefit)) return false;

  if (item?.countryCode) return item.countryCode === countryCode;
  if (benefit.grantCountryCode) return benefit.grantCountryCode === countryCode;
  return true;
}

export function filterBenefitsForCountry(
  benefits: PrimeBenefit[],
  catalogById: Map<string, BenefitCatalogItem>,
  countryCode: CountryCode,
): PrimeBenefit[] {
  return benefits.filter((b) => benefitMatchesViewCountry(b, catalogById, countryCode));
}
