import { canonicalPhone } from '@/lib/phone-canonical';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Vérifie si un numéro est déjà associé à un compte actif. */
export async function isPhoneNumberTaken(phone: string): Promise<boolean> {
  const normalized = canonicalPhone(phone);
  if (!normalized) return false;

  if (!isSupabaseConfigured() || !supabase) {
    return false;
  }

  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('phone_number', normalized);

  if (error) {
    console.warn('[Auth] Vérification téléphone:', error.message);
    return false;
  }

  return (count ?? 0) > 0;
}
