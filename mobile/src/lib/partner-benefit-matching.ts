import { getBenefitCatalogItem, listBenefitCatalog } from '@/lib/benefit-catalog-store';
import {
  isPartnerOfferActive,
  isPartnerOfferingValidated,
  listPartnerBenefitOffers,
} from '@/lib/partner-benefit-offers-store';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  buildPartnerValidContentIdSet,
  isPartnerContentIdStillValid,
} from '@/lib/partner-content-visibility';
import {
  type PartnerIdentity,
  partnerIdentityMatchesRecord,
  partnerNameMatches,
  resolvePartnerIdentity,
} from '@/lib/partner-identity-store';
import { listAllPrimeBenefits, type PrimeBenefit } from '@/lib/prime-benefits-store';

export interface PartnerBenefitsGrantedStats {
  /** Nombre total d'avantages octroyés via ce partenaire (tous comptes, tous rôles). */
  totalGranted: number;
  /** Nombre de comptes distincts ayant reçu au moins un avantage de ce partenaire. */
  uniqueAccounts: number;
}

export interface PartnerActiveBenefitSummary {
  catalogId: string;
  title: string;
  description: string;
  source: 'offer' | 'catalog';
}

async function offeringMatchesPartner(
  catalogId: string,
  identity: PartnerIdentity,
  partner: { partnerId: string; displayName: string },
): Promise<boolean> {
  if (!partnerIdentityMatchesRecord(identity, partner.partnerId, partner.displayName)) {
    return false;
  }
  const item = await getBenefitCatalogItem(catalogId);
  // Catalogue actif = validé (partenaire ou THE LOOP)
  if (item?.isActive) return true;
  return isPartnerOfferingValidated(catalogId, partner.partnerId, partner.displayName);
}

export async function benefitMatchesPartnerIdentity(
  identity: PartnerIdentity,
  benefit: PrimeBenefit,
): Promise<boolean> {
  if (benefit.partnerName && partnerNameMatches(identity, benefit.partnerName)) {
    return true;
  }

  const catalog = await listBenefitCatalog(true);
  const item = catalog.find((c) => c.id === benefit.catalogId);
  if (!item?.offeringPartners?.length) return false;

  for (const p of item.offeringPartners) {
    if (await offeringMatchesPartner(item.id, identity, p)) return true;
  }
  return false;
}

/**
 * Liste unifiée des avantages actifs partenaire (même logique que l'écran Avantages offerts).
 * Offres acceptées + catalogue legacy, dédupliqués par catalogId.
 */
export async function listPartnerActiveBenefitSummaries(
  partnerId: string,
  partnerName: string,
  partnerPhone?: string | null,
  authUserIdHint?: string | null,
): Promise<PartnerActiveBenefitSummary[]> {
  const validContentIds = await buildPartnerValidContentIdSet(partnerId, partnerName);
  const offers = await listPartnerBenefitOffers(partnerId, partnerName, validContentIds, partnerPhone, authUserIdHint);

  const byCatalog = new Map<string, PartnerActiveBenefitSummary>();

  for (const offer of offers) {
    if (!isPartnerOfferActive(offer.status)) continue;
    if (byCatalog.has(offer.catalogId)) continue;
    byCatalog.set(offer.catalogId, {
      catalogId: offer.catalogId,
      title: offer.catalogTitle,
      description: offer.catalogDescription,
      source: 'offer',
    });
  }

  if (!isSupabaseConfigured()) {
    const catalogExtras = await listPartnerActiveCatalogBenefits(partnerId, partnerName, validContentIds);
    for (const item of catalogExtras) {
      if (byCatalog.has(item.catalogId)) continue;
      byCatalog.set(item.catalogId, {
        catalogId: item.catalogId,
        title: item.title,
        description: item.description,
        source: 'catalog',
      });
    }
  }

  return Array.from(byCatalog.values());
}

export async function countPartnerCatalogBenefits(
  partnerId: string,
  partnerName: string,
  partnerPhone?: string | null,
  authUserIdHint?: string | null,
): Promise<number> {
  const list = await listPartnerActiveBenefitSummaries(partnerId, partnerName, partnerPhone, authUserIdHint);
  return list.length;
}

/** Compte les avantages octroyés aux comptes de la plateforme via ce partenaire (VIP inclus). */
export async function countPartnerBenefitsGrantedToAccounts(
  partnerId: string,
  partnerName: string,
): Promise<PartnerBenefitsGrantedStats> {
  const identity = await resolvePartnerIdentity(partnerId, partnerName);
  const all = await listAllPrimeBenefits();
  const matched: PrimeBenefit[] = [];
  for (const benefit of all) {
    if (await benefitMatchesPartnerIdentity(identity, benefit)) {
      matched.push(benefit);
    }
  }
  return {
    totalGranted: matched.length,
    uniqueAccounts: new Set(matched.map((b) => b.userId)).size,
  };
}

export async function listPartnerActiveCatalogBenefits(
  partnerId: string,
  partnerName: string,
  validContentIds?: Set<string>,
): Promise<Array<{ catalogId: string; title: string; description: string }>> {
  if (isSupabaseConfigured()) {
    return [];
  }

  const identity = await resolvePartnerIdentity(partnerId, partnerName);
  const validIds = validContentIds ?? (await buildPartnerValidContentIdSet(partnerId, partnerName));
  const results: Array<{ catalogId: string; title: string; description: string }> = [];
  const seen = new Set<string>();

  const catalog = await listBenefitCatalog(true);
  for (const item of catalog) {
    if (!item.isActive || seen.has(item.id)) continue;
    for (const p of item.offeringPartners ?? []) {
      if (!isPartnerContentIdStillValid(p.contentId, validIds)) continue;
      if (!partnerIdentityMatchesRecord(identity, p.partnerId, p.displayName)) continue;
      seen.add(item.id);
      results.push({ catalogId: item.id, title: item.title, description: item.description });
      break;
    }
  }
  return results;
}

/** Compteurs par contenu (spot / outil / event) : avantages actifs + validations. */
export async function getPartnerContentBenefitCounters(
  partnerId: string,
  partnerName: string,
  partnerPhone?: string | null,
  authUserIdHint?: string | null,
): Promise<Map<string, { activeBenefits: number; pendingBenefits: number; validations: number }>> {
  const identity = await resolvePartnerIdentity(partnerId, partnerName);
  const validContentIds = await buildPartnerValidContentIdSet(partnerId, partnerName);
  const counters = new Map<string, { activeBenefits: number; pendingBenefits: number; validations: number }>();

  const bump = (
    contentId: string | null | undefined,
    field: 'activeBenefits' | 'pendingBenefits' | 'validations',
  ) => {
    if (!contentId || !isPartnerContentIdStillValid(contentId, validContentIds)) return;
    const prev = counters.get(contentId) ?? { activeBenefits: 0, pendingBenefits: 0, validations: 0 };
    prev[field] += 1;
    counters.set(contentId, prev);
  };

  const [offers, catalog, allBenefits] = await Promise.all([
    listPartnerBenefitOffers(partnerId, partnerName, validContentIds, partnerPhone, authUserIdHint),
    listBenefitCatalog(true),
    listAllPrimeBenefits(),
  ]);

  const countedActive = new Set<string>(); // `${catalogId}:${contentId}`
  const countedPending = new Set<string>();
  let partnerWideActive = 0;
  let partnerWidePending = 0;
  for (const offer of offers) {
    if (offer.status === 'pending') {
      if (!offer.contentId) {
        partnerWidePending += 1;
        continue;
      }
      const key = `${offer.catalogId}:${offer.contentId}`;
      if (countedPending.has(key)) continue;
      countedPending.add(key);
      bump(offer.contentId, 'pendingBenefits');
      continue;
    }
    if (!isPartnerOfferActive(offer.status)) continue;
    if (!offer.contentId) {
      partnerWideActive += 1;
      continue;
    }
    const key = `${offer.catalogId}:${offer.contentId}`;
    if (countedActive.has(key)) continue;
    countedActive.add(key);
    bump(offer.contentId, 'activeBenefits');
  }

  if ((partnerWideActive > 0 || partnerWidePending > 0) && validContentIds.size > 0) {
    for (const contentId of validContentIds) {
      const prev = counters.get(contentId) ?? { activeBenefits: 0, pendingBenefits: 0, validations: 0 };
      prev.activeBenefits += partnerWideActive;
      prev.pendingBenefits += partnerWidePending;
      counters.set(contentId, prev);
    }
  }

  for (const item of catalog) {
    if (!item.isActive) continue;
    for (const p of item.offeringPartners ?? []) {
      if (!p.contentId) continue;
      if (!(await offeringMatchesPartner(item.id, identity, p))) continue;
      const key = `${item.id}:${p.contentId}`;
      if (countedActive.has(key)) continue;
      countedActive.add(key);
      bump(p.contentId, 'activeBenefits');
    }
  }

  for (const benefit of allBenefits) {
    if (benefit.status !== 'used') continue;
    if (!(await benefitMatchesPartnerIdentity(identity, benefit))) continue;
    bump(benefit.contentId, 'validations');
  }

  try {
    const { countPartnerValidationsByContent } = await import('@/lib/benefit-redemption-store');
    const byContent = await countPartnerValidationsByContent(partnerId, partnerName);
    for (const [contentId, n] of byContent) {
      const prev = counters.get(contentId) ?? { activeBenefits: 0, pendingBenefits: 0, validations: 0 };
      prev.validations = Math.max(prev.validations, n);
      counters.set(contentId, prev);
    }
  } catch {
    /* ignore */
  }

  return counters;
}
