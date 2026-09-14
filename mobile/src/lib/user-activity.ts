import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const TOUCH_KEY = 'loop_last_seen_touch_at';
/** Évite un update SQL à chaque focus d’écran (egress). */
const TOUCH_MIN_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Enregistre la dernière activité app sur public.users.last_seen_at
 * (nécessite migration 20260914_admin_monitoring).
 */
export async function touchUserLastSeen(userId: string): Promise<void> {
  if (!userId || userId === 'anonymous') return;
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    const raw = await AsyncStorage.getItem(TOUCH_KEY);
    const prev = raw ? Number(raw) : 0;
    if (Number.isFinite(prev) && Date.now() - prev < TOUCH_MIN_INTERVAL_MS) return;

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('users')
      .update({ last_seen_at: now, updated_at: now })
      .eq('id', userId);

    if (error) {
      // Colonne absente tant que la migration n’est pas appliquée — silencieux.
      if (/last_seen_at/i.test(error.message)) return;
      console.warn('[activity] last_seen_at:', error.message);
      return;
    }

    await AsyncStorage.setItem(TOUCH_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}
