import AsyncStorage from '@react-native-async-storage/async-storage';
import { listBenefitCatalog, type BenefitCatalogItem } from '@/lib/benefit-catalog-store';
import { pickNewestByTimestamp } from '@/lib/remote-settings-sync';
import {
  isAdminAccount,
  isSuperAdminAccount,
} from '@/lib/role-benefit-eligibility';
import type { RoleBenefitEntitlementEntry } from '@/lib/role-benefit-entitlements-store';
import { getStaffTeamPackForCountry } from '@/lib/staff-team-pack-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { asJson } from '@/lib/supabase-types';
import type { User } from '@/types';
import type { CountryCode } from '@/lib/countries';

export interface StaffBenefitOverrides {
  userId: string;
  /** Retirés pour cet admin même s'ils sont dans la config équipe. */
  revokedCatalogIds: string[];
  /** Ajoutés pour cet admin uniquement (hors config équipe). */
  extra: RoleBenefitEntitlementEntry[];
  /** Super admin : avantages activés dans le profil (tout le catalogue éligible). */
  enabledCatalogIds: string[];
  updatedAt: string;
  updatedBy?: string | null;
}

const KEY = 'loop_staff_benefit_overrides_v1';

function now() {
  return new Date().toISOString();
}

async function fetchRemoteOverride(userId: string): Promise<StaffBenefitOverrides | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from('staff_benefit_overrides')
    .select('user_id, revoked_catalog_ids, extra, enabled_catalog_ids, updated_at, updated_by')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeOverrides(
    {
      userId: String(data.user_id),
      revokedCatalogIds: data.revoked_catalog_ids as string[],
      extra: data.extra as unknown as RoleBenefitEntitlementEntry[],
      enabledCatalogIds: data.enabled_catalog_ids as string[],
      updatedAt: String(data.updated_at),
      updatedBy: data.updated_by ? String(data.updated_by) : null,
    },
    userId,
  );
}

async function pushRemoteOverride(overrides: StaffBenefitOverrides): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const { error } = await supabase.from('staff_benefit_overrides').upsert({
    user_id: overrides.userId,
    revoked_catalog_ids: overrides.revokedCatalogIds,
    extra: asJson(overrides.extra),
    enabled_catalog_ids: overrides.enabledCatalogIds,
    updated_at: overrides.updatedAt,
    updated_by: overrides.updatedBy ?? null,
  });
  if (error) console.warn('[StaffOverrides] push:', error.message);
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeOverrides(raw: Partial<StaffBenefitOverrides> | null | undefined, userId: string): StaffBenefitOverrides {
  return {
    userId,
    revokedCatalogIds: asStringArray(raw?.revokedCatalogIds),
    extra: Array.isArray(raw?.extra) ? raw!.extra : [],
    enabledCatalogIds: asStringArray(raw?.enabledCatalogIds),
    updatedAt: raw?.updatedAt ?? new Date(0).toISOString(),
    updatedBy: raw?.updatedBy ?? null,
  };
}

async function loadAllMap(): Promise<Record<string, StaffBenefitOverrides>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, StaffBenefitOverrides>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveAllMap(map: Record<string, StaffBenefitOverrides>): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

async function getLocalStaffBenefitOverrides(userId: string): Promise<StaffBenefitOverrides> {
  const map = await loadAllMap();
  return normalizeOverrides(map[userId], userId);
}

export async function getStaffBenefitOverrides(userId: string): Promise<StaffBenefitOverrides> {
  const remote = await fetchRemoteOverride(userId);
  // Relire après le fetch : un toggle TEAMS a pu écrire pendant l’aller-retour.
  const map = await loadAllMap();
  const local = normalizeOverrides(map[userId], userId);
  const merged = pickNewestByTimestamp(local, remote);
  if (remote && merged === remote) {
    map[userId] = merged;
    await saveAllMap(map);
  }
  return merged;
}

export async function saveStaffBenefitOverrides(
  overrides: StaffBenefitOverrides,
  updatedBy?: string | null,
): Promise<StaffBenefitOverrides> {
  const map = await loadAllMap();
  const next: StaffBenefitOverrides = {
    ...normalizeOverrides(overrides, overrides.userId),
    updatedAt: now(),
    updatedBy: updatedBy ?? overrides.updatedBy ?? null,
  };
  map[overrides.userId] = next;
  await saveAllMap(map);
  await pushRemoteOverride(next);
  return next;
}

export function catalogEntryFromItem(item: BenefitCatalogItem): RoleBenefitEntitlementEntry {
  const offering = item.offeringPartners[0];
  return {
    catalogId: item.id,
    partnerId: offering?.partnerId,
    partnerDisplayName: offering?.displayName,
  };
}

/** Résolution pure — exportée pour les tests. */
export function resolveStaffAdminEntitlementEntriesPure(
  user: Pick<User, 'id' | 'userRole' | 'role'>,
  teamAdminEntries: RoleBenefitEntitlementEntry[],
  overrides: StaffBenefitOverrides,
  catalog: BenefitCatalogItem[],
): RoleBenefitEntitlementEntry[] {
  if (!isAdminAccount(user)) return [];

  if (isSuperAdminAccount(user)) {
    const catalogMap = new Map(catalog.filter((c) => c.isActive).map((c) => [c.id, c]));
    return overrides.enabledCatalogIds
      .map((id) => {
        const item = catalogMap.get(id);
        return item ? catalogEntryFromItem(item) : null;
      })
      .filter((entry): entry is RoleBenefitEntitlementEntry => entry != null);
  }

  const revoked = new Set(overrides.revokedCatalogIds);
  const byId = new Map<string, RoleBenefitEntitlementEntry>();

  for (const entry of teamAdminEntries) {
    if (!revoked.has(entry.catalogId)) byId.set(entry.catalogId, entry);
  }
  for (const entry of overrides.extra) {
    byId.set(entry.catalogId, entry);
  }

  return Array.from(byId.values());
}

export function isBenefitEffectiveForAdmin(
  overrides: StaffBenefitOverrides,
  catalogId: string,
  teamCatalogIds: Set<string>,
): boolean {
  if (overrides.revokedCatalogIds.includes(catalogId)) return false;
  if (overrides.extra.some((e) => e.catalogId === catalogId)) return true;
  return teamCatalogIds.has(catalogId);
}

export async function setAdminStaffBenefitEnabled(
  userId: string,
  catalogId: string,
  enabled: boolean,
  teamCatalogIds: Set<string>,
  catalogItem: BenefitCatalogItem | undefined,
  updatedBy?: string | null,
): Promise<StaffBenefitOverrides> {
  const current = await getStaffBenefitOverrides(userId);
  const inTeam = teamCatalogIds.has(catalogId);
  let revoked = [...current.revokedCatalogIds];
  let extra = [...current.extra];

  if (enabled) {
    revoked = revoked.filter((id) => id !== catalogId);
    if (!inTeam && catalogItem) {
      if (!extra.some((e) => e.catalogId === catalogId)) {
        extra.push(catalogEntryFromItem(catalogItem));
      }
    }
  } else if (inTeam) {
    if (!revoked.includes(catalogId)) revoked.push(catalogId);
    extra = extra.filter((e) => e.catalogId !== catalogId);
  } else {
    extra = extra.filter((e) => e.catalogId !== catalogId);
  }

  return saveStaffBenefitOverrides({ ...current, revokedCatalogIds: revoked, extra }, updatedBy);
}

export async function resolveStaffAdminEntitlementEntries(
  user: Pick<User, 'id' | 'userRole' | 'role' | 'countryCode'>,
): Promise<RoleBenefitEntitlementEntry[]> {
  const userCountry = (user.countryCode ?? 'GN').toUpperCase().slice(0, 2) as CountryCode;
  const [overrides, catalog, teamEntries] = await Promise.all([
    getStaffBenefitOverrides(user.id),
    listBenefitCatalog(true),
    getStaffTeamPackForCountry(userCountry),
  ]);
  return resolveStaffAdminEntitlementEntriesPure(user, teamEntries, overrides, catalog);
}

export function isTeamBenefitEnabledForUser(
  overrides: StaffBenefitOverrides,
  catalogId: string,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return overrides.enabledCatalogIds.includes(catalogId);
  return !overrides.revokedCatalogIds.includes(catalogId);
}

/** Précharge les overrides distants pour une liste d’admins (onglet TEAMS « Par admin »). */
export async function prefetchStaffBenefitOverridesForUsers(userIds: string[]): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !userIds.length) return;
  const map = await loadAllMap();
  let changed = false;
  await Promise.all(
    userIds.map(async (userId) => {
      const remote = await fetchRemoteOverride(userId);
      if (!remote) return;
      const local = normalizeOverrides(map[userId], userId);
      const merged = pickNewestByTimestamp(local, remote);
      if (JSON.stringify(merged) !== JSON.stringify(map[userId] ?? null)) {
        map[userId] = merged;
        changed = true;
      }
    }),
  );
  if (changed) await saveAllMap(map);
}

export async function setTeamBenefitEnabledForUser(
  userId: string,
  catalogId: string,
  enabled: boolean,
  isSuperAdmin: boolean,
  updatedBy?: string | null,
): Promise<StaffBenefitOverrides> {
  const current = await getStaffBenefitOverrides(userId);

  if (isSuperAdmin) {
    const enabledSet = new Set(current.enabledCatalogIds);
    if (enabled) enabledSet.add(catalogId);
    else enabledSet.delete(catalogId);
    return saveStaffBenefitOverrides(
      { ...current, enabledCatalogIds: Array.from(enabledSet) },
      updatedBy,
    );
  }

  const revokedSet = new Set(current.revokedCatalogIds);
  if (enabled) revokedSet.delete(catalogId);
  else revokedSet.add(catalogId);

  return saveStaffBenefitOverrides(
    { ...current, revokedCatalogIds: Array.from(revokedSet) },
    updatedBy,
  );
}

export async function addExtraStaffBenefitForUser(
  userId: string,
  entry: RoleBenefitEntitlementEntry,
  updatedBy?: string | null,
): Promise<StaffBenefitOverrides> {
  const current = await getStaffBenefitOverrides(userId);
  const extra = current.extra.filter((e) => e.catalogId !== entry.catalogId);
  extra.push(entry);
  return saveStaffBenefitOverrides({ ...current, extra }, updatedBy);
}

export async function removeExtraStaffBenefitForUser(
  userId: string,
  catalogId: string,
  updatedBy?: string | null,
): Promise<StaffBenefitOverrides> {
  const current = await getStaffBenefitOverrides(userId);
  return saveStaffBenefitOverrides(
    { ...current, extra: current.extra.filter((e) => e.catalogId !== catalogId) },
    updatedBy,
  );
}
