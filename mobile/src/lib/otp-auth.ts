/** Code OTP de développement — aucun envoi SMS/email pour l'instant. */
export const DEV_OTP_CODE = '1234';

export const DEV_MEMBER_PASSWORD = 'Loop1234!';

import {
  DEFAULT_COUNTRY_CODE,
  inferCountryCodeFromPhone,
  normalizePhone as normalizePhoneForCountry,
  phoneHint,
  type CountryCode,
} from '@/lib/countries';

export { inferCountryCodeFromPhone, phoneHint, type CountryCode };

export function normalizePhone(value: string, countryCode?: CountryCode): string {
  const code = countryCode ?? inferCountryCodeFromPhone(value);
  return normalizePhoneForCountry(value, code);
}

export function isPhoneIdentifier(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.includes('@')) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 8;
}

export function normalizeIdentifier(value: string): string {
  return isPhoneIdentifier(value) ? normalizePhone(value) : value.trim().toLowerCase();
}

export function syntheticEmailFromPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@theloop.gn`;
}

export function isValidOtp(code: string): boolean {
  return code.trim() === DEV_OTP_CODE;
}

export async function sendOtpMock(identifier: string): Promise<void> {
  void identifier;
  await new Promise((resolve) => setTimeout(resolve, 600));
}

export function otpDevHint(): string {
  return `SMS développement : saisissez le code ${DEV_OTP_CODE}`;
}

export function authIdentifierHint(countryCode: CountryCode = DEFAULT_COUNTRY_CODE): string {
  return phoneHint(countryCode);
}
