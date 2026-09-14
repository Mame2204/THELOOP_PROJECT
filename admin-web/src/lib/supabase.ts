import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anon) {
  console.warn('[admin-web] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants');
}

export const supabase = createClient(url ?? '', anon ?? '');

export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
