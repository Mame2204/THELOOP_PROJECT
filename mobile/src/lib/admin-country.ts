import { DEFAULT_COUNTRY_CODE, inferCountryCodeFromPhone } from '@/lib/countries';

export function resolveCountryCode(
  explicit?: string | null,
  phone?: string | null,
): string {
  if (explicit?.trim()) return explicit.trim().toUpperCase();
  if (phone?.trim()) return inferCountryCodeFromPhone(phone);
  return DEFAULT_COUNTRY_CODE;
}

export function matchesAdminCountry(
  itemCountry: string | null | undefined,
  adminCountry: string,
): boolean {
  return (itemCountry ?? DEFAULT_COUNTRY_CODE) === adminCountry;
}

export function filterByAdminCountry<T extends { countryCode: string }>(
  items: T[],
  adminCountry: string,
): T[] {
  return items.filter((item) => matchesAdminCountry(item.countryCode, adminCountry));
}

export function filterRegistryByCountry<
  T extends { countryCode?: string | null; phoneNumber?: string | null },
>(items: T[], adminCountry: string): T[] {
  return items.filter((item) => {
    const code = resolveCountryCode(item.countryCode, item.phoneNumber);
    return code === adminCountry;
  });
}
