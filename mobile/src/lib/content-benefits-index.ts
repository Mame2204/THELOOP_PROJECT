import {
  listBenefitCatalog,
  peekBenefitCatalog,
  syncBenefitCatalogFromRemote,
  type BenefitCatalogItem,
  type BenefitOfferingPartner,
} from '@/lib/benefit-catalog-store';
import {
  peekRoleBenefitEntitlementsConfig,
  type RoleEntitlementKind,
} from '@/lib/role-benefit-entitlements-store';
import type { CountryCode } from '@/lib/countries';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';

export type ContentBenefitContentType = 'event' | 'spot' | 'tool';

const EVENT_CATALOG_PREFIX = 'catalog-event-';

/** IDs équivalents pour matcher un contenu (ex. evt catalogue partenaire vs UUID publié). */
export function resolveContentBenefitLookupIds(
  contentId: string,
  contentType?: ContentBenefitContentType,
): string[] {
  const id = contentId.trim();
  if (!id) return [];
  const ids = new Set<string>([id]);
  if (contentType === 'event') {
    if (id.startsWith(EVENT_CATALOG_PREFIX)) {
      ids.add(id.slice(EVENT_CATALOG_PREFIX.length));
    } else {
      ids.add(`${EVENT_CATALOG_PREFIX}${id}`);
    }
  }
  return [...ids];
}

/** True si le contenu est référencé par au moins un privilège catalogue actif (index local). */
export function contentHasLinkedActiveBenefit(
  ids: Set<string>,
  contentId: string,
  contentType?: ContentBenefitContentType,
): boolean {
  if (!contentId.trim() || ids.size === 0) return false;
  return resolveContentBenefitLookupIds(contentId, contentType).some((id) => ids.has(id));
}

export function offeringMatchesContentBenefit(
  offering: BenefitOfferingPartner,
  lookupIds: Set<string>,
  contentType?: ContentBenefitContentType,
): boolean {
  const linkedId = offering.contentId?.trim();
  if (!linkedId || !lookupIds.has(linkedId)) return false;
  if (!contentType) return true;
  const linkedType = offering.contentType ?? null;
  if (!linkedType) return true;
  return linkedType === contentType;
}

export function catalogItemMatchesContentBenefit(
  item: BenefitCatalogItem,
  lookupIds: Set<string>,
  contentType?: ContentBenefitContentType,
): boolean {
  if (!item.isActive) return false;
  return (item.offeringPartners ?? []).some((p) =>
    offeringMatchesContentBenefit(p, lookupIds, contentType),
  );
}

async function loadCatalogForContentLookup(refreshCatalog: boolean): Promise<BenefitCatalogItem[]> {
  if (refreshCatalog) {
    try {
      return await syncBenefitCatalogFromRemote();
    } catch {
      /* réseau indisponible : cache local */
    }
  }
  const cached = await peekBenefitCatalog();
  if (cached.length) return cached;
  return listBenefitCatalog(true);
}

/** IDs de contenus liés à au moins un avantage catalogue actif (cache local prioritaire). */
export async function listContentIdsWithBenefits(): Promise<Set<string>> {
  const catalog = await loadCatalogForContentLookup(false);
  const ids = new Set<string>();
  for (const item of catalog) {
    if (!item.isActive) continue;
    for (const p of item.offeringPartners ?? []) {
      const contentId = p.contentId?.trim();
      if (!contentId) continue;
      ids.add(contentId);
      if (p.contentType === 'event' || p.contentType === 'spot' || p.contentType === 'tool') {
        for (const alias of resolveContentBenefitLookupIds(contentId, p.contentType)) {
          ids.add(alias);
        }
      }
    }
  }
  return ids;
}

/** Avantages liés à un contenu (spot, événement ou outil). */
export async function listCatalogBenefitsForContent(
  contentId: string,
  contentType?: ContentBenefitContentType,
  options?: { refreshCatalog?: boolean },
): Promise<BenefitCatalogItem[]> {
  if (!contentId.trim()) return [];
  const catalog = await loadCatalogForContentLookup(options?.refreshCatalog === true);
  const lookupIds = new Set(resolveContentBenefitLookupIds(contentId, contentType));
  return catalog.filter((item) => catalogItemMatchesContentBenefit(item, lookupIds, contentType));
}

/** Rôles associés (config locale) — 1 catalogId → N rôles. */
export async function mapCatalogIdsToRoles(
  catalogIds: string[],
  countryCode: CountryCode = DEFAULT_COUNTRY_CODE,
): Promise<Map<string, RoleEntitlementKind[]>> {
  const config = await peekRoleBenefitEntitlementsConfig(countryCode);
  const map = new Map<string, RoleEntitlementKind[]>();
  const idSet = new Set(catalogIds);

  const push = (role: RoleEntitlementKind, entries: { catalogId: string }[]) => {
    for (const entry of entries) {
      if (!idSet.has(entry.catalogId)) continue;
      const prev = map.get(entry.catalogId) ?? [];
      if (!prev.includes(role)) map.set(entry.catalogId, [...prev, role]);
    }
  };

  push('member', config.member);
  push('prime', config.prime);
  push('partner', config.partner);
  push('admin', config.admin);

  return map;
}
