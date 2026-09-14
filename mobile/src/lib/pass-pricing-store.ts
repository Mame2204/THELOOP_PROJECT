import AsyncStorage from '@react-native-async-storage/async-storage';
import { countryCacheKey, countryRemoteKey, resolveCountryCode } from '@/lib/country-settings-keys';
import { DEFAULT_COUNTRY_CODE, getCountry, type CountryCode } from '@/lib/countries';
import { PASS_PRICES_GNF, type PrimeBillingPeriod } from '@/lib/prime-plans';
import {
  fetchAppSetting,
  loadCachedJson,
  saveCachedJson,
  upsertAppSetting,
} from '@/lib/remote-settings-sync';

const CACHE_BASE = 'loop_pass_prices_v2';
const REMOTE_BASE = 'pass_prices_v1';
const LEGACY_KEY = 'loop_pass_prices_v1';

export type PassPriceMap = Record<PrimeBillingPeriod, number>;

/** Tarifs PASS par défaut selon le pays (devise locale). */
export function defaultPassPricesForCountry(countryCode: CountryCode = DEFAULT_COUNTRY_CODE): PassPriceMap {
  switch (countryCode) {
    case 'SN':
    case 'CI':
    case 'ML':
    case 'BF':
    case 'BJ':
    case 'TG':
    case 'NE':
      return {
        monthly: 85_000,
        quarterly: 240_000,
        annual: 850_000,
        lifetime: 2_500_000,
      };
    default:
      return { ...PASS_PRICES_GNF };
  }
}

/** @deprecated Utiliser defaultPassPricesForCountry */
export function defaultPassPrices(): PassPriceMap {
  return defaultPassPricesForCountry(DEFAULT_COUNTRY_CODE);
}

function normalizePrices(raw: Partial<PassPriceMap> | null | undefined, countryCode: CountryCode): PassPriceMap {
  const base = defaultPassPricesForCountry(countryCode);
  const next = { ...base };
  for (const key of Object.keys(base) as PrimeBillingPeriod[]) {
    const n = Number(raw?.[key]);
    if (Number.isFinite(n) && n > 0) next[key] = Math.floor(n);
  }
  return next;
}

function keys(countryCode?: CountryCode) {
  const cc = resolveCountryCode(countryCode);
  return {
    cc,
    cache: countryCacheKey(CACHE_BASE, cc),
    remote: countryRemoteKey(REMOTE_BASE, cc),
    isLegacyGn: cc === DEFAULT_COUNTRY_CODE,
  };
}

async function migrateLegacyGn(cacheKey: string, remoteKey: string): Promise<PassPriceMap | null> {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const prices = normalizePrices(JSON.parse(raw) as Partial<PassPriceMap>, 'GN');
    await saveCachedJson(cacheKey, prices);
    await upsertAppSetting(remoteKey, prices);
    return prices;
  } catch {
    return null;
  }
}

export async function getPassPrices(countryCode: CountryCode = DEFAULT_COUNTRY_CODE): Promise<PassPriceMap> {
  const { cc, cache, remote, isLegacyGn } = keys(countryCode);

  const remoteData = await fetchAppSetting<Partial<PassPriceMap>>(remote);
  if (remoteData) {
    const prices = normalizePrices(remoteData, cc);
    await saveCachedJson(cache, prices);
    return prices;
  }

  const cached = await loadCachedJson<Partial<PassPriceMap>>(cache);
  if (cached) return normalizePrices(cached, cc);

  if (isLegacyGn) {
    const migrated = await migrateLegacyGn(cache, remote);
    if (migrated) return migrated;
  }

  try {
    const raw = await AsyncStorage.getItem(cache);
    if (raw) return normalizePrices(JSON.parse(raw) as Partial<PassPriceMap>, cc);
  } catch {
    /* defaults */
  }

  return defaultPassPricesForCountry(cc);
}

export async function savePassPrices(countryCode: CountryCode, prices: PassPriceMap): Promise<void> {
  const { cc, cache, remote } = keys(countryCode);
  const next = normalizePrices(prices, cc);
  await saveCachedJson(cache, next);
  await AsyncStorage.setItem(cache, JSON.stringify(next));
  await upsertAppSetting(remote, next);
}

export function passPriceCurrency(countryCode: CountryCode = DEFAULT_COUNTRY_CODE): string {
  return getCountry(countryCode).currency;
}
