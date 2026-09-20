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
  | 'GH'
  | 'CM';

/** Indicatifs téléphoniques diaspora — distincts du pays de contenu du compte. */
export type DiasporaDialCode = 'FR' | 'US' | 'GB' | 'BE' | 'DE' | 'ES' | 'IT' | 'PT' | 'NL' | 'CA';

export type PhoneDialCode = CountryCode | DiasporaDialCode;

export interface LoopCountry {
  code: CountryCode;
  name: string;
  flag: string;
  callingCode: string;
  /** Longueur du numéro national sans indicatif */
  nationalLength: number;
  /** Préfixes mobiles nationaux autorisés (premier chiffre) */
  mobilePrefixes: string[];
  currency: string;
}

export interface PhoneDialCountry {
  code: PhoneDialCode;
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
  { code: 'CM', name: 'Cameroun', flag: '🇨🇲', callingCode: '237', nationalLength: 9, mobilePrefixes: ['6'], currency: 'XAF' },
];

/** Tous les indicatifs acceptés pour le téléphone (Afrique de l'Ouest + diaspora). */
export const PHONE_DIAL_COUNTRIES: PhoneDialCountry[] = [
  ...LOOP_COUNTRIES.map((c) => ({ ...c, code: c.code as PhoneDialCode })),
  { code: 'FR', name: 'France', flag: '🇫🇷', callingCode: '33', nationalLength: 9, mobilePrefixes: ['6', '7'], currency: 'EUR' },
  { code: 'US', name: 'États-Unis', flag: '🇺🇸', callingCode: '1', nationalLength: 10, mobilePrefixes: ['2', '3', '4', '5', '6', '7', '8', '9'], currency: 'USD' },
  { code: 'GB', name: 'Royaume-Uni', flag: '🇬🇧', callingCode: '44', nationalLength: 10, mobilePrefixes: ['7'], currency: 'GBP' },
  { code: 'BE', name: 'Belgique', flag: '🇧🇪', callingCode: '32', nationalLength: 9, mobilePrefixes: ['4'], currency: 'EUR' },
  { code: 'DE', name: 'Allemagne', flag: '🇩🇪', callingCode: '49', nationalLength: 10, mobilePrefixes: ['1'], currency: 'EUR' },
  { code: 'ES', name: 'Espagne', flag: '🇪🇸', callingCode: '34', nationalLength: 9, mobilePrefixes: ['6', '7'], currency: 'EUR' },
  { code: 'IT', name: 'Italie', flag: '🇮🇹', callingCode: '39', nationalLength: 10, mobilePrefixes: ['3'], currency: 'EUR' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹', callingCode: '351', nationalLength: 9, mobilePrefixes: ['9'], currency: 'EUR' },
  { code: 'NL', name: 'Pays-Bas', flag: '🇳🇱', callingCode: '31', nationalLength: 9, mobilePrefixes: ['6'], currency: 'EUR' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', callingCode: '1', nationalLength: 10, mobilePrefixes: ['2', '3', '4', '5', '6', '7', '8', '9'], currency: 'CAD' },
];

export const DEFAULT_COUNTRY_CODE: CountryCode = 'GN';

const BY_CODE = new Map(LOOP_COUNTRIES.map((c) => [c.code, c]));

/** Valide une chaîne DB / API avant passage aux stores typés CountryCode. */
export function asCountryCode(value: string | null | undefined): CountryCode | undefined {
  if (!value) return undefined;
  return BY_CODE.has(value as CountryCode) ? (value as CountryCode) : undefined;
}

export function countryCodeOrDefault(
  value: string | null | undefined,
  fallback: CountryCode = DEFAULT_COUNTRY_CODE,
): CountryCode {
  return asCountryCode(value) ?? fallback;
}
const BY_DIAL_CODE = new Map(PHONE_DIAL_COUNTRIES.map((c) => [c.code, c]));
const BY_CALLING = [...PHONE_DIAL_COUNTRIES].sort((a, b) => b.callingCode.length - a.callingCode.length);

export function getPhoneDialCountry(code?: string | null): PhoneDialCountry {
  return BY_DIAL_CODE.get((code ?? DEFAULT_COUNTRY_CODE) as PhoneDialCode) ?? BY_DIAL_CODE.get(DEFAULT_COUNTRY_CODE)!;
}

export function detectDialCountryFromPhone(input: string): PhoneDialCountry {
  const digits = input.replace(/\D/g, '');
  for (const country of BY_CALLING) {
    if (digits.startsWith(country.callingCode)) return country;
  }
  return getPhoneDialCountry(DEFAULT_COUNTRY_CODE);
}

export function normalizeInternationalPhone(value: string, dialCode: PhoneDialCode = DEFAULT_COUNTRY_CODE): string {
  const country = getPhoneDialCountry(dialCode);
  const digits = value.replace(/\D/g, '');

  if (digits.startsWith(country.callingCode)) {
    return `+${digits}`;
  }

  if (digits.length >= country.nationalLength - 1) {
    return `+${country.callingCode}${digits}`;
  }

  if (value.trim().startsWith('+')) {
    return `+${digits}`;
  }

  return value.trim();
}

export function isValidInternationalPhone(value: string, dialCode: PhoneDialCode = DEFAULT_COUNTRY_CODE): boolean {
  const country = getPhoneDialCountry(dialCode);
  const normalized = normalizeInternationalPhone(value, dialCode);
  const digits = normalized.replace(/\D/g, '');
  if (!digits.startsWith(country.callingCode)) return false;
  const national = digits.slice(country.callingCode.length);
  if (national.length < country.nationalLength - 1 || national.length > country.nationalLength + 1) return false;
  if (country.mobilePrefixes.length && !country.mobilePrefixes.some((p) => national.startsWith(p))) {
    return national.length >= 8;
  }
  return national.length >= 6;
}

export function internationalPhoneHint(dialCode: PhoneDialCode = DEFAULT_COUNTRY_CODE): string {
  const c = getPhoneDialCountry(dialCode);
  return `+${c.callingCode} ${nationalPhonePlaceholder(dialCode)}`;
}

/** Placeholder national sans indicatif — adapté au pays sélectionné. */
export function nationalPhonePlaceholder(dialCode: PhoneDialCode = DEFAULT_COUNTRY_CODE): string {
  const c = getPhoneDialCountry(dialCode);
  if (dialCode === 'GN') return '620 XXX XXX';
  if (dialCode === 'FR') return '6 XX XX XX XX';
  if (dialCode === 'SN') return '7X XXX XX XX';
  if (dialCode === 'CI') return '07 XX XX XX XX';
  if (dialCode === 'US' || dialCode === 'CA') return '(XXX) XXX-XXXX';
  if (dialCode === 'GB') return '7XXX XXX XXX';
  const prefix = c.mobilePrefixes[0] ?? '6';
  const pad = 'X'.repeat(Math.max(0, c.nationalLength - prefix.length - 2));
  return `${prefix}${pad}`;
}

export function getCountry(code?: string | null): LoopCountry {
  return BY_CODE.get((code ?? DEFAULT_COUNTRY_CODE) as CountryCode) ?? BY_CODE.get(DEFAULT_COUNTRY_CODE)!;
}

export function getCountryName(code?: string | null): string {
  return getCountry(code).name;
}

export function getCountryLabel(code?: string | null): string {
  const c = getCountry(code);
  return `${c.flag} ${c.name}`;
}

export function detectCountryFromPhone(input: string): LoopCountry {
  return getCountry(detectDialCountryFromPhone(input).code);
}

export function normalizePhone(value: string | null | undefined, countryCode: CountryCode = DEFAULT_COUNTRY_CODE): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  const country = getCountry(countryCode);
  const digits = raw.replace(/\D/g, '');

  if (digits.startsWith(country.callingCode)) {
    return `+${digits}`;
  }

  if (digits.length === country.nationalLength) {
    return `+${country.callingCode}${digits}`;
  }

  if (raw.startsWith('+')) {
    return `+${digits}`;
  }

  if (countryCode === 'GN' && digits.length === 9 && digits.startsWith('6')) {
    return `+224${digits}`;
  }

  return raw;
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
  const detected = detectDialCountryFromPhone(phone).code;
  if (BY_CODE.has(detected as CountryCode)) return detected as CountryCode;
  return DEFAULT_COUNTRY_CODE;
}

export const COUNTRY_LABELS: Record<CountryCode, string> = Object.fromEntries(
  LOOP_COUNTRIES.map((c) => [c.code, c.name]),
) as Record<CountryCode, string>;
