/** Format payeur exigé par Djomy (doc : 00224623707722). */
export const DJOMY_SANDBOX_TEST_PAYER = '00224623707722';

export function normalizePayerPhoneForDjomy(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('00224') && digits.length >= 14) {
    return digits.slice(0, 14);
  }

  let local = digits;
  if (local.startsWith('224') && local.length >= 12) {
    local = local.slice(3, 12);
  } else if (local.startsWith('0') && local.length >= 10) {
    local = local.slice(1, 10);
  } else if (local.length > 9) {
    local = local.slice(-9);
  }

  if (local.length !== 9) {
    return digits.startsWith('224') ? `00${digits}` : digits;
  }

  return `00224${local}`;
}

/** Affichage local Guinée (9 chiffres). */
export function formatGuineaLocalPhone(djomyPhone: string): string {
  const digits = djomyPhone.replace(/\D/g, '');
  const local = digits.startsWith('00224')
    ? digits.slice(5, 14)
    : digits.startsWith('224')
      ? digits.slice(3, 12)
      : digits.slice(-9);
  return local.length === 9 ? local : djomyPhone;
}
