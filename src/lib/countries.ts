export type CountryCode =
  | 'GN'
  | 'SN'
  | 'CI'
  | 'ML'
  | 'BF'
  | 'BJ'
  | 'TG'
  | 'NE'
  | 'MR'
  | 'LR'
  | 'SL'
  | 'GH';

export interface LoopCountry {
  code: CountryCode;
  name: string;
  flag: string;
  callingCode: string;
  nationalLength: number;
  mobilePrefixes: string[];
  currency: string;
}

export const LOOP_COUNTRIES: LoopCountry[] = [
  { code: 'GN', name: 'Guinée', flag: '🇬🇳', callingCode: '224', nationalLength: 9, mobilePrefixes: ['6'], currency: 'GNF' },
  { code: 'SN', name: 'Sénégal', flag: '🇸🇳', callingCode: '221', nationalLength: 9, mobilePrefixes: ['7'], currency: 'XOF' },
  { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮', callingCode: '225', nationalLength: 10, mobilePrefixes: ['0', '1', '4', '5', '6', '7'], currency: 'XOF' },
  { code: 'ML', name: 'Mali', flag: '🇲🇱', callingCode: '223', nationalLength: 8, mobilePrefixes: ['6', '7'], currency: 'XOF' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫', callingCode: '226', nationalLength: 8, mobilePrefixes: ['6', '7'], currency: 'XOF' },
  { code: 'BJ', name: 'Bénin', flag: '🇧🇯', callingCode: '229', nationalLength: 8, mobilePrefixes: ['6', '9'], currency: 'XOF' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬', callingCode: '228', nationalLength: 8, mobilePrefixes: ['9'], currency: 'XOF' },
  { code: 'NE', name: 'Niger', flag: '🇳🇪', callingCode: '227', nationalLength: 8, mobilePrefixes: ['9'], currency: 'XOF' },
  { code: 'MR', name: 'Mauritanie', flag: '🇲🇷', callingCode: '222', nationalLength: 8, mobilePrefixes: ['2', '3', '4'], currency: 'MRU' },
  { code: 'LR', name: 'Liberia', flag: '🇱🇷', callingCode: '231', nationalLength: 9, mobilePrefixes: ['7', '8'], currency: 'LRD' },
  { code: 'SL', name: 'Sierra Leone', flag: '🇸🇱', callingCode: '232', nationalLength: 8, mobilePrefixes: ['7', '8'], currency: 'SLL' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭', callingCode: '233', nationalLength: 9, mobilePrefixes: ['2', '5'], currency: 'GHS' },
];

export const DEFAULT_COUNTRY_CODE: CountryCode = 'GN';

const BY_CODE = new Map(LOOP_COUNTRIES.map((c) => [c.code, c]));
const BY_CALLING = [...LOOP_COUNTRIES].sort((a, b) => b.callingCode.length - a.callingCode.length);

export function getCountry(code?: string | null): LoopCountry {
  return BY_CODE.get((code ?? DEFAULT_COUNTRY_CODE) as CountryCode) ?? BY_CODE.get(DEFAULT_COUNTRY_CODE)!;
}

export function getCountryLabel(code?: string | null): string {
  const c = getCountry(code);
  return `${c.flag} ${c.name}`;
}

export function detectCountryFromPhone(input: string): LoopCountry {
  const digits = input.replace(/\D/g, '');
  for (const country of BY_CALLING) {
    if (digits.startsWith(country.callingCode)) return country;
  }
  return getCountry(DEFAULT_COUNTRY_CODE);
}

export function normalizePhone(value: string, countryCode: CountryCode = DEFAULT_COUNTRY_CODE): string {
  const country = getCountry(countryCode);
  const digits = value.replace(/\D/g, '');

  if (digits.startsWith(country.callingCode)) {
    return `+${digits}`;
  }

  if (digits.length === country.nationalLength) {
    return `+${country.callingCode}${digits}`;
  }

  if (value.trim().startsWith('+')) {
    return `+${digits}`;
  }

  if (countryCode === 'GN' && digits.length === 9 && digits.startsWith('6')) {
    return `+224${digits}`;
  }

  return value.trim();
}

export function isValidPhoneForCountry(value: string, countryCode: CountryCode): boolean {
  const country = getCountry(countryCode);
  const normalized = normalizePhone(value, countryCode);
  const digits = normalized.replace(/\D/g, '');
  if (!digits.startsWith(country.callingCode)) return false;
  const national = digits.slice(country.callingCode.length);
  if (national.length !== country.nationalLength) return false;
  return country.mobilePrefixes.some((p) => national.startsWith(p));
}

export function phoneHint(countryCode: CountryCode = DEFAULT_COUNTRY_CODE): string {
  const c = getCountry(countryCode);
  const sample = c.mobilePrefixes[0] ?? '6';
  const pad = 'X'.repeat(Math.max(0, c.nationalLength - 3));
  return `+${c.callingCode} ${sample}${pad}`;
}

export function inferCountryCodeFromPhone(phone: string | null | undefined): CountryCode {
  if (!phone?.trim()) return DEFAULT_COUNTRY_CODE;
  return detectCountryFromPhone(phone).code;
}

export const COUNTRY_LABELS: Record<CountryCode, string> = Object.fromEntries(
  LOOP_COUNTRIES.map((c) => [c.code, c.name]),
) as Record<CountryCode, string>;
