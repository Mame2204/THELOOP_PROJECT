import { asCountryCode, DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';

/** Code pays normalisé (catalogue Loop). */
export function resolveCountryCode(code?: string | null): CountryCode {
  return asCountryCode(code?.trim().toUpperCase().slice(0, 2)) ?? DEFAULT_COUNTRY_CODE;
}

/** Clé AsyncStorage par pays. */
export function countryCacheKey(base: string, countryCode?: string | null): string {
  return `${base}_${resolveCountryCode(countryCode)}`;
}

/** Clé Supabase app_settings par pays. */
export function countryRemoteKey(base: string, countryCode?: string | null): string {
  return `${base}_${resolveCountryCode(countryCode)}`;
}
