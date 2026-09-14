import type { AppPaymentMethod } from './djomy.js';

/** Format payeur MSISDN exigé par Djomy gateway (doc : numéro de téléphone obligatoire). */
export const DJOMY_SANDBOX_TEST_PAYER = '00224623707722';

/** Comptes wallet sandbox — à saisir sur le portail Djomy, PAS comme payerNumber API. */
export const DJOMY_SANDBOX_WALLET_ACCOUNTS = new Set(['537417414', '622356781']);

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** Extrait 9 chiffres locaux Guinée si possible. */
export function extractGuineaLocal9(raw: string): string {
  const digits = digitsOnly(raw);
  if (!digits) return '';
  if (digits.startsWith('00224') && digits.length >= 14) return digits.slice(5, 14);
  if (digits.startsWith('224') && digits.length >= 12) return digits.slice(3, 12);
  if (digits.startsWith('0') && digits.length >= 10) return digits.slice(1, 10);
  if (digits.length === 9) return digits;
  if (digits.length > 9) return digits.slice(-9);
  return digits;
}

export function normalizePayerPhoneForDjomy(raw: string): string {
  const digits = digitsOnly(raw);
  if (!digits) return '';

  if (digits.startsWith('00224') && digits.length >= 14) {
    return digits.slice(0, 14);
  }

  const local = extractGuineaLocal9(raw);
  if (local.length !== 9) {
    return digits.startsWith('224') ? `00${digits}` : digits;
  }

  return `00224${local}`;
}

/**
 * Identifiant payeur pour create_payment_gateway.
 * Djomy exige un **numéro de téléphone** (préremplissage portail).
 * Les comptes test PayCard / Soutra se saisissent ensuite sur le portail (OTP/PIN).
 * Si l’utilisateur a collé un compte wallet dans le champ, on le remplace par le MSISDN sandbox.
 */
export function normalizePayerIdentifierForDjomy(
  raw: string,
  _method: AppPaymentMethod,
): string {
  const local9 = extractGuineaLocal9(raw);
  if (DJOMY_SANDBOX_WALLET_ACCOUNTS.has(local9)) {
    return DJOMY_SANDBOX_TEST_PAYER;
  }
  return normalizePayerPhoneForDjomy(raw);
}

/** Affichage local Guinée (9 chiffres). */
export function formatGuineaLocalPhone(djomyPhone: string): string {
  const local = extractGuineaLocal9(djomyPhone);
  return local.length === 9 ? local : djomyPhone;
}
