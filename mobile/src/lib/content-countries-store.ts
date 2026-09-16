import { DEFAULT_COUNTRY_CODE, LOOP_COUNTRIES, type CountryCode } from '@/lib/countries';
import { fetchAppSetting, loadCachedJson, saveCachedJson, upsertAppSetting } from '@/lib/remote-settings-sync';

const CACHE_KEY = 'loop_enabled_content_countries_v2';
const REMOTE_KEY = 'enabled_content_countries';

let memoryCache: CountryCode[] | null = null;
let remoteRefreshScheduled = false;

function normalizeCodes(raw: unknown): CountryCode[] {
  const valid = LOOP_COUNTRIES.map((c) => c.code);
  if (!Array.isArray(raw)) return [DEFAULT_COUNTRY_CODE];
  const filtered = raw.filter((c): c is CountryCode => typeof c === 'string' && valid.includes(c as CountryCode));
  return filtered.length ? filtered : [DEFAULT_COUNTRY_CODE];
}

function codesEqual(a: CountryCode[], b: CountryCode[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((code) => setB.has(code));
}

async function notifyCountriesChanged(previous: CountryCode[] | undefined, next: CountryCode[]): Promise<void> {
  if (previous && codesEqual(previous, next)) return;
  const { emitHomeRefresh } = await import('@/lib/home-refresh');
  emitHomeRefresh('content-countries');
}

async function fetchRemoteEnabledCountries(previous?: CountryCode[]): Promise<CountryCode[] | null> {
  const remote = await fetchAppSetting<string[]>(REMOTE_KEY);
  if (!remote) return null;
  const codes = normalizeCodes(remote);
  memoryCache = codes;
  await saveCachedJson(CACHE_KEY, codes);
  await notifyCountriesChanged(previous, codes);
  return codes;
}

function scheduleEnabledCountriesRemoteRefresh(previous: CountryCode[]): void {
  if (remoteRefreshScheduled) return;
  remoteRefreshScheduled = true;
  void fetchRemoteEnabledCountries(previous).finally(() => {
    remoteRefreshScheduled = false;
  });
}

export function invalidateEnabledContentCountriesCache(): void {
  memoryCache = null;
}

export async function listEnabledContentCountries(options?: { force?: boolean }): Promise<CountryCode[]> {
  if (!options?.force && memoryCache) {
    scheduleEnabledCountriesRemoteRefresh(memoryCache);
    return memoryCache;
  }

  let local = normalizeCodes(null);
  let hasDiskCache = false;
  try {
    const cached = await loadCachedJson<CountryCode[]>(CACHE_KEY);
    if (cached) {
      local = normalizeCodes(cached);
      hasDiskCache = true;
    }
  } catch {
    /* defaults */
  }

  memoryCache = local;

  if (!options?.force && hasDiskCache) {
    scheduleEnabledCountriesRemoteRefresh(local);
    return local;
  }

  const remote = await fetchRemoteEnabledCountries(local);
  return remote ?? local;
}

export async function setEnabledContentCountries(codes: CountryCode[]): Promise<void> {
  const valid = LOOP_COUNTRIES.map((c) => c.code);
  const unique = [...new Set(codes.filter((c) => valid.includes(c)))];
  const safe = unique.length ? unique : [DEFAULT_COUNTRY_CODE];
  memoryCache = safe;
  await saveCachedJson(CACHE_KEY, safe);
  await upsertAppSetting(REMOTE_KEY, safe);
  const { emitHomeRefresh } = await import('@/lib/home-refresh');
  emitHomeRefresh('content-countries');
}

export async function isContentCountryEnabled(code: CountryCode): Promise<boolean> {
  const enabled = await listEnabledContentCountries();
  return enabled.includes(code);
}

export async function toggleContentCountry(code: CountryCode, enabled: boolean): Promise<CountryCode[]> {
  const current = await listEnabledContentCountries({ force: true });
  const next = enabled ? [...new Set([...current, code])] : current.filter((c) => c !== code);
  const safe = next.length ? next : [DEFAULT_COUNTRY_CODE];
  await setEnabledContentCountries(safe);
  return safe;
}

export async function listSignupContentCountries(): Promise<CountryCode[]> {
  return listEnabledContentCountries();
}
