import {
  fetchAppSetting,
  loadCachedJson,
  saveCachedJson,
  upsertAppSetting,
} from '@/lib/remote-settings-sync';
import { countryCacheKey, countryRemoteKey, resolveCountryCode } from '@/lib/country-settings-keys';
import { DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';
import { PASS_LABELS, type PrimeBillingPeriod } from '@/lib/prime-plans';

export type PassCatalogStatus = 'active' | 'inactive' | 'archived';

export type PassShopBillingPeriod = PrimeBillingPeriod;

/** Validité catalogue alignée sur les formules boutique (mensuel / trimestriel / annuel / à vie). */
export const SHOP_PERIOD_VALIDITY_DAYS: Record<PassShopBillingPeriod, number | null> = {
  monthly: 30,
  quarterly: 90,
  annual: 365,
  lifetime: null,
};

export function shopPeriodLabel(period: PassShopBillingPeriod): string {
  return PASS_LABELS[period];
}

export function inferShopPeriodFromValidityDays(days: number | null | undefined): PassShopBillingPeriod | null {
  if (days == null) return 'lifetime';
  if (days === 30) return 'monthly';
  if (days === 90) return 'quarterly';
  if (days === 365) return 'annual';
  return null;
}

export interface PassCatalogEntry {
  id: string;
  label: string;
  description: string;
  /** 0 = gratuit (octroi admin). */
  priceGnf: number;
  /** null = sans expiration. */
  validityDays: number | null;
  grantableBySuperAdmin: boolean;
  /** Visible dans la vitrine = lié à une formule standard (mensuel…). Pas Heritage. */
  purchasableInShop: boolean;
  /** Formule boutique quand purchasableInShop. */
  shopBillingPeriod: PassShopBillingPeriod | null;
  status: PassCatalogStatus;
  isBuiltin: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

const CACHE_BASE = 'loop_pass_catalog_v1';
const REMOTE_BASE = 'pass_catalog_v1';
const LEGACY_REMOTE = 'pass_catalog_v1';
export const HERITAGE_CATALOG_ID = 'pass-heritage-builtin';
/** PASS catalogue pour gel admin Prime → membre (restauration du PASS d'origine). */
export const INTERMEDIATE_CATALOG_ID = 'pass-intermediaire-builtin';

function nowIso(): string {
  return new Date().toISOString();
}

function defaultCatalog(): PassCatalogEntry[] {
  const createdAt = nowIso();
  return [
    {
      id: HERITAGE_CATALOG_ID,
      label: 'PASS Heritage',
      description: 'Offert sans paiement, sans expiration. Révocable par super admin uniquement.',
      priceGnf: 0,
      validityDays: null,
      grantableBySuperAdmin: true,
      purchasableInShop: false,
      shopBillingPeriod: null,
      status: 'active',
      isBuiltin: true,
      sortOrder: 0,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: INTERMEDIATE_CATALOG_ID,
      label: 'PassIntermediaire',
      description:
        'Gel administratif : le membre conserve son PASS d\'origine (dates et avantages) en attente de réaffectation Prime.',
      priceGnf: 0,
      validityDays: null,
      grantableBySuperAdmin: true,
      purchasableInShop: false,
      shopBillingPeriod: null,
      status: 'active',
      isBuiltin: true,
      sortOrder: 1,
      createdAt,
      updatedAt: createdAt,
    },
  ];
}

function normalizeEntry(raw: PassCatalogEntry): PassCatalogEntry {
  const purchasableInShop = raw.id === HERITAGE_CATALOG_ID ? false : Boolean(raw.purchasableInShop);
  let shopBillingPeriod: PassShopBillingPeriod | null = purchasableInShop
    ? (raw.shopBillingPeriod ?? inferShopPeriodFromValidityDays(raw.validityDays))
    : null;
  if (shopBillingPeriod && !['monthly', 'quarterly', 'annual', 'lifetime'].includes(shopBillingPeriod)) {
    shopBillingPeriod = null;
  }
  return {
    ...raw,
    purchasableInShop: purchasableInShop && shopBillingPeriod != null,
    shopBillingPeriod: purchasableInShop ? shopBillingPeriod : null,
  };
}

function catalogKeys(countryCode?: CountryCode) {
  const cc = resolveCountryCode(countryCode);
  return {
    cc,
    cache: countryCacheKey(CACHE_BASE, cc),
    remote: countryRemoteKey(REMOTE_BASE, cc),
    isLegacyGn: cc === DEFAULT_COUNTRY_CODE,
  };
}

async function loadAll(countryCode: CountryCode = DEFAULT_COUNTRY_CODE): Promise<PassCatalogEntry[]> {
  const { cache, remote, isLegacyGn } = catalogKeys(countryCode);
  let remoteData = await fetchAppSetting<PassCatalogEntry[]>(remote);
  if (!remoteData?.length && isLegacyGn) {
    remoteData = await fetchAppSetting<PassCatalogEntry[]>(LEGACY_REMOTE);
    if (remoteData?.length) {
      await upsertAppSetting(remote, remoteData);
    }
  }
  if (remoteData !== null && remoteData.length) {
    const normalized = remoteData.map(normalizeEntry);
    await saveCachedJson(cache, normalized);
    return normalized;
  }
  const cached = await loadCachedJson<PassCatalogEntry[]>(cache);
  if (cached?.length) return cached.map(normalizeEntry);
  const defaults = defaultCatalog();
  await saveCachedJson(cache, defaults);
  return defaults;
}

async function saveAll(countryCode: CountryCode, entries: PassCatalogEntry[]): Promise<void> {
  const { cache, remote } = catalogKeys(countryCode);
  const sorted = [...entries].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  await saveCachedJson(cache, sorted);
  await upsertAppSetting(remote, sorted);
}

export function computePassCatalogExpiry(
  validityDays: number | null | undefined,
  from = new Date(),
): string | null {
  if (validityDays == null) return null;
  const d = new Date(from);
  d.setDate(d.getDate() + validityDays);
  return d.toISOString();
}

export function passCatalogValidityLabel(
  entry: Pick<PassCatalogEntry, 'validityDays' | 'shopBillingPeriod' | 'purchasableInShop'>,
): string {
  if (entry.purchasableInShop && entry.shopBillingPeriod) {
    return shopPeriodLabel(entry.shopBillingPeriod);
  }
  if (entry.validityDays == null) return 'Sans expiration';
  if (entry.validityDays === 30) return '30 jours';
  if (entry.validityDays === 90) return '90 jours';
  if (entry.validityDays === 365) return '1 an';
  return `${entry.validityDays} jours`;
}

export async function listPassCatalog(options?: {
  countryCode?: CountryCode;
  includeArchived?: boolean;
  status?: PassCatalogStatus | PassCatalogStatus[];
  grantableOnly?: boolean;
  shopOnly?: boolean;
}): Promise<PassCatalogEntry[]> {
  const cc = resolveCountryCode(options?.countryCode);
  let entries = await loadAll(cc);
  if (!options?.includeArchived) {
    entries = entries.filter((e) => e.status !== 'archived');
  }
  if (options?.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    entries = entries.filter((e) => statuses.includes(e.status));
  }
  if (options?.grantableOnly) {
    entries = entries.filter((e) => e.grantableBySuperAdmin);
  }
  if (options?.shopOnly) {
    entries = entries.filter((e) => e.purchasableInShop);
  }
  return entries;
}

export async function getPassCatalogEntry(
  id: string,
  countryCode: CountryCode = DEFAULT_COUNTRY_CODE,
): Promise<PassCatalogEntry | null> {
  const entries = await loadAll(resolveCountryCode(countryCode));
  return entries.find((e) => e.id === id) ?? null;
}

/** PASS intermédiaire (catalogue admin ou entrée créée « PassIntermediaire »). */
export async function resolveIntermediatePassCatalog(
  countryCode: CountryCode = DEFAULT_COUNTRY_CODE,
): Promise<PassCatalogEntry> {
  const cc = resolveCountryCode(countryCode);
  const builtin = await getPassCatalogEntry(INTERMEDIATE_CATALOG_ID, cc);
  if (builtin && builtin.status === 'active') return builtin;
  const entries = await loadAll(cc);
  const byLabel = entries.find(
    (e) => e.status === 'active' && /pass\s*interm[eé]diaire/i.test(e.label.trim()),
  );
  if (byLabel) return byLabel;
  if (builtin) return builtin;
  return defaultCatalog().find((e) => e.id === INTERMEDIATE_CATALOG_ID)!;
}

export function isIntermediateCatalogId(catalogId: string | null | undefined): boolean {
  if (!catalogId) return false;
  return catalogId === INTERMEDIATE_CATALOG_ID || catalogId.toLowerCase().includes('intermediaire');
}

function clearShopSlot(entries: PassCatalogEntry[], period: PassShopBillingPeriod, exceptId?: string): void {
  for (let i = 0; i < entries.length; i += 1) {
    if (entries[i].id === exceptId) continue;
    if (entries[i].shopBillingPeriod === period && entries[i].purchasableInShop) {
      entries[i] = {
        ...entries[i],
        purchasableInShop: false,
        shopBillingPeriod: null,
        updatedAt: nowIso(),
      };
    }
  }
}

export async function createPassCatalogEntry(
  countryCode: CountryCode,
  input: {
  label: string;
  description?: string;
  priceGnf?: number;
  validityDays?: number | null;
  grantableBySuperAdmin?: boolean;
  purchasableInShop?: boolean;
  shopBillingPeriod?: PassShopBillingPeriod | null;
  status?: PassCatalogStatus;
},
): Promise<PassCatalogEntry> {
  const cc = resolveCountryCode(countryCode);
  const entries = await loadAll(cc);
  const now = nowIso();
  const wantShop = input.purchasableInShop === true && input.shopBillingPeriod != null;
  const period = wantShop ? input.shopBillingPeriod! : null;
  if (period) clearShopSlot(entries, period);
  const entry: PassCatalogEntry = {
    id: `pass-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label: input.label.trim(),
    description: input.description?.trim() ?? '',
    priceGnf: input.priceGnf ?? 0,
    validityDays: period ? SHOP_PERIOD_VALIDITY_DAYS[period] : (input.validityDays ?? null),
    grantableBySuperAdmin: true,
    purchasableInShop: wantShop,
    shopBillingPeriod: period,
    status: input.status ?? 'active',
    isBuiltin: false,
    sortOrder: entries.length,
    createdAt: now,
    updatedAt: now,
  };
  entries.push(entry);
  await saveAll(cc, entries);
  return entry;
}

export async function updatePassCatalogEntry(
  countryCode: CountryCode,
  id: string,
  patch: Partial<
    Pick<
      PassCatalogEntry,
      | 'label'
      | 'description'
      | 'priceGnf'
      | 'validityDays'
      | 'grantableBySuperAdmin'
      | 'purchasableInShop'
      | 'shopBillingPeriod'
      | 'status'
      | 'sortOrder'
    >
  >,
): Promise<PassCatalogEntry | null> {
  if (id === HERITAGE_CATALOG_ID && patch.purchasableInShop === true) {
    return null;
  }
  const cc = resolveCountryCode(countryCode);
  const entries = await loadAll(cc);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const next = {
    ...entries[idx],
    ...patch,
    label: patch.label !== undefined ? patch.label.trim() : entries[idx].label,
    description: patch.description !== undefined ? patch.description.trim() : entries[idx].description,
    updatedAt: nowIso(),
  };
  const wantShop = next.purchasableInShop === true && next.shopBillingPeriod != null;
  if (wantShop && next.shopBillingPeriod) {
    clearShopSlot(entries, next.shopBillingPeriod, id);
    next.purchasableInShop = true;
    next.validityDays = SHOP_PERIOD_VALIDITY_DAYS[next.shopBillingPeriod];
  } else {
    next.purchasableInShop = false;
    next.shopBillingPeriod = null;
  }
  entries[idx] = next;
  await saveAll(cc, entries);
  return entries[idx];
}

export async function setPassCatalogStatus(
  countryCode: CountryCode,
  id: string,
  status: PassCatalogStatus,
): Promise<boolean> {
  const updated = await updatePassCatalogEntry(countryCode, id, { status });
  return updated != null;
}

export async function archivePassCatalogEntry(countryCode: CountryCode, id: string): Promise<boolean> {
  return setPassCatalogStatus(countryCode, id, 'archived');
}

export async function deletePassCatalogEntry(countryCode: CountryCode, id: string): Promise<boolean> {
  const cc = resolveCountryCode(countryCode);
  const entries = await loadAll(cc);
  const target = entries.find((e) => e.id === id);
  if (!target || target.isBuiltin) return false;
  await saveAll(cc, entries.filter((e) => e.id !== id));
  return true;
}
