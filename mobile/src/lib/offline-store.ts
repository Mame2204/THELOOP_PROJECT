import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured } from '@/lib/supabase';

export const SYSTEM_UNAVAILABLE_MESSAGE =
  'Connexion limitée — vos données locales restent disponibles.';

let lastOnlineProbe: boolean | null = null;
let lastProbeAt = 0;
let consecutiveProbeFailures = 0;
const PROBE_TTL_MS = 20_000;
const PROBE_TIMEOUT_MS = 8_000;
/** Évite le bandeau « hors ligne » sur une micro-coupure réseau. */
const FAILURES_BEFORE_OFFLINE = 2;

/** Réinitialise le cache réseau après une opération Supabase réussie. */
export function markNetworkReachable(): void {
  lastOnlineProbe = true;
  lastProbeAt = Date.now();
  consecutiveProbeFailures = 0;
}

export async function isNetworkOnline(force = false): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;

  const now = Date.now();
  if (!force && lastOnlineProbe !== null && now - lastProbeAt < PROBE_TTL_MS) {
    return lastOnlineProbe;
  }

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    lastOnlineProbe = false;
    lastProbeAt = now;
    return false;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: key },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const online = res.ok || res.status === 401 || res.status === 404;
    if (online) {
      consecutiveProbeFailures = 0;
      lastOnlineProbe = true;
    } else {
      consecutiveProbeFailures += 1;
      lastOnlineProbe =
        consecutiveProbeFailures >= FAILURES_BEFORE_OFFLINE ? false : (lastOnlineProbe ?? true);
    }
    lastProbeAt = now;
    return lastOnlineProbe;
  } catch {
    consecutiveProbeFailures += 1;
    lastOnlineProbe =
      consecutiveProbeFailures >= FAILURES_BEFORE_OFFLINE ? false : (lastOnlineProbe ?? true);
    lastProbeAt = now;
    return lastOnlineProbe;
  }
}

export async function readLocalCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeLocalCache<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function clearLocalCache(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
