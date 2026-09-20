import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

const isPlaceholder =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes('your-project') ||
  supabaseAnonKey.includes('your-anon-key');

let client: SupabaseClient<Database> | null = null;

try {
  if (!isPlaceholder && supabaseUrl && supabaseAnonKey) {
    client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        // PKCE : tokens en ?code=… (survit au deep link iOS ; le #access_token est souvent perdu)
        flowType: 'pkce',
      },
      db: { schema: 'public' },
    });
  }
} catch (error) {
  console.error("Erreur critique lors de l'initialisation de Supabase :", error);
}

export const supabase = client;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}