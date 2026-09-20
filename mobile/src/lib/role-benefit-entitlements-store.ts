import AsyncStorage from '@react-native-async-storage/async-storage';
import { countryCacheKey, countryRemoteKey, resolveCountryCode } from '@/lib/country-settings-keys';
import { DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';
import { isNetworkOnline } from '@/lib/offline-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { asJson } from '@/lib/supabase-types';

export type RoleEntitlementKind = 'member' | 'prime' | 'partner' | 'admin';

export interface RoleBenefitEntitlementEntry {
  catalogId: string;
  partnerId?: string;
  partnerDisplayName?: string;
}

export interface RoleBenefitEntitlementsConfig {
  member: RoleBenefitEntitlementEntry[];
  prime: RoleBenefitEntitlementEntry[];
  partner: RoleBenefitEntitlementEntry[];
  admin: RoleBenefitEntitlementEntry[];
  updatedAt: string;
  updatedBy?: string | null;
}

const CACHE_BASE = 'loop_role_benefit_entitlements_v1';
const REMOTE_BASE = 'role_benefit_entitlements';
const LEGACY_CACHE = 'loop_role_benefit_entitlements_v1';
const LEGACY_REMOTE = 'role_benefit_entitlements';

const EMPTY_CONFIG: RoleBenefitEntitlementsConfig = {
  member: [],
  prime: [],
  partner: [],
  admin: [],
  updatedAt: new Date(0).toISOString(),
  updatedBy: null,
};

function keys(countryCode?: CountryCode) {
  const cc = resolveCountryCode(countryCode);
  return {
    cc,
    cache: countryCacheKey(CACHE_BASE, cc),
    remote: countryRemoteKey(REMOTE_BASE, cc),
    isLegacyGn: cc === DEFAULT_COUNTRY_CODE,
  };
}

function normalizeConfig(raw: Partial<RoleBenefitEntitlementsConfig> | null | undefined): RoleBenefitEntitlementsConfig {
  return {
    member: Array.isArray(raw?.member) ? raw!.member : [],
    prime: Array.isArray(raw?.prime) ? raw!.prime : [],
    partner: Array.isArray(raw?.partner) ? raw!.partner : [],
    admin: Array.isArray(raw?.admin) ? raw!.admin : [],
    updatedAt: raw?.updatedAt ?? new Date(0).toISOString(),
    updatedBy: raw?.updatedBy ?? null,
  };
}

async function loadLocal(countryCode: CountryCode): Promise<RoleBenefitEntitlementsConfig> {
  const { cache, isLegacyGn } = keys(countryCode);
  try {
    const raw = await AsyncStorage.getItem(cache);
    if (raw) return normalizeConfig(JSON.parse(raw) as RoleBenefitEntitlementsConfig);
    if (isLegacyGn) {
      const legacy = await AsyncStorage.getItem(LEGACY_CACHE);
      if (legacy) {
        const config = normalizeConfig(JSON.parse(legacy) as RoleBenefitEntitlementsConfig);
        await AsyncStorage.setItem(cache, JSON.stringify(config));
        return config;
      }
    }
  } catch {
    /* ignore */
  }
  return { ...EMPTY_CONFIG };
}

/** Lecture locale seule — pas d’appel réseau (UI fiches détail). */
export async function peekRoleBenefitEntitlementsConfig(
  countryCode: CountryCode = DEFAULT_COUNTRY_CODE,
): Promise<RoleBenefitEntitlementsConfig> {
  return loadLocal(resolveCountryCode(countryCode));
}

async function saveLocal(countryCode: CountryCode, config: RoleBenefitEntitlementsConfig): Promise<void> {
  const { cache } = keys(countryCode);
  await AsyncStorage.setItem(cache, JSON.stringify(config));
}

async function fetchRemoteConfig(countryCode: CountryCode): Promise<RoleBenefitEntitlementsConfig | null> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return null;

  const { remote, isLegacyGn } = keys(countryCode);
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', remote)
    .maybeSingle();

  if (!error && data?.value) {
    return normalizeConfig(data.value as unknown as RoleBenefitEntitlementsConfig);
  }

  if (isLegacyGn) {
    const { data: legacy, error: legacyError } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', LEGACY_REMOTE)
      .maybeSingle();
    if (!legacyError && legacy?.value) {
      const config = normalizeConfig(legacy.value as unknown as RoleBenefitEntitlementsConfig);
      await supabase.from('app_settings').upsert({
        key: remote,
        value: asJson({
          member: config.member,
          prime: config.prime,
          partner: config.partner,
          admin: config.admin,
          updatedAt: config.updatedAt,
          updatedBy: config.updatedBy ?? null,
        }),
        updated_at: new Date().toISOString(),
      });
      return config;
    }
  }

  return null;
}

async function pushRemoteConfig(countryCode: CountryCode, config: RoleBenefitEntitlementsConfig): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return;

  const { remote } = keys(countryCode);
  const { error } = await supabase.from('app_settings').upsert({
    key: remote,
    value: asJson({
      member: config.member,
      prime: config.prime,
      partner: config.partner,
      admin: config.admin,
      updatedAt: config.updatedAt,
      updatedBy: config.updatedBy ?? null,
    }),
    updated_at: new Date().toISOString(),
  });

  if (error) console.warn('[RoleEntitlements] push remote:', error.message);
}

function pickNewest(
  local: RoleBenefitEntitlementsConfig,
  remote: RoleBenefitEntitlementsConfig | null,
): RoleBenefitEntitlementsConfig {
  if (!remote) return local;
  const localTs = new Date(local.updatedAt).getTime();
  const remoteTs = new Date(remote.updatedAt).getTime();
  if (Number.isNaN(remoteTs) || remoteTs <= localTs) return local;
  return remote;
}

/** Fusionne config locale et remote — exporté pour tests. */
export function mergeRoleEntitlementConfigs(
  local: RoleBenefitEntitlementsConfig,
  remote: RoleBenefitEntitlementsConfig | null,
): RoleBenefitEntitlementsConfig {
  return pickNewest(local, remote);
}

/** Charge la config locale + remote (la plus récente gagne) et persiste localement. */
export async function refreshRoleBenefitEntitlementsConfig(
  countryCode: CountryCode = DEFAULT_COUNTRY_CODE,
): Promise<RoleBenefitEntitlementsConfig> {
  const cc = resolveCountryCode(countryCode);
  const local = await loadLocal(cc);
  const remote = await fetchRemoteConfig(cc);
  const merged = pickNewest(local, remote);
  if (merged !== local) await saveLocal(cc, merged);
  return merged;
}

export async function getRoleBenefitEntitlementsConfig(
  countryCode: CountryCode = DEFAULT_COUNTRY_CODE,
): Promise<RoleBenefitEntitlementsConfig> {
  return refreshRoleBenefitEntitlementsConfig(countryCode);
}

export async function saveRoleBenefitEntitlementsConfig(
  countryCode: CountryCode,
  config: Pick<RoleBenefitEntitlementsConfig, 'member' | 'prime' | 'partner' | 'admin'>,
  updatedBy?: string | null,
): Promise<RoleBenefitEntitlementsConfig> {
  const cc = resolveCountryCode(countryCode);
  const next: RoleBenefitEntitlementsConfig = {
    member: config.member,
    prime: config.prime,
    partner: config.partner ?? [],
    admin: config.admin,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ?? null,
  };
  await saveLocal(cc, next);
  await pushRemoteConfig(cc, next);
  return next;
}

export function entitlementEntryKey(entry: RoleBenefitEntitlementEntry, role: RoleEntitlementKind): string {
  return `${role}:${entry.catalogId}:${entry.partnerId ?? ''}:${entry.partnerDisplayName ?? ''}`;
}
