import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  EXTERNAL_PARTNER_ID,
  listPartnerDirectory,
  partnerAccountDisplayName,
  partnerAccountUserId,
  type PartnerDirectoryEntry,
} from '@/lib/partner-directory-store';
import { normalizePartnerName } from '@/lib/partner-name-utils';
import { loadCachedJson, saveCachedJson } from '@/lib/remote-settings-sync';
import { resolvePartnerUserIdForSync } from '@/lib/partner-user-resolve';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { fetchSupabasePages } from '@/lib/supabase-list';
import { resolveContentBenefitLookupIds } from '@/lib/content-benefits-index';
import { peekContentSnapshot } from '@/lib/content-store';
import { isSpotLocation, isToolLocation } from '@/lib/location-kind-utils';
import { catalogForCountry } from '@/lib/staff-benefit-utils';
import type { CountryCode } from '@/lib/countries';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';

export type BenefitKind = 'quantity' | 'usage_limit' | 'unlimited';

export type BenefitPurpose =
  | 'standard'
  | 'welcome'
  | 'birthday'
  | 'member_of_month'
  | 'promo_code'
  | 'generic_fallback';

export interface BenefitOfferingPartner {
  partnerId: string;
  displayName: string;
  contentId?: string | null;
  contentType?: 'event' | 'spot' | 'tool' | null;
  contentTitle?: string | null;
}

export interface BenefitCatalogItem {
  id: string;
  title: string;
  description: string;
  offeringPartners: BenefitOfferingPartner[];
  defaultValidityDays: number;
  /**
   * Date limite absolue optionnelle (ISO).
   * Lors d'une affectation partenaire / octroi, la validité ne peut pas dépasser cette date.
   */
  validityEndsAt?: string | null;
  /**
   * Début du compte à rebours de validité :
   * - true = à la première consommation
   * - false = dès l'octroi
   */
  validityStartsOnActivation?: boolean;
  benefitKind: BenefitKind;
  quantityPerGrant: number | null;
  maxUsesPerGrant: number | null;
  isActive: boolean;
  /** Ciblage géographique optionnel */
  countryCode?: string | null;
  city?: string | null;
  benefitPurpose?: BenefitPurpose;
  createdAt: string;
  updatedAt: string;
  /** Sync Supabase en attente ou échouée — le merge local ne doit pas être écrasé. */
  pendingRemoteSync?: boolean;
  /** @deprecated Utiliser offeringPartners */
  partnerOptions?: string[];
}

export type BenefitCatalogUpdateResult = {
  item: BenefitCatalogItem;
  syncOk: boolean;
  syncError?: string;
};

/** admin = upsert complet ; partner = RPC is_active ; local = AsyncStorage uniquement */
export type BenefitCatalogSyncMode = 'admin' | 'partner' | 'local';

const KEY = 'loop_benefit_catalog_v2';
const LEGACY_KEY = 'loop_benefit_catalog_v1';

let catalogMemoryCache: BenefitCatalogItem[] | null = null;

export function invalidateBenefitCatalogCache(): void {
  catalogMemoryCache = null;
}

export const EXTERNAL_PARTNER_LABEL = 'Autre partenaire';

function partnerOptionsFromOffering(partners: BenefitOfferingPartner[]): string[] {
  const names = partners.map((p) => p.displayName).filter(Boolean);
  return names.length ? names : [EXTERNAL_PARTNER_LABEL];
}

type DbCatalogRow = {
  id: string;
  local_id: string | null;
  title: string;
  description: string;
  partner_name: string | null;
  default_validity_days: number;
  validity_ends_at: string | null;
  validity_starts_on_activation: boolean | null;
  is_active: boolean;
  offering_partners: BenefitOfferingPartner[] | null;
  benefit_kind: string | null;
  quantity_per_grant: number | null;
  max_uses_per_grant: number | null;
  country_code: string | null;
  city: string | null;
  benefit_purpose: string | null;
  created_at: string;
  updated_at: string;
};

/** Normalise une entrée offering_partners (camelCase ou snake_case JSON Supabase). */
export function parseOfferingPartner(raw: unknown): BenefitOfferingPartner {
  if (!raw || typeof raw !== 'object') {
    return { partnerId: EXTERNAL_PARTNER_ID, displayName: 'Partenaire' };
  }
  const o = raw as Record<string, unknown>;
  const partnerId = String(o.partnerId ?? o.partner_id ?? EXTERNAL_PARTNER_ID).trim() || EXTERNAL_PARTNER_ID;
  const displayName = String(o.displayName ?? o.display_name ?? 'Partenaire').trim() || 'Partenaire';
  const contentIdRaw = o.contentId ?? o.content_id;
  const contentTypeRaw = o.contentType ?? o.content_type;
  const contentTitleRaw = o.contentTitle ?? o.content_title;
  const contentId =
    contentIdRaw != null && String(contentIdRaw).trim() ? String(contentIdRaw).trim() : null;
  const contentType =
    contentTypeRaw === 'event' || contentTypeRaw === 'spot' || contentTypeRaw === 'tool'
      ? contentTypeRaw
      : null;
  const contentTitle =
    contentTitleRaw != null && String(contentTitleRaw).trim() ? String(contentTitleRaw).trim() : null;
  return { partnerId, displayName, contentId, contentType, contentTitle };
}

function rowToItem(row: DbCatalogRow): BenefitCatalogItem {
  const offeringPartners =
    Array.isArray(row.offering_partners) && row.offering_partners.length
      ? row.offering_partners.map(parseOfferingPartner)
      : row.partner_name
        ? [{ partnerId: EXTERNAL_PARTNER_ID, displayName: row.partner_name }]
        : [{ partnerId: EXTERNAL_PARTNER_ID, displayName: 'Partenaire' }];
  return normalizeItem({
    id: row.local_id ?? row.id,
    title: row.title,
    description: row.description,
    offeringPartners,
    defaultValidityDays: row.default_validity_days,
    validityEndsAt: row.validity_ends_at,
    validityStartsOnActivation: row.validity_starts_on_activation !== false,
    benefitKind: (row.benefit_kind as BenefitKind) ?? 'unlimited',
    quantityPerGrant: row.quantity_per_grant,
    maxUsesPerGrant: row.max_uses_per_grant,
    isActive: row.is_active,
    benefitPurpose: (row.benefit_purpose as BenefitPurpose) ?? 'standard',
    countryCode: row.country_code,
    city: row.city,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function itemToRow(item: BenefitCatalogItem) {
  const primaryPartner = item.offeringPartners[0]?.displayName ?? null;
  return {
    local_id: item.id,
    title: item.title,
    description: item.description,
    partner_name: primaryPartner,
    default_validity_days: item.defaultValidityDays,
    validity_ends_at: item.validityEndsAt ?? null,
    validity_starts_on_activation: item.validityStartsOnActivation !== false,
    is_active: item.isActive,
    offering_partners: item.offeringPartners,
    benefit_kind: item.benefitKind,
    quantity_per_grant: item.quantityPerGrant,
    max_uses_per_grant: item.maxUsesPerGrant,
    country_code: item.countryCode ?? null,
    city: item.city ?? null,
    benefit_purpose: item.benefitPurpose ?? 'standard',
    updated_at: item.updatedAt,
  };
}

async function fetchRemoteCatalog(): Promise<BenefitCatalogItem[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const client = supabase;
  const fullSelect =
    'id, local_id, title, description, partner_name, default_validity_days, validity_ends_at, validity_starts_on_activation, is_active, offering_partners, benefit_kind, quantity_per_grant, max_uses_per_grant, country_code, city, benefit_purpose, created_at, updated_at';
  const legacySelect =
    'id, local_id, title, description, partner_name, default_validity_days, is_active, offering_partners, benefit_kind, quantity_per_grant, max_uses_per_grant, country_code, city, benefit_purpose, created_at, updated_at';

  const page = await fetchSupabasePages<DbCatalogRow>(async (from, to) => {
    const { data, error } = await client
      .from('benefit_catalog')
      .select(fullSelect)
      .order('updated_at', { ascending: false })
      .range(from, to);
    return { data: data as DbCatalogRow[] | null, error };
  });

  if (page.error) {
    if (/validity_/i.test(page.error.message)) {
      const legacy = await fetchSupabasePages<DbCatalogRow>(async (from, to) => {
        const { data, error } = await client
          .from('benefit_catalog')
          .select(legacySelect)
          .order('updated_at', { ascending: false })
          .range(from, to);
        return { data: data as DbCatalogRow[] | null, error };
      });
      if (legacy.error) return null;
      return legacy.data.map((row) =>
        rowToItem({
          ...row,
          validity_ends_at: null,
          validity_starts_on_activation: true,
        }),
      );
    }
    return null;
  }
  return page.data.map(rowToItem);
}

async function partnerSetCatalogActiveRemote(
  localId: string,
  isActive: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: true };
  const { error } = await supabase.rpc('partner_set_benefit_catalog_active', {
    p_local_id: localId,
    p_is_active: isActive,
  });
  if (!error) return { ok: true };
  if (/does not exist|could not find|schema cache/i.test(error.message)) {
    return { ok: true };
  }
  return { ok: false, error: error.message };
}

async function canRemoteWriteBenefitCatalog(): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user?.id) return false;
  const { data } = await supabase
    .from('users')
    .select('user_role, is_active')
    .eq('id', authData.user.id)
    .maybeSingle();
  if (!data?.is_active) return false;
  const role = String(data.user_role ?? '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
}

async function syncCatalogItemRemote(
  item: BenefitCatalogItem,
  syncMode: BenefitCatalogSyncMode,
  patchKeys: string[],
): Promise<{ ok: boolean; error?: string }> {
  if (syncMode === 'local') return { ok: true };
  const isActiveOnly = patchKeys.length > 0 && patchKeys.every((k) => k === 'isActive');
  if (syncMode === 'partner' && isActiveOnly) {
    return partnerSetCatalogActiveRemote(item.id, item.isActive);
  }
  return upsertRemoteItem(item);
}

async function upsertRemoteItem(item: BenefitCatalogItem): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: true };
  if (!(await canRemoteWriteBenefitCatalog())) return { ok: true };
  const offeringPartners = await resolveOfferingPartnerUserIds(item.offeringPartners ?? []);
  const row = itemToRow({ ...item, offeringPartners });

  const { error: rpcError } = await supabase.rpc('admin_upsert_benefit_catalog', { p_row: row });
  if (!rpcError) return { ok: true };
  if (!/accès réservé|access denied|permission/i.test(rpcError.message)) {
    console.warn('[BenefitCatalog] RPC upsert:', rpcError.message);
  }

  const { error } = await supabase.from('benefit_catalog').upsert(row, { onConflict: 'local_id' });
  if (!error) return { ok: true };

  if (!/row-level security|permission|policy/i.test(error.message)) {
    console.warn('[BenefitCatalog] upsert:', error.message);
  }
  const { data: existing } = await supabase
    .from('benefit_catalog')
    .select('id')
    .eq('local_id', row.local_id)
    .maybeSingle();
  if (existing?.id) {
    const { error: updateError } = await supabase.from('benefit_catalog').update(row).eq('id', existing.id);
    if (updateError) {
      console.warn('[BenefitCatalog] update:', updateError.message);
      return { ok: false, error: updateError.message };
    }
    return { ok: true };
  }
  const { error: insertError } = await supabase.from('benefit_catalog').insert(row);
  if (insertError) {
    console.warn('[BenefitCatalog] insert:', insertError.message);
    return { ok: false, error: insertError.message };
  }
  return { ok: true };
}

async function deleteRemoteItem(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: true };

  const localId = normalizeCatalogLocalId(id);
  if (!localId) return { ok: false, error: 'invalid_id' };

  if (await canRemoteWriteBenefitCatalog()) {
    const { data: rpcOk, error: rpcError } = await supabase.rpc('admin_delete_benefit_catalog_by_local_id', {
      p_local_id: localId,
    });
    if (!rpcError && rpcOk === true) return { ok: true };
    if (rpcError && !/does not exist|could not find|schema cache/i.test(rpcError.message)) {
      console.warn('[BenefitCatalog] RPC delete:', rpcError.message);
    }
  }

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localId);

  const { error: byLocalError, count: byLocalCount } = await supabase
    .from('benefit_catalog')
    .delete({ count: 'exact' })
    .eq('local_id', localId);
  if (!byLocalError && (byLocalCount ?? 0) > 0) return { ok: true };

  if (isUuid) {
    const { error: byUuidError, count: byUuidCount } = await supabase
      .from('benefit_catalog')
      .delete({ count: 'exact' })
      .eq('id', localId);
    if (!byUuidError && (byUuidCount ?? 0) > 0) return { ok: true };
    if (byUuidError) {
      console.warn('[BenefitCatalog] delete by id:', byUuidError.message);
      return { ok: false, error: byUuidError.message };
    }
  }

  if (byLocalError) {
    console.warn('[BenefitCatalog] delete by local_id:', byLocalError.message);
    return { ok: false, error: byLocalError.message };
  }

  return { ok: false, error: 'not_found' };
}

function normalizeCatalogLocalId(id: string): string {
  let s = id.trim();
  while (s.startsWith('pending-')) {
    s = s.slice('pending-'.length);
  }
  return s;
}

/** Supprime côté Supabase même si l'item n'est pas dans le cache local. */
export async function forceDeleteBenefitCatalogRemote(id: string): Promise<boolean> {
  const res = await deleteRemoteItem(id);
  return res.ok;
}

function migrateLegacyItem(raw: Record<string, unknown>): BenefitCatalogItem {
  const now = new Date().toISOString();
  const partnerName = raw.partnerName ? String(raw.partnerName) : null;
  const offeringPartners: BenefitOfferingPartner[] = Array.isArray(raw.offeringPartners)
    ? raw.offeringPartners.map(parseOfferingPartner)
    : Array.isArray(raw.partnerOptions)
      ? (raw.partnerOptions as string[])
          .filter((n) => n !== EXTERNAL_PARTNER_LABEL)
          .map((name) => ({ partnerId: EXTERNAL_PARTNER_ID, displayName: name }))
      : partnerName
        ? [{ partnerId: EXTERNAL_PARTNER_ID, displayName: partnerName }]
        : [];

  return {
    id: String(raw.id),
    title: String(raw.title),
    description: String(raw.description),
    offeringPartners: offeringPartners.length ? offeringPartners : [{ partnerId: EXTERNAL_PARTNER_ID, displayName: 'Partenaire' }],
    defaultValidityDays: Number(raw.defaultValidityDays ?? 30),
    validityEndsAt: raw.validityEndsAt ? String(raw.validityEndsAt) : null,
    validityStartsOnActivation: raw.validityStartsOnActivation !== false,
    benefitKind: (raw.benefitKind as BenefitKind) ?? 'unlimited',
    quantityPerGrant: raw.quantityPerGrant != null ? Number(raw.quantityPerGrant) : null,
    maxUsesPerGrant: raw.maxUsesPerGrant != null ? Number(raw.maxUsesPerGrant) : null,
    isActive: raw.isActive !== false,
    benefitPurpose: (raw.benefitPurpose as BenefitPurpose) ?? 'standard',
    countryCode: (raw.countryCode as string) ?? null,
    city: (raw.city as string) ?? null,
    createdAt: String(raw.createdAt ?? now),
    updatedAt: String(raw.updatedAt ?? now),
  };
}

function normalizeOfferingPartners(partners: BenefitOfferingPartner[]): BenefitOfferingPartner[] {
  return partners.map((p) => {
    const name = p.displayName?.trim() || 'Partenaire';
    const partnerId = p.partnerId?.trim() || EXTERNAL_PARTNER_ID;
    if (partnerId === EXTERNAL_PARTNER_ID || !p.partnerId?.trim()) {
      if (name.toUpperCase() === 'THE LOOP' && !p.contentId) {
        return { ...p, partnerId: EXTERNAL_PARTNER_ID, displayName: 'THE LOOP' };
      }
      return { ...p, partnerId: EXTERNAL_PARTNER_ID, displayName: name };
    }
    if (name.toUpperCase() === 'THE LOOP' && !p.contentId && partnerId !== EXTERNAL_PARTNER_ID) {
      return { ...p, partnerId: EXTERNAL_PARTNER_ID, displayName: 'THE LOOP' };
    }
    if (partnerId.startsWith('user:')) {
      return { ...p, partnerId: partnerId.slice(5), displayName: name };
    }
    return { ...p, partnerId, displayName: name };
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Résout partnerId (établissement, staff, user:uuid) vers users.id pour Supabase / RPC. */
async function resolveOfferingPartnerUserIds(
  partners: BenefitOfferingPartner[],
): Promise<BenefitOfferingPartner[]> {
  const normalized = normalizeOfferingPartners(partners);
  const resolved: BenefitOfferingPartner[] = [];

  for (const partner of normalized) {
    if (partner.partnerId === EXTERNAL_PARTNER_ID) {
      resolved.push(partner);
      continue;
    }
    const userId = await resolvePartnerUserIdForSync(partner.partnerId, partner.displayName);
    if (userId && isUuid(userId)) {
      resolved.push({ ...partner, partnerId: userId });
      continue;
    }
    resolved.push(partner);
  }

  return resolved;
}

/** Répare les offering_partners en base (UUID établissement → users.id). Admin uniquement. */
export async function repairBenefitCatalogOfferingPartnerIds(): Promise<number> {
  if (!(await canRemoteWriteBenefitCatalog())) return 0;

  const items = await loadCatalog();
  let repaired = 0;

  for (const item of items) {
    const nextPartners = await resolveOfferingPartnerUserIds(item.offeringPartners ?? []);
    const changed = nextPartners.some(
      (p, idx) => p.partnerId !== (item.offeringPartners[idx]?.partnerId ?? ''),
    );
    if (!changed) continue;

    repaired += 1;
    const nextItem = normalizeItem({
      ...item,
      offeringPartners: nextPartners,
      updatedAt: new Date().toISOString(),
    });
    const all = await loadCatalog();
    const idx = all.findIndex((entry) => entry.id === item.id);
    if (idx >= 0) {
      all[idx] = nextItem;
      await persistLocalCatalog(all.map(normalizeItem));
    }
    await upsertRemoteItem(nextItem);
  }

  return repaired;
}

function normalizeItem(item: BenefitCatalogItem): BenefitCatalogItem {
  const offeringPartners = normalizeOfferingPartners(
    item.offeringPartners?.length
      ? item.offeringPartners
      : [{ partnerId: EXTERNAL_PARTNER_ID, displayName: 'Partenaire' }],
  );
  return {
    ...item,
    offeringPartners,
    partnerOptions: partnerOptionsFromOffering(offeringPartners),
    validityEndsAt: item.validityEndsAt?.trim() ? item.validityEndsAt : null,
    validityStartsOnActivation: item.validityStartsOnActivation !== false,
  };
}

/** Jours max autorisés jusqu'à validityEndsAt (null = pas de plafond absolu). */
export function maxValidityDaysUntilEnd(
  validityEndsAt: string | null | undefined,
  from: Date = new Date(),
): number | null {
  if (!validityEndsAt) return null;
  const end = new Date(validityEndsAt);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - from.getTime();
  if (ms <= 0) return 0;
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function clampValidityDaysToCatalogEnd(
  days: number,
  validityEndsAt: string | null | undefined,
  from: Date = new Date(),
): { days: number; capped: boolean } {
  const max = maxValidityDaysUntilEnd(validityEndsAt, from);
  if (max == null) return { days, capped: false };
  if (days > max) return { days: max, capped: true };
  return { days, capped: false };
}

async function readLocalCatalog(): Promise<BenefitCatalogItem[]> {
  const cached = await loadCachedJson<BenefitCatalogItem[]>(KEY);
  if (cached?.length) {
    return cached.map((item) => normalizeItem(migrateLegacyItem(item as unknown as Record<string, unknown>)));
  }
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as BenefitCatalogItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((item) => normalizeItem(migrateLegacyItem(item as unknown as Record<string, unknown>)));
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

async function persistLocalCatalog(items: BenefitCatalogItem[]): Promise<void> {
  const normalized = items.map(normalizeItem);
  await saveCachedJson(KEY, normalized);
  await AsyncStorage.setItem(KEY, JSON.stringify(normalized));
}

async function loadCatalog(): Promise<BenefitCatalogItem[]> {
  const local = await readLocalCatalog();
  if (local.length) {
    catalogMemoryCache = local;
    return local;
  }

  const remote = await fetchRemoteCatalog();

  if (remote !== null) {
    if (remote.length === 0) {
      const isAdmin = await canRemoteWriteBenefitCatalog();
      if (!isAdmin) {
        catalogMemoryCache = local;
        return local;
      }
      const pendingOnly = local.filter((item) => item.pendingRemoteSync);
      await persistLocalCatalog(pendingOnly);
      return pendingOnly;
    }

    const remoteIds = new Set(remote.map((r) => r.id));
    const byId = new Map<string, BenefitCatalogItem>();
    for (const item of local) byId.set(item.id, item);
    for (const r of remote) {
      const prev = byId.get(r.id);
      if (prev && (prev.pendingRemoteSync || prev.updatedAt >= r.updatedAt)) {
        byId.set(r.id, {
          ...prev,
          // Activation distante prioritaire (validation partenaire / octroi)
          isActive: r.isActive || prev.isActive,
          offeringPartners:
            isStandaloneTheLoopBenefit(prev) || isTheLoopLinkedBenefit(prev)
              ? prev.offeringPartners
              : prev.offeringPartners?.length
                ? prev.offeringPartners
                : r.offeringPartners,
        });
        continue;
      }
      byId.set(
        r.id,
        normalizeItem({
          ...r,
          validityEndsAt: r.validityEndsAt ?? prev?.validityEndsAt ?? null,
          validityStartsOnActivation:
            r.validityStartsOnActivation ?? prev?.validityStartsOnActivation ?? true,
          offeringPartners:
            prev && (isStandaloneTheLoopBenefit(prev) || isTheLoopLinkedBenefit(prev))
              ? prev.offeringPartners
              : r.offeringPartners?.length
                ? r.offeringPartners
                : prev?.offeringPartners ?? r.offeringPartners,
          ...(prev && prev.updatedAt === r.updatedAt
            ? {
                title: prev.title || r.title,
                description: prev.description || r.description,
              }
            : {}),
        }),
      );
    }
    // Uniquement les créations locales pas encore poussées — jamais réinjecter une suppression distante
    for (const item of local) {
      if (remoteIds.has(item.id)) continue;
      if (item.pendingRemoteSync) {
        byId.set(item.id, item);
      }
    }
    const merged = Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    await persistLocalCatalog(merged);
    catalogMemoryCache = merged;
    return merged;
  }

  if (local.length) {
    if (await canRemoteWriteBenefitCatalog()) {
      for (const item of local) await upsertRemoteItem(item);
    }
    catalogMemoryCache = local;
    return local;
  }

  try {
    const legacy = await AsyncStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Array<Record<string, unknown>>;
      const migrated = parsed.map(migrateLegacyItem).map(normalizeItem);
      await saveCatalog(migrated);
      return migrated;
    }
  } catch {
    /* ignore */
  }
  return [];
}

async function saveCatalog(items: BenefitCatalogItem[]): Promise<void> {
  const normalized = await Promise.all(
    items.map(async (item) =>
      normalizeItem({
        ...item,
        offeringPartners: await resolveOfferingPartnerUserIds(item.offeringPartners ?? []),
      }),
    ),
  );
  await persistLocalCatalog(normalized);
  if (!(await canRemoteWriteBenefitCatalog())) {
    void import('@/lib/home-partners-store').then((m) => m.invalidateHomePartnerLogosCache());
    return;
  }
  for (const item of normalized) {
    await upsertRemoteItem(item);
  }
  void import('@/lib/home-partners-store').then((m) => m.invalidateHomePartnerLogosCache());
  void import('@/lib/home-refresh').then((m) => m.emitHomeRefresh('benefit-catalog'));
}

export async function listBenefitCatalog(activeOnly = false): Promise<BenefitCatalogItem[]> {
  const items = await loadCatalog();
  catalogMemoryCache = items;
  return activeOnly ? items.filter((i) => i.isActive) : items;
}

/** Avantages créés côté Paramètres sans association partenaire Pro (offrant THE LOOP). */
export function isStandaloneTheLoopBenefit(item: BenefitCatalogItem): boolean {
  const partners = item.offeringPartners ?? [];
  if (partners.length === 0) return false;
  return partners.every(
    (p) =>
      p.partnerId === EXTERNAL_PARTNER_ID &&
      p.displayName.trim().toUpperCase() === 'THE LOOP' &&
      !p.contentId,
  );
}

export async function listStandaloneTheLoopBenefits(activeOnly = false): Promise<BenefitCatalogItem[]> {
  const items = await listBenefitCatalog(activeOnly);
  return filterStandaloneTheLoopBenefits(items, activeOnly);
}

export function filterStandaloneTheLoopBenefits(
  items: BenefitCatalogItem[],
  activeOnly = false,
): BenefitCatalogItem[] {
  const filtered = items.filter(isStandaloneTheLoopBenefit);
  return activeOnly ? filtered.filter((i) => i.isActive) : filtered;
}

/** Avantages catalogue liés à THE LOOP (standalone ou association équipe). */
export function isTheLoopLinkedBenefit(item: BenefitCatalogItem): boolean {
  return (item.offeringPartners ?? []).some((p) =>
    p.displayName.trim().toUpperCase().includes('THE LOOP'),
  );
}

export interface PublishedContentIndex {
  events: Set<string>;
  spots: Set<string>;
  tools: Set<string>;
}

function eventIsPublished(contentId: string, index: PublishedContentIndex): boolean {
  return resolveContentBenefitLookupIds(contentId, 'event').some((id) => index.events.has(id));
}

/** Offre liée à un event / spot / outil publié (snapshot contenu local). */
export function offeringMatchesPublishedContent(
  offering: BenefitOfferingPartner,
  index: PublishedContentIndex,
): boolean {
  const contentId = offering.contentId?.trim();
  if (!contentId) return false;
  const type = offering.contentType ?? null;
  if (type === 'event') return eventIsPublished(contentId, index);
  if (type === 'spot') return index.spots.has(contentId);
  if (type === 'tool') return index.tools.has(contentId);
  return (
    eventIsPublished(contentId, index)
    || index.spots.has(contentId)
    || index.tools.has(contentId)
  );
}

export async function loadPublishedContentIndexFromSnapshot(
  countryCode?: CountryCode,
): Promise<PublishedContentIndex> {
  const snapshot = await peekContentSnapshot();
  const cc = countryCode?.toUpperCase().slice(0, 2);
  const events = new Set<string>();
  const spots = new Set<string>();
  const tools = new Set<string>();

  for (const event of snapshot.events) {
    if (event.contentStatus && event.contentStatus !== 'published') continue;
    if (event.isActive === false) continue;
    if (cc && event.countryCode && event.countryCode.toUpperCase().slice(0, 2) !== cc) continue;
    for (const id of resolveContentBenefitLookupIds(event.id, 'event')) {
      events.add(id);
    }
  }

  for (const location of snapshot.locations) {
    if (location.contentStatus && location.contentStatus !== 'published') continue;
    if (location.isActive === false || location.hidden) continue;
    if (cc && location.countryCode && location.countryCode.toUpperCase().slice(0, 2) !== cc) continue;
    if (isToolLocation(location)) tools.add(location.id);
    else if (isSpotLocation(location)) spots.add(location.id);
  }

  return { events, spots, tools };
}

export function isTeamsAssignableBenefit(
  item: BenefitCatalogItem,
  index: PublishedContentIndex,
): boolean {
  if (!item.isActive || isStandaloneTheLoopBenefit(item)) return false;
  if (!isPartnerAssociatedBenefit(item)) return false;
  return (item.offeringPartners ?? []).some((o) => offeringMatchesPublishedContent(o, index));
}

/** Pack TEAMS — catalogue actif lié à un contenu publié (aligné admin-web). */
export async function listTeamsSelectableCatalogItems(
  countryCode: CountryCode = DEFAULT_COUNTRY_CODE,
): Promise<BenefitCatalogItem[]> {
  const [items, index] = await Promise.all([
    listBenefitCatalog(true),
    loadPublishedContentIndexFromSnapshot(countryCode),
  ]);
  return catalogForCountry(
    items.filter((item) => isTeamsAssignableBenefit(item, index)),
    countryCode,
  );
}

/** Modèles Paramètres sans lieu — exclus des listes « offerts » et du tirage partenaire. */
export function isPartnerAssociatedBenefit(item: BenefitCatalogItem): boolean {
  if (isStandaloneTheLoopBenefit(item)) return false;
  const partners = item.offeringPartners ?? [];
  if (!partners.length) return false;
  return partners.some((p) => {
    const name = p.displayName.trim();
    if (!name) return false;
    if (p.partnerId !== EXTERNAL_PARTNER_ID) return true;
    if (name.toUpperCase() === 'THE LOOP') {
      return Boolean(p.contentId?.trim());
    }
    // Legacy : partner_name / nom affiché sans UUID Supabase encore résolu
    return true;
  });
}

/**
 * KPI admin : catalogue actif + partenaire/lieu associé (hors modèles Paramètres seuls).
 * Un catalogue `is_active = true` implique déjà validation partenaire si requise.
 */
export function countAssociatedActiveCatalogBenefits(
  items: BenefitCatalogItem[],
  options?: { countryCode?: string; theLoopOnly?: boolean },
): number {
  return items.filter((item) => {
    if (!item.isActive) return false;
    if (isStandaloneTheLoopBenefit(item)) return false;
    if (!isPartnerAssociatedBenefit(item)) return false;
    if (options?.theLoopOnly && !isTheLoopLinkedBenefit(item)) return false;
    if (
      options?.countryCode
      && item.countryCode
      && item.countryCode.toUpperCase().slice(0, 2) !== options.countryCode.toUpperCase().slice(0, 2)
    ) {
      return false;
    }
    return true;
  }).length;
}

export async function countTheLoopLinkedBenefits(activeOnly = true): Promise<number> {
  const items = await listBenefitCatalog(activeOnly);
  if (!activeOnly) return items.filter(isTheLoopLinkedBenefit).length;
  return countAssociatedActiveCatalogBenefits(items, { theLoopOnly: true });
}

export async function countDashboardActiveCatalogBenefits(
  countryCode?: string,
  options?: { theLoopOnly?: boolean },
): Promise<number> {
  const items = await listBenefitCatalog(true);
  return countAssociatedActiveCatalogBenefits(items, { countryCode, theLoopOnly: options?.theLoopOnly });
}

/** Catalogue local immédiat (AsyncStorage / mémoire) — sans attente réseau. */
export async function peekBenefitCatalog(): Promise<BenefitCatalogItem[]> {
  if (catalogMemoryCache?.length) return catalogMemoryCache;
  const local = await readLocalCatalog();
  if (local.length) catalogMemoryCache = local;
  return local;
}

/** Fusionne le catalogue distant (priorité updated_at) — utile fiches détail après affectation admin. */
export async function syncBenefitCatalogFromRemote(): Promise<BenefitCatalogItem[]> {
  const remote = await fetchRemoteCatalog();
  if (remote === null) return peekBenefitCatalog();

  const local = await readLocalCatalog();
  const byId = new Map<string, BenefitCatalogItem>();
  for (const item of local) byId.set(item.id, item);

  for (const r of remote) {
    const prev = byId.get(r.id);
    if (!prev) {
      byId.set(r.id, normalizeItem(r));
      continue;
    }
    const remoteNewer = r.updatedAt >= prev.updatedAt;
    byId.set(
      r.id,
      normalizeItem({
        ...prev,
        ...r,
        title: remoteNewer ? r.title : prev.title || r.title,
        description: remoteNewer ? r.description : prev.description || r.description,
        isActive: r.isActive || prev.isActive,
        offeringPartners: remoteNewer
          ? r.offeringPartners?.length
            ? r.offeringPartners
            : prev.offeringPartners
          : prev.offeringPartners?.length
            ? prev.offeringPartners
            : r.offeringPartners,
        validityEndsAt: r.validityEndsAt ?? prev.validityEndsAt ?? null,
        validityStartsOnActivation:
          r.validityStartsOnActivation ?? prev.validityStartsOnActivation ?? true,
        pendingRemoteSync: remoteNewer ? false : prev.pendingRemoteSync,
      }),
    );
  }

  for (const item of local) {
    if (item.pendingRemoteSync && !remote.some((r) => r.id === item.id)) {
      byId.set(item.id, item);
    }
  }

  const merged = Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  catalogMemoryCache = merged;
  await persistLocalCatalog(merged);
  return merged;
}

export function filterTheLoopOfferedBenefits(
  items: BenefitCatalogItem[],
  countryCode?: string,
  activeOnly = false,
): BenefitCatalogItem[] {
  return items.filter((item) => {
    if (!isTheLoopLinkedBenefit(item)) return false;
    if (isStandaloneTheLoopBenefit(item)) return false;
    if (activeOnly && !item.isActive) return false;
    if (countryCode && item.countryCode && item.countryCode !== countryCode) return false;
    return true;
  });
}

/** Trouve l'offre partenaire d'un catalogue (clé + nom affiché). */
export function findCatalogOffering(
  item: BenefitCatalogItem,
  partnerKey: string,
  partnerDisplayName?: string | null,
): BenefitOfferingPartner | undefined {
  const label = partnerDisplayName?.trim();
  if (label) {
    const normLabel = normalizePartnerName(label);
    const byName = item.offeringPartners.find(
      (p) => normalizePartnerName(p.displayName) === normLabel,
    );
    if (byName) return byName;
    const byFuzzy = item.offeringPartners.find((p) => {
      const norm = normalizePartnerName(p.displayName);
      return norm.includes(normLabel) || normLabel.includes(norm);
    });
    if (byFuzzy) return byFuzzy;
  }
  const key = partnerKey?.trim() ?? '';
  if (key) {
    return item.offeringPartners.find(
      (p) =>
        p.partnerId === key ||
        normalizePartnerName(p.displayName) === normalizePartnerName(key),
    );
  }
  return undefined;
}

/**
 * Relie les partenaires « Autre » du catalogue aux comptes / établissements réels
 * sans confondre compte partenaire et spot lié.
 */
export async function syncCatalogPartnerDirectoryLinks(countryCode?: string): Promise<number> {
  const directory = await listPartnerDirectory(countryCode);
  const items = await loadCatalog();
  let updates = 0;

  const next = await Promise.all(
    items.map(async (item) => {
      let offeringPartners = [...item.offeringPartners];
      let itemChanged = false;

      offeringPartners = await Promise.all(
        offeringPartners.map(async (offering) => {
          // Ne jamais réécrire l'offrant standalone THE LOOP (Paramètres → Avantage)
          if (
            offering.partnerId === EXTERNAL_PARTNER_ID &&
            offering.displayName.trim().toUpperCase() === 'THE LOOP' &&
            !offering.contentId
          ) {
            return offering;
          }
          if (offering.partnerId !== EXTERNAL_PARTNER_ID && offering.contentId) return offering;

          const offerNorm = normalizePartnerName(offering.displayName);
          const nameMatches = (entry: PartnerDirectoryEntry) => {
            const entryNorm = normalizePartnerName(entry.name);
            return entryNorm === offerNorm || entryNorm.includes(offerNorm) || offerNorm.includes(entryNorm);
          };

          const accountMatch = directory.find((entry) => entry.source === 'partner_user' && nameMatches(entry));
          if (accountMatch) {
            itemChanged = true;
            return {
              ...offering,
              partnerId: partnerAccountUserId(accountMatch),
              displayName: partnerAccountDisplayName(accountMatch),
            };
          }

          const establishmentMatch = directory.find((entry) => entry.source === 'establishment' && nameMatches(entry));
          if (!establishmentMatch) return offering;

          itemChanged = true;
          const userId = await resolvePartnerUserIdForSync(establishmentMatch.id, establishmentMatch.name);
          return {
            ...offering,
            partnerId: userId ?? offering.partnerId,
            displayName: establishmentMatch.name,
            contentId: establishmentMatch.id,
            contentType: 'spot' as const,
            contentTitle: establishmentMatch.name,
          };
        }),
      );

      if (itemChanged) {
        updates += 1;
        return normalizeItem({ ...item, offeringPartners, updatedAt: new Date().toISOString() });
      }
      return item;
    }),
  );

  if (updates > 0) await saveCatalog(next);
  return updates;
}

export async function getBenefitCatalogItem(id: string): Promise<BenefitCatalogItem | null> {
  const local = (await peekBenefitCatalog()).find((i) => i.id === id);
  if (local) return local;
  const items = await loadCatalog();
  return items.find((i) => i.id === id) ?? null;
}

export async function createBenefitCatalogItem(input: {
  title: string;
  description: string;
  offeringPartner: BenefitOfferingPartner;
  defaultValidityDays?: number;
  validityEndsAt?: string | null;
  validityStartsOnActivation?: boolean;
  benefitKind?: BenefitKind;
  quantityPerGrant?: number | null;
  maxUsesPerGrant?: number | null;
}): Promise<BenefitCatalogItem> {
  const now = new Date().toISOString();
  const item: BenefitCatalogItem = normalizeItem({
    id: `cat-${Date.now()}`,
    title: input.title.trim(),
    description: input.description.trim(),
    offeringPartners: [input.offeringPartner],
    defaultValidityDays: input.defaultValidityDays ?? 30,
    validityEndsAt: input.validityEndsAt ?? null,
    validityStartsOnActivation: input.validityStartsOnActivation !== false,
    benefitKind: input.benefitKind ?? 'unlimited',
    quantityPerGrant: input.quantityPerGrant ?? null,
    maxUsesPerGrant: input.maxUsesPerGrant ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
  const items = await loadCatalog();
  items.unshift(item);
  await saveCatalog(items);
  return item;
}

export async function createBenefitCatalogItemMulti(input: {
  title: string;
  description: string;
  offeringPartners: BenefitOfferingPartner[];
  defaultValidityDays?: number;
  validityEndsAt?: string | null;
  validityStartsOnActivation?: boolean;
  benefitKind?: BenefitKind;
  quantityPerGrant?: number | null;
  maxUsesPerGrant?: number | null;
  countryCode?: string | null;
  city?: string | null;
  /** Défaut false : activé seulement après validation partenaire. */
  isActive?: boolean;
}): Promise<BenefitCatalogItem> {
  const now = new Date().toISOString();
  const partners = input.offeringPartners.filter((p) => p.displayName.trim());
  if (!partners.length) throw new Error('Au moins un partenaire requis');
  const rawDays = input.defaultValidityDays ?? 30;
  const clamped = clampValidityDaysToCatalogEnd(rawDays, input.validityEndsAt ?? null);
  let item: BenefitCatalogItem = normalizeItem({
    id: `cat-${Date.now()}`,
    title: input.title.trim(),
    description: input.description.trim(),
    offeringPartners: partners,
    defaultValidityDays: clamped.days,
    validityEndsAt: input.validityEndsAt ?? null,
    validityStartsOnActivation: input.validityStartsOnActivation !== false,
    benefitKind: input.benefitKind ?? 'unlimited',
    quantityPerGrant: input.quantityPerGrant ?? null,
    maxUsesPerGrant: input.maxUsesPerGrant ?? null,
    countryCode: input.countryCode ?? null,
    city: input.city ?? null,
    isActive: input.isActive ?? false,
    createdAt: now,
    updatedAt: now,
    pendingRemoteSync: true,
  });
  const items = await peekBenefitCatalog();
  const next = [item, ...items.filter((entry) => entry.id !== item.id)];
  await persistLocalCatalog(next);
  catalogMemoryCache = next;

  if (await canRemoteWriteBenefitCatalog()) {
    const remoteRes = await Promise.race([
      upsertRemoteItem(item),
      new Promise<{ ok: false; error: string }>((resolve) => {
        setTimeout(() => resolve({ ok: false, error: 'Sync catalogue — délai dépassé (20 s)' }), 20_000);
      }),
    ]);
    item = normalizeItem({
      ...item,
      pendingRemoteSync: !remoteRes.ok,
    });
    if (!remoteRes.ok && remoteRes.error) {
      console.warn('[BenefitCatalog] création association — sync distante:', remoteRes.error);
    }
    const synced = next.map((entry) => (entry.id === item.id ? item : entry));
    await persistLocalCatalog(synced);
    catalogMemoryCache = synced;
  }

  return item;
}

export async function findCatalogByTitle(title: string): Promise<BenefitCatalogItem | null> {
  const normalized = title.trim().toLowerCase();
  if (!normalized) return null;
  const items = await loadCatalog();
  return items.find((i) => i.title.trim().toLowerCase() === normalized) ?? null;
}

export async function removePartnerFromCatalogItem(
  id: string,
  partnerId: string,
  displayName?: string,
): Promise<BenefitCatalogItem | null> {
  const items = await loadCatalog();
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const nameNorm = displayName?.trim().toLowerCase();
  const offeringPartners = (items[idx].offeringPartners ?? []).filter((p) => {
    if (p.partnerId === partnerId) return false;
    if (nameNorm && p.displayName.trim().toLowerCase() === nameNorm) return false;
    return true;
  });
  if (offeringPartners.length === items[idx].offeringPartners.length) return items[idx];
  items[idx] = normalizeItem({
    ...items[idx],
    offeringPartners: offeringPartners.length
      ? offeringPartners
      : [{ partnerId: EXTERNAL_PARTNER_ID, displayName: 'Partenaire' }],
    updatedAt: new Date().toISOString(),
  });
  await saveCatalog(items);
  return items[idx];
}

/** Retire les références à un contenu supprimé du catalogue local (sans resync massif). */
export async function purgeBenefitCatalogLocalContentReferences(contentIds: string[]): Promise<number> {
  const targets = new Set(contentIds.filter(Boolean));
  if (!targets.size) return 0;

  const items = await readLocalCatalog();
  let changed = 0;
  const next = items.map((item) => {
    const filtered = (item.offeringPartners ?? []).filter((p) => !p.contentId || !targets.has(p.contentId));
    if (filtered.length === (item.offeringPartners ?? []).length) return item;
    changed += 1;
    return normalizeItem({
      ...item,
      offeringPartners: filtered.length ? filtered : item.offeringPartners,
      isActive: filtered.length > 0 ? item.isActive : false,
      updatedAt: new Date().toISOString(),
    });
  });
  if (changed > 0) await persistLocalCatalog(next);

  const uuids = contentIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (uuids.length && isSupabaseConfigured() && supabase) {
    const { error } = await supabase.rpc('admin_purge_benefit_catalog_content_refs', {
      p_content_ids: uuids,
    });
    if (error && !/does not exist|could not find|schema cache/i.test(error.message)) {
      console.warn('[BenefitCatalog] purge refs RPC:', error.message);
    }
  }

  return changed;
}

export async function addPartnerToCatalogItem(
  id: string,
  partner: BenefitOfferingPartner,
): Promise<BenefitCatalogItem | null> {
  const items = await loadCatalog();
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const existing = items[idx].offeringPartners ?? [];
  if (existing.some((p) => p.partnerId === partner.partnerId && p.displayName === partner.displayName)) {
    return items[idx];
  }
  items[idx] = normalizeItem({
    ...items[idx],
    offeringPartners: [...existing, partner],
    updatedAt: new Date().toISOString(),
  });
  await saveCatalog(items);
  return items[idx];
}

export async function updateBenefitCatalogItem(
  id: string,
  patch: Partial<
    Pick<
      BenefitCatalogItem,
      | 'title'
      | 'description'
      | 'offeringPartners'
      | 'defaultValidityDays'
      | 'validityEndsAt'
      | 'validityStartsOnActivation'
      | 'benefitKind'
      | 'quantityPerGrant'
      | 'maxUsesPerGrant'
      | 'isActive'
      | 'benefitPurpose'
    >
  >,
  options?: { syncMode?: BenefitCatalogSyncMode },
): Promise<BenefitCatalogUpdateResult | null> {
  const syncMode = options?.syncMode ?? 'admin';
  const patchKeys = Object.keys(patch);
  let items = await readLocalCatalog();
  let idx = items.findIndex((i) => i.id === id);
  if (idx < 0) {
    items = await loadCatalog();
    idx = items.findIndex((i) => i.id === id);
  }
  // Fallback : id remote UUID vs local_id cat-…
  if (idx < 0) {
    const remote = await fetchRemoteCatalog();
    const match = remote?.find((r) => r.id === id);
    if (match) {
      items = await readLocalCatalog();
      const existingIdx = items.findIndex((i) => i.id === match.id);
      if (existingIdx >= 0) {
        idx = existingIdx;
      } else {
        items.unshift(match);
        idx = 0;
      }
    }
  }
  if (idx < 0) return null;

  const base = items[idx];
  const merged = {
    ...base,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (patch.defaultValidityDays != null || patch.validityEndsAt !== undefined) {
    const clamped = clampValidityDaysToCatalogEnd(
      merged.defaultValidityDays,
      merged.validityEndsAt,
    );
    merged.defaultValidityDays = Math.max(1, clamped.days || merged.defaultValidityDays || 30);
  }
  // Standalone THE LOOP : ne jamais perdre l'offrant
  if (isStandaloneTheLoopBenefit(base) || isTheLoopLinkedBenefit(base)) {
    if (!patch.offeringPartners?.length) {
      merged.offeringPartners = base.offeringPartners;
    }
  }
  const normalized = normalizeItem({ ...merged, pendingRemoteSync: syncMode !== 'local' });
  items[idx] = normalized;
  await persistLocalCatalog(items);
  const remoteRes = await syncCatalogItemRemote(normalized, syncMode, patchKeys);
  const syncedItem = normalizeItem({
    ...normalized,
    pendingRemoteSync: syncMode !== 'local' && !remoteRes.ok,
  });
  const after = await readLocalCatalog();
  const afterIdx = after.findIndex((i) => i.id === syncedItem.id);
  if (afterIdx >= 0) {
    after[afterIdx] = syncedItem;
    await persistLocalCatalog(after);
  } else {
    after.unshift(syncedItem);
    await persistLocalCatalog(after);
  }
  if (!remoteRes.ok && syncMode === 'admin') {
    console.warn('[BenefitCatalog] sync distant échouée, version locale conservée:', remoteRes.error);
  }
  return {
    item: syncedItem,
    syncOk: remoteRes.ok,
    syncError: remoteRes.error,
  };
}

export async function deleteBenefitCatalogItem(id: string): Promise<boolean> {
  const normalizedId = normalizeCatalogLocalId(id);
  const items = await loadCatalog();
  const next = items.filter((i) => i.id !== id && i.id !== normalizedId);
  const remote = await deleteRemoteItem(id);
  if (next.length !== items.length) {
    await persistLocalCatalog(next);
  }
  return remote.ok || next.length !== items.length;
}

export const BENEFIT_KIND_LABELS: Record<BenefitKind, string> = {
  quantity: 'Quantité (ex. 2 entrées)',
  usage_limit: 'Utilisations limitées (ex. -20%)',
  unlimited: 'Sans limite de quantité',
};

export const BENEFIT_PURPOSE_LABELS: Record<BenefitPurpose, string> = {
  standard: 'Standard',
  welcome: 'Bienvenue',
  birthday: 'Anniversaire',
  member_of_month: 'Membre du mois',
  promo_code: 'Code promo',
  generic_fallback: 'Fallback générique',
};
