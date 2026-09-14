import { normalizeEmail } from '@/lib/email-auth';
import { findRegistryUserByEmailOrPhone } from '@/lib/user-registry-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type SignupEmailAvailability =
  | 'available'
  | 'already_registered'
  | 'pending_confirmation'
  | 'invalid'
  | 'synthetic_blocked'
  | 'unknown';

/** Message utilisateur pour un statut d'e-mail inscription. */
export function signupEmailAvailabilityMessage(status: SignupEmailAvailability): string {
  switch (status) {
    case 'already_registered':
      return 'Cet e-mail est déjà associé à un compte THE LOOP. Connectez-vous ou utilisez une autre adresse.';
    case 'pending_confirmation':
      return 'Un compte existe déjà pour cet e-mail mais n\'est pas encore confirmé. Ouvrez le lien reçu par e-mail ou renvoyez la confirmation.';
    case 'invalid':
      return 'Adresse e-mail invalide.';
    case 'synthetic_blocked':
      return 'Cette adresse e-mail n\'est pas autorisée.';
    default:
      return 'Impossible de vérifier cet e-mail pour le moment.';
  }
}

/** Vérifie la disponibilité via RPC Supabase (auth.users + public.users). */
export async function checkSignupEmailAvailability(email: string): Promise<SignupEmailAvailability> {
  const normalized = normalizeEmail(email);
  if (!normalized) return 'invalid';

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase.rpc('check_signup_email_available', {
      p_email: normalized,
    });
    if (!error && typeof data === 'string') {
      const status = data as SignupEmailAvailability;
      if (
        status === 'available'
        || status === 'already_registered'
        || status === 'pending_confirmation'
        || status === 'invalid'
        || status === 'synthetic_blocked'
      ) {
        return status;
      }
    }
    if (error) {
      console.warn('[email-account] check_signup_email_available:', error.message);
      const { data, error: userError } = await supabase
        .from('users')
        .select('id')
        .ilike('email', normalized)
        .maybeSingle();
      if (!userError && data?.id) return 'already_registered';
    }
  }

  const registry = await findRegistryUserByEmailOrPhone(normalized, null);
  if (registry) return 'already_registered';

  return 'unknown';
}

/** E-mail déjà pris (compte confirmé ou profil existant). */
export async function isEmailTaken(email: string): Promise<boolean> {
  const status = await checkSignupEmailAvailability(email);
  return status === 'already_registered' || status === 'pending_confirmation';
}

/** Vérifie qu'un compte existe pour cet e-mail (Supabase ou registre local démo). */
export async function accountExistsForEmail(email: string): Promise<boolean> {
  const status = await checkSignupEmailAvailability(email);
  if (status === 'already_registered') return true;
  if (status === 'pending_confirmation') return true;
  const registry = await findRegistryUserByEmailOrPhone(normalizeEmail(email), null);
  return registry != null;
}

/** Détecte le cas Supabase « user exists » masqué après signUp. */
export function isDuplicateSignUpResponse(user: {
  identities?: { id: string }[] | null;
} | null | undefined): boolean {
  if (!user) return false;
  return !user.identities || user.identities.length === 0;
}

/** Erreurs Auth signUp déjà enregistré. */
export function isSignUpEmailAlreadyUsedError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return (
    msg.includes('email_already_used')
    || msg.includes('email_pending_confirmation')
    || msg.includes('already registered')
    || msg.includes('already been registered')
    || msg.includes('user already registered')
    || msg.includes('duplicate')
  );
}
