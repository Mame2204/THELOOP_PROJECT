import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isPlaceholder =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes('your-project') ||
  supabaseAnonKey.includes('your-anon-key');

export const supabase: SupabaseClient | null = isPlaceholder
  ? null
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      db: {
        schema: 'public',
      },
    });

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

/** Vérifie au démarrage que le client Supabase répond sans erreur. */
export async function validateSupabaseConnection(): Promise<void> {
  if (!supabase) {
    console.log('[Supabase] Mode démo actif — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY non configurés.');
    return;
  }

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error('[Supabase] Erreur de connexion au démarrage :', error.message);
      return;
    }

    const host = new URL(supabaseUrl).host;
    const hasSession = Boolean(data.session);
    console.log(`[Supabase] Client OK — ${host} | session : ${hasSession ? 'active' : 'aucune'}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('[Supabase] Échec de validation au démarrage :', message);
  }
}
