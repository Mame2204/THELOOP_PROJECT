import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const TOUCH_KEY = 'loop_last_seen_touch_at';
/** Évite un update SQL à chaque focus d’écran (egress). */
const TOUCH_MIN_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Activité app + connexion Auth sur public.users (migrations 20260914 + 20260946).
 * lastSignInAt = session Supabase Auth (login MDP/OTP).
 */
export async function touchUserAuthPresence(
  userId: string,
  lastSignInAt: string | null | undefined,
): Promise<void> {
  if (!userId || userId === 'anonymous') return;
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    const raw = await AsyncStorage.getItem(TOUCH_KEY);
    const prev = raw ? Number(raw) : 0;
    if (Number.isFinite(prev) && Date.now() - prev < TOUCH_MIN_INTERVAL_MS) return;

    const now = new Date().toISOString();
    const patch: { last_seen_at: string; updated_at: string; auth_last_sign_in_at?: string } = {
      last_seen_at: now,
      updated_at: now,
    };
    if (lastSignInAt) {
      patch.auth_last_sign_in_at = lastSignInAt;
    }

    const { error } = await supabase.from('users').update(patch).eq('id', userId);

    if (error) {
      if (/last_seen_at|auth_last_sign_in_at/i.test(error.message)) return;
      console.warn('[activity] présence:', error.message);
      return;
    }

    await AsyncStorage.setItem(TOUCH_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** @deprecated Utiliser touchUserAuthPresence avec last_sign_in_at session. */
export async function touchUserLastSeen(userId: string): Promise<void> {
  await touchUserAuthPresence(userId, undefined);
}
