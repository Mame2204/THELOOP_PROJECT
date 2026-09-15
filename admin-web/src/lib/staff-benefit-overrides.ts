import { supabase } from './supabase';

export interface RoleBenefitEntitlementEntry {
  catalogId: string;
  partnerId?: string;
  partnerDisplayName?: string;
}

export interface StaffBenefitOverrides {
  userId: string;
  revokedCatalogIds: string[];
  extra: RoleBenefitEntitlementEntry[];
  enabledCatalogIds: string[];
  updatedAt: string;
  updatedBy?: string | null;
}

function normalize(raw: Partial<StaffBenefitOverrides> | null | undefined, userId: string): StaffBenefitOverrides {
  return {
    userId,
    revokedCatalogIds: Array.isArray(raw?.revokedCatalogIds) ? raw!.revokedCatalogIds.map(String) : [],
    extra: Array.isArray(raw?.extra) ? (raw!.extra as RoleBenefitEntitlementEntry[]) : [],
    enabledCatalogIds: Array.isArray(raw?.enabledCatalogIds) ? raw!.enabledCatalogIds.map(String) : [],
    updatedAt: raw?.updatedAt ?? new Date(0).toISOString(),
    updatedBy: raw?.updatedBy ?? null,
  };
}

export async function getStaffBenefitOverrides(userId: string): Promise<StaffBenefitOverrides> {
  const { data, error } = await supabase
    .from('staff_benefit_overrides')
    .select('user_id, revoked_catalog_ids, extra, enabled_catalog_ids, updated_at, updated_by')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return normalize(null, userId);
  return normalize(
    {
      userId: String(data.user_id),
      revokedCatalogIds: data.revoked_catalog_ids as string[],
      extra: data.extra as RoleBenefitEntitlementEntry[],
      enabledCatalogIds: data.enabled_catalog_ids as string[],
      updatedAt: String(data.updated_at),
      updatedBy: data.updated_by ? String(data.updated_by) : null,
    },
    userId,
  );
}

async function saveStaffBenefitOverrides(
  overrides: StaffBenefitOverrides,
  updatedBy?: string | null,
): Promise<StaffBenefitOverrides> {
  const next: StaffBenefitOverrides = {
    ...normalize(overrides, overrides.userId),
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ?? overrides.updatedBy ?? null,
  };
  const { error } = await supabase.from('staff_benefit_overrides').upsert({
    user_id: next.userId,
    revoked_catalog_ids: next.revokedCatalogIds,
    extra: next.extra,
    enabled_catalog_ids: next.enabledCatalogIds,
    updated_at: next.updatedAt,
    updated_by: next.updatedBy,
  });
  if (error) throw new Error(error.message);
  return next;
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

export function isTeamBenefitEnabledForUser(
  overrides: StaffBenefitOverrides,
  catalogId: string,
  isSuperAdmin: boolean,
): boolean {
  if (isSuperAdmin) return overrides.enabledCatalogIds.includes(catalogId);
  return !overrides.revokedCatalogIds.includes(catalogId);
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

export async function setAdminStaffBenefitEnabled(
  userId: string,
  catalogId: string,
  enabled: boolean,
  teamCatalogIds: Set<string>,
  catalogItem: { catalogId: string; partnerDisplayName?: string } | undefined,
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
        extra.push({
          catalogId,
          partnerId: 'loop',
          partnerDisplayName: catalogItem.partnerDisplayName ?? 'THE LOOP',
        });
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
