import { supabase } from './supabase';

/** Met à jour activité app + date de connexion Auth sur public.users (admin connecté). */
export async function syncAdminAuthPresence(
  userId: string,
  lastSignInAt: string | null | undefined,
): Promise<void> {
  if (!userId) return;
  const now = new Date().toISOString();
  const patch: Record<string, string> = {
    last_seen_at: now,
    updated_at: now,
  };
  if (lastSignInAt) {
    patch.auth_last_sign_in_at = lastSignInAt;
  }
  const { error } = await supabase.from('users').update(patch).eq('id', userId);
  if (error && !/auth_last_sign_in_at|last_seen_at/i.test(error.message)) {
    console.warn('[admin] syncAuthPresence:', error.message);
  }
}
