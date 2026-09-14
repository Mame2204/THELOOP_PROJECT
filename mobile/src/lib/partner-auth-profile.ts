import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Téléphone du compte connecté (connexion e-mail / mot de passe). */
export async function resolveAuthUserPhone(): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) return null;

  const { data } = await supabase
    .from('users')
    .select('phone_number')
    .eq('id', userId)
    .maybeSingle();

  const phone = data?.phone_number ? String(data.phone_number).trim() : '';
  return phone || null;
}
