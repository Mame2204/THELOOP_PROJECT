/** Validation e-mail et garde-fous inscription (anti-spam / domaines jetables). */

const EMAIL_FORMAT =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

/** Domaines jetables / temporaires fréquents — liste non exhaustive, extensible côté SQL. */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.net',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'yopmail.com',
  'throwaway.email',
  'trashmail.com',
  'getnada.com',
  'sharklasers.com',
  'dispostable.com',
  'maildrop.cc',
  'fakeinbox.com',
  'mintemail.com',
  'emailondeck.com',
  'tempail.com',
  'moakt.com',
  'mailnesia.com',
]);

export const EMAIL_VERIFICATION_REQUIRED_PREFIX = 'EMAIL_VERIFICATION_REQUIRED:';

export function normalizeEmail(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function extractEmailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 0) return '';
  return email.slice(at + 1).toLowerCase();
}

export function isValidEmailFormat(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 254) return false;
  return EMAIL_FORMAT.test(normalized);
}

export function isSyntheticPhoneEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  return /^[0-9]+@theloop\.gn$/i.test(normalized);
}

export function isDisposableEmailDomain(email: string): boolean {
  const domain = extractEmailDomain(normalizeEmail(email));
  if (!domain) return false;
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return true;
  const parts = domain.split('.');
  if (parts.length >= 2) {
    const base = parts.slice(-2).join('.');
    if (DISPOSABLE_EMAIL_DOMAINS.has(base)) return true;
  }
  return false;
}

export function isStrongEnoughPassword(password: string): boolean {
  if (password.length < 8) return false;
  return /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
}

export type SignupEmailValidationResult =
  | { ok: true; email: string }
  | { ok: false; message: string };

/** Valide un e-mail avant inscription. */
export function validateSignupEmail(raw: string): SignupEmailValidationResult {
  const email = normalizeEmail(raw);
  if (!email) {
    return { ok: false, message: 'Indiquez votre adresse e-mail.' };
  }
  if (!isValidEmailFormat(email)) {
    return { ok: false, message: 'Adresse e-mail invalide.' };
  }
  if (isSyntheticPhoneEmail(email)) {
    return {
      ok: false,
      message: 'Utilisez une adresse e-mail personnelle. L\'inscription par numéro seule n\'est plus disponible.',
    };
  }
  if (isDisposableEmailDomain(email)) {
    return {
      ok: false,
      message: 'Les adresses e-mail temporaires ne sont pas autorisées.',
    };
  }
  return { ok: true, email };
}

export function validateSignupPassword(password: string, confirm: string): string | null {
  if (!isStrongEnoughPassword(password)) {
    return 'Mot de passe : minimum 8 caractères, avec au moins une lettre et un chiffre.';
  }
  if (password !== confirm) {
    return 'Les deux mots de passe ne correspondent pas.';
  }
  return null;
}

export function emailVerificationRequiredMessage(detail?: string): string {
  return `${EMAIL_VERIFICATION_REQUIRED_PREFIX}${detail ?? 'Un e-mail de confirmation vient de vous être envoyé. Ouvrez le lien pour activer votre compte, puis reconnectez-vous.'}`;
}

export function isEmailVerificationRequiredError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.startsWith(EMAIL_VERIFICATION_REQUIRED_PREFIX);
}

export function emailVerificationUserMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith(EMAIL_VERIFICATION_REQUIRED_PREFIX)) {
    return msg.slice(EMAIL_VERIFICATION_REQUIRED_PREFIX.length);
  }
  return 'Vérifiez votre boîte mail pour activer votre compte.';
}

export function accountCountryHint(countryLabel: string): string {
  return `Pays du compte : ${countryLabel}. Il détermine le contenu affiché (Agenda, Spots, Outils). Distinct de l'indicatif téléphone ou du pays exploré en vacances.`;
}
