import { DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';

/** Code pays normalisé (2 lettres). */
export function resolveCountryCode(code?: string | null): CountryCode {
  const c = code?.trim().toUpperCase().slice(0, 2);
  if (c && c.length === 2) return c as CountryCode;
  return DEFAULT_COUNTRY_CODE;
}

/** Clé AsyncStorage par pays. */
export function countryCacheKey(base: string, countryCode?: string | null): string {
  return `${base}_${resolveCountryCode(countryCode)}`;
}

/** Clé Supabase app_settings par pays. */
export function countryRemoteKey(base: string, countryCode?: string | null): string {
  return `${base}_${resolveCountryCode(countryCode)}`;
}
