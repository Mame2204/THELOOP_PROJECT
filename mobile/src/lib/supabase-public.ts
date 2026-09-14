import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let publicClient: SupabaseClient | null = null;

/**
 * Client Supabase sans session JWT — rôle `anon` uniquement.
 * Utilisé pour la validation partenaire : évite que la session partenaire
 * connectée bloque la lecture des avantages du membre scanné (RLS).
 */
export function getSupabasePublic(): SupabaseClient | null {
  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    supabaseUrl.includes('your-project') ||
    supabaseAnonKey.includes('your-anon-key')
  ) {
    return null;
  }
  if (!publicClient) {
    publicClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      db: { schema: 'public' },
    });
  }
  return publicClient;
}
