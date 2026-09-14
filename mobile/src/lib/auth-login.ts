import { normalizeEmail, validateSignupEmail } from '@/lib/email-auth';
import { checkSignupEmailAvailability, type SignupEmailAvailability } from '@/lib/email-account';
import { normalizePhone, syntheticEmailFromPhone } from '@/lib/otp-auth';
import type { SupabaseClient } from '@supabase/supabase-js';

export type LoginEmailPrecheck =
  | { kind: 'invalid'; message: string }
  | { kind: 'not_found' }
  | { kind: 'pending_confirmation' }
  | { kind: 'ready' };

/** Vérifie si l'e-mail correspond à un compte avant tentative de mot de passe. */
export async function precheckLoginEmail(email: string): Promise<LoginEmailPrecheck> {
  const emailCheck = validateSignupEmail(email);
  if (!emailCheck.ok) {
    return { kind: 'invalid', message: emailCheck.message };
  }

  const status = await checkSignupEmailAvailability(emailCheck.email);
  return mapSignupStatusToLoginPrecheck(status);
}

export function mapSignupStatusToLoginPrecheck(status: SignupEmailAvailability): LoginEmailPrecheck {
  switch (status) {
    case 'already_registered':
      return { kind: 'ready' };
    case 'pending_confirmation':
      return { kind: 'pending_confirmation' };
    case 'invalid':
      return { kind: 'invalid', message: 'Adresse e-mail invalide.' };
    case 'synthetic_blocked':
      return { kind: 'invalid', message: 'Cette adresse e-mail n\'est pas autorisée.' };
    case 'unknown':
      return { kind: 'ready' };
    case 'available':
    default:
      return { kind: 'not_found' };
  }
}

export function isWrongPasswordLoginError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    msg.includes('invalid login credentials')
    || msg.includes('invalid credentials')
    || msg.includes('mot de passe incorrect')
    || msg.includes('wrong password')
  );
}

/** E-mails Auth à essayer : profil public puis legacy @theloop.gn (comptes téléphone). */
export function buildAuthLoginEmailCandidates(
  publicEmail: string | null | undefined,
  phone?: string | null,
): string[] {
  const out: string[] = [];
  const normalized = publicEmail ? normalizeEmail(publicEmail) : '';
  if (normalized) out.push(normalized);

  if (phone) {
    const synthetic = syntheticEmailFromPhone(normalizePhone(phone));
    if (synthetic && !out.includes(synthetic)) out.push(synthetic);
  }

  return out;
}

export async function resolveAuthLoginEmailCandidates(
  supabase: SupabaseClient,
  primaryEmail: string,
  phone?: string | null,
): Promise<string[]> {
  const normalized = normalizeEmail(primaryEmail);
  let resolvedPhone = phone ? normalizePhone(phone) : null;

  if (!resolvedPhone) {
    const { data } = await supabase
      .from('users')
      .select('phone_number')
      .ilike('email', normalized)
      .maybeSingle();
    if (data?.phone_number) {
      resolvedPhone = normalizePhone(String(data.phone_number));
    }
  }

  return buildAuthLoginEmailCandidates(normalized, resolvedPhone);
}

export function mapAuthEmailSyncError(message: string): string {
  switch (message) {
    case 'email_already_used':
      return 'Cet e-mail est déjà utilisé par un autre compte.';
    case 'auth_user_not_found':
      return 'Compte Auth introuvable — contactez le support.';
    case 'user_not_found':
      return 'Utilisateur introuvable.';
    case 'email_required':
      return 'E-mail requis.';
    case 'email_invalid':
      return 'Adresse e-mail invalide.';
    case 'synthetic_email_blocked':
      return 'Les e-mails @theloop.gn ne sont pas autorisés.';
    case 'forbidden':
      return 'Action réservée aux administrateurs.';
    default:
      return message;
  }
}
