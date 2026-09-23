import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  console.warn('[admin-web] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants');
}

export const supabase = createClient(url ?? '', anon ?? '');

export async function getAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  const session = data.session;
  if (!session?.access_token) return null;

  const expiresAt = session.expires_at;
  if (typeof expiresAt === 'number') {
    const secondsLeft = expiresAt - Math.floor(Date.now() / 1000);
    if (secondsLeft > 120) {
      return session.access_token;
    }
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  if (!refreshError && refreshed.session?.access_token) {
    return refreshed.session.access_token;
  }

  return session.access_token;
}
