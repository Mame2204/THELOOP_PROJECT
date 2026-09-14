export const DEFAULT_COUNTRY_CODE = 'GN';

export const COUNTRY_OPTIONS: { code: string; label: string }[] = [
  { code: 'GN', label: 'Guinée' },
  { code: 'SN', label: 'Sénégal' },
  { code: 'CI', label: "Côte d'Ivoire" },
  { code: 'ML', label: 'Mali' },
  { code: 'BF', label: 'Burkina Faso' },
];

export function getCountryLabel(code: string): string {
  return COUNTRY_OPTIONS.find((c) => c.code === code)?.label ?? code;
}
