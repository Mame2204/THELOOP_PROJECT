import {
  detectDialCountryFromPhone,
  normalizeInternationalPhone,
  type PhoneDialCode,
} from '@/lib/countries';

/** Format E.164 stable — préserve l'indicatif international (+33, +224…). */
export function canonicalPhone(value: string, dialCode?: PhoneDialCode): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) {
    const digits = trimmed.replace(/\D/g, '');
    return digits ? `+${digits}` : trimmed;
  }
  const code = dialCode ?? detectDialCountryFromPhone(trimmed).code;
  return normalizeInternationalPhone(trimmed, code);
}

export function phonesEqual(a: string, b: string): boolean {
  const da = a.replace(/\D/g, '');
  const db = b.replace(/\D/g, '');
  if (!da || !db) return false;
  return da === db;
}
