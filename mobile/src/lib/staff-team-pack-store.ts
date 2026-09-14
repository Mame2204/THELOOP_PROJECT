import { DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';
import {
  fetchAppSetting,
  loadCachedJson,
  pickNewestByTimestamp,
  saveCachedJson,
  upsertAppSetting,
} from '@/lib/remote-settings-sync';
import {
  getRoleBenefitEntitlementsConfig,
  peekRoleBenefitEntitlementsConfig,
  saveRoleBenefitEntitlementsConfig,
  type RoleBenefitEntitlementEntry,
} from '@/lib/role-benefit-entitlements-store';

export interface StaffTeamPackConfig {
  byCountry: Partial<Record<CountryCode, RoleBenefitEntitlementEntry[]>>;
  updatedAt: string;
  updatedBy?: string | null;
}

const CACHE_KEY = 'loop_staff_team_pack_v1';
const REMOTE_KEY = 'staff_team_pack_by_country';

function now() {
  return new Date().toISOString();
}

function emptyConfig(): StaffTeamPackConfig {
  return { byCountry: {}, updatedAt: new Date(0).toISOString(), updatedBy: null };
}

function normalizeConfig(raw: Partial<StaffTeamPackConfig> | null | undefined): StaffTeamPackConfig {
  return {
    byCountry: raw?.byCountry && typeof raw.byCountry === 'object' ? raw.byCountry : {},
    updatedAt: raw?.updatedAt ?? new Date(0).toISOString(),
    updatedBy: raw?.updatedBy ?? null,
  };
}

async function loadRaw(): Promise<StaffTeamPackConfig> {
  const remote = await fetchAppSetting<StaffTeamPackConfig>(REMOTE_KEY);
  const cached = (await loadCachedJson<StaffTeamPackConfig>(CACHE_KEY)) ?? emptyConfig();
  const merged = pickNewestByTimestamp(cached, remote ? normalizeConfig(remote) : null);
  await saveCachedJson(CACHE_KEY, merged);
  return merged;
}

async function saveRaw(config: StaffTeamPackConfig): Promise<void> {
  await saveCachedJson(CACHE_KEY, config);
  await upsertAppSetting(REMOTE_KEY, config);
}

export async function getStaffTeamPackForCountry(countryCode: CountryCode): Promise<RoleBenefitEntitlementEntry[]> {
  const pack = await loadRaw();
  const entries = pack.byCountry[countryCode];
  if (entries?.length) return entries;

  if (countryCode === DEFAULT_COUNTRY_CODE) {
    const legacy = await getRoleBenefitEntitlementsConfig(DEFAULT_COUNTRY_CODE);
    return legacy.admin;
  }
  return [];
}

export async function getStaffTeamPackConfig(): Promise<StaffTeamPackConfig> {
  return loadRaw();
}

/**
 * Recalcule `role_benefit_entitlements.admin` pour le pays = pack Admin uniquement
 * (admins délégués — jamais le super admin).
 */
export async function syncAdminRoleEntitlementsForCountry(
  countryCode: CountryCode,
  options?: {
    teamEntries?: RoleBenefitEntitlementEntry[];
    updatedBy?: string | null;
  },
): Promise<void> {
  const teamEntries =
    options?.teamEntries ?? (await getStaffTeamPackForCountry(countryCode));

  const roleConfig = await peekRoleBenefitEntitlementsConfig(countryCode);
  await saveRoleBenefitEntitlementsConfig(
    countryCode,
    {
      member: roleConfig.member,
      prime: roleConfig.prime,
      partner: roleConfig.partner,
      admin: teamEntries,
    },
    options?.updatedBy ?? null,
  );
}

export async function saveStaffTeamPackForCountry(
  countryCode: CountryCode,
  entries: RoleBenefitEntitlementEntry[],
  updatedBy?: string | null,
): Promise<StaffTeamPackConfig> {
  const current = await loadRaw();
  const next: StaffTeamPackConfig = {
    byCountry: { ...current.byCountry, [countryCode]: entries },
    updatedAt: now(),
    updatedBy: updatedBy ?? null,
  };
  await saveRaw(next);

  await syncAdminRoleEntitlementsForCountry(countryCode, {
    teamEntries: entries,
    updatedBy,
  });

  return next;
}
