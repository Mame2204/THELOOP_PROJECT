import AsyncStorage from '@react-native-async-storage/async-storage';
import { countryCacheKey, countryRemoteKey, resolveCountryCode } from '@/lib/country-settings-keys';
import { DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';
import {
  fetchAppSetting,
  loadCachedJson,
  saveCachedJson,
  upsertAppSetting,
} from '@/lib/remote-settings-sync';

const CACHE_BASE = 'loop_pass_shop_settings_v1';
const REMOTE_BASE = 'pass_shop_settings_v1';
const LEGACY_CACHE = 'loop_pass_shop_settings_v1';
const LEGACY_REMOTE = 'pass_shop_settings_v1';

/** Nombre max de PASS en file d’attente (super admin). */
export const DEFAULT_MAX_PENDING_PASSES = 3;

export interface PassShopSettings {
  maxPendingPasses: number;
}

function normalize(raw: Partial<PassShopSettings> | null | undefined): PassShopSettings {
  const n = Number(raw?.maxPendingPasses);
  return {
    maxPendingPasses:
      Number.isFinite(n) && n >= 0 ? Math.min(20, Math.floor(n)) : DEFAULT_MAX_PENDING_PASSES,
  };
}

function keys(countryCode?: CountryCode) {
  const cc = resolveCountryCode(countryCode);
  return {
    cache: countryCacheKey(CACHE_BASE, cc),
    remote: countryRemoteKey(REMOTE_BASE, cc),
    isLegacyGn: cc === DEFAULT_COUNTRY_CODE,
  };
}

async function migrateLegacyGn(cacheKey: string, remoteKey: string): Promise<PassShopSettings | null> {
  const legacyRemote = await fetchAppSetting<PassShopSettings>(LEGACY_REMOTE);
  if (legacyRemote) {
    const settings = normalize(legacyRemote);
    await saveCachedJson(cacheKey, settings);
    await upsertAppSetting(remoteKey, settings);
    return settings;
  }
  try {
    const raw = await AsyncStorage.getItem(LEGACY_CACHE);
    if (raw) {
      const settings = normalize(JSON.parse(raw) as PassShopSettings);
      await saveCachedJson(cacheKey, settings);
      await upsertAppSetting(remoteKey, settings);
      return settings;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function getPassShopSettings(
  countryCode: CountryCode = DEFAULT_COUNTRY_CODE,
): Promise<PassShopSettings> {
  const { cache, remote, isLegacyGn } = keys(countryCode);
  const remoteData = await fetchAppSetting<PassShopSettings>(remote);
  if (remoteData) {
    const settings = normalize(remoteData);
    await saveCachedJson(cache, settings);
    return settings;
  }
  const cached = await loadCachedJson<PassShopSettings>(cache);
  if (cached) return normalize(cached);
  if (isLegacyGn) {
    const migrated = await migrateLegacyGn(cache, remote);
    if (migrated) return migrated;
  }
  try {
    const raw = await AsyncStorage.getItem(cache);
    if (raw) return normalize(JSON.parse(raw) as PassShopSettings);
  } catch {
    /* ignore */
  }
  return normalize(null);
}

export async function savePassShopSettings(
  countryCode: CountryCode,
  settings: PassShopSettings,
): Promise<PassShopSettings> {
  const next = normalize(settings);
  const { cache, remote } = keys(countryCode);
  await saveCachedJson(cache, next);
  await AsyncStorage.setItem(cache, JSON.stringify(next));
  await upsertAppSetting(remote, next);
  return next;
}

export async function getMaxPendingPasses(countryCode: CountryCode = DEFAULT_COUNTRY_CODE): Promise<number> {
  const s = await getPassShopSettings(countryCode);
  return s.maxPendingPasses;
}
