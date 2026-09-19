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

  // L'écriture directe de user_role est refusée par la base depuis la migration
  // 20260928 : le rôle est recalculé côté serveur à partir des PASS réels.
  const { data: applied, error } = await supabase.rpc('sync_my_pass_role', {
    p_desired: dbRole,
  });

  if (error) return false;
  return String(applied ?? current) === dbRole;
}
