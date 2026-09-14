import { DEFAULT_COUNTRY_CODE, LOOP_COUNTRIES, type CountryCode } from '@/lib/countries';
import { fetchAppSetting, loadCachedJson, saveCachedJson, upsertAppSetting } from '@/lib/remote-settings-sync';

const CACHE_KEY = 'loop_enabled_content_countries_v2';
const REMOTE_KEY = 'enabled_content_countries';

function normalizeCodes(raw: unknown): CountryCode[] {
  const valid = LOOP_COUNTRIES.map((c) => c.code);
  if (!Array.isArray(raw)) return [DEFAULT_COUNTRY_CODE];
  const filtered = raw.filter((c): c is CountryCode => typeof c === 'string' && valid.includes(c as CountryCode));
  return filtered.length ? filtered : [DEFAULT_COUNTRY_CODE];
}

export async function listEnabledContentCountries(): Promise<CountryCode[]> {
  const remote = await fetchAppSetting<string[]>(REMOTE_KEY);
  if (remote) {
    const codes = normalizeCodes(remote);
    await saveCachedJson(CACHE_KEY, codes);
    return codes;
  }
  const cached = await loadCachedJson<CountryCode[]>(CACHE_KEY);
  return cached ?? [DEFAULT_COUNTRY_CODE];
}

export async function setEnabledContentCountries(codes: CountryCode[]): Promise<void> {
  const valid = LOOP_COUNTRIES.map((c) => c.code);
  const unique = [...new Set(codes.filter((c) => valid.includes(c)))];
  const safe = unique.length ? unique : [DEFAULT_COUNTRY_CODE];
  await saveCachedJson(CACHE_KEY, safe);
  await upsertAppSetting(REMOTE_KEY, safe);
}

export async function isContentCountryEnabled(code: CountryCode): Promise<boolean> {
  const enabled = await listEnabledContentCountries();
  return enabled.includes(code);
}

export async function toggleContentCountry(code: CountryCode, enabled: boolean): Promise<CountryCode[]> {
  const current = await listEnabledContentCountries();
  const next = enabled ? [...new Set([...current, code])] : current.filter((c) => c !== code);
  const safe = next.length ? next : [DEFAULT_COUNTRY_CODE];
  await setEnabledContentCountries(safe);
  return safe;
}

export async function listSignupContentCountries(): Promise<CountryCode[]> {
  return listEnabledContentCountries();
}
