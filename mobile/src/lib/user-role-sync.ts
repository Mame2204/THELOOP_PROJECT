import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const PROTECTED_ROLES = new Set(['admin', 'super_admin', 'partner']);

/** Lit le rôle courant en base (source de vérité pour éviter re-promotion locale). */
export async function fetchUserDbRole(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from('users')
    .select('user_role')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return String(data.user_role ?? 'member');
}

/** Lit le verrou gel admin Prime → membre en base. */
export async function fetchUserPrimeRoleLocked(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { data, error } = await supabase
    .from('users')
    .select('prime_role_locked')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return false;
  return data.prime_role_locked === true;
}

/** Aligne `users.user_role` Supabase avec le statut PASS (sans toucher admin / partenaire). */
export async function syncUserDbRoleIfNeeded(
  userId: string,
  dbRole: 'prime' | 'member',
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;

  const { data, error: readError } = await supabase
    .from('users')
    .select('user_role')
    .eq('id', userId)
    .maybeSingle();

  if (readError || !data) return false;

  const current = String(data.user_role ?? 'member');
  if (PROTECTED_ROLES.has(current)) return false;
  if (current === dbRole) return false;

  const { error } = await supabase
    .from('users')
    .update({
      user_role: dbRole,
      updated_at: new Date().toISOString(),
      ...(dbRole === 'prime' ? { prime_role_locked: false } : {}),
    })
    .eq('id', userId);

  return !error;
}
