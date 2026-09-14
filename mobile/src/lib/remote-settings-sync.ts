import AsyncStorage from '@react-native-async-storage/async-storage';
import { isNetworkOnline } from '@/lib/offline-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export async function fetchAppSetting<T>(key: string): Promise<T | null> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return null;
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
  if (error || data?.value == null) return null;
  return data.value as T;
}

export async function upsertAppSetting(key: string, value: unknown): Promise<void> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return;
  const { error } = await supabase.from('app_settings').upsert({
    key,
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn(`[AppSettings:${key}]`, error.message);
}

export async function loadCachedJson<T>(storageKey: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function saveCachedJson<T>(storageKey: string, value: T): Promise<void> {
  await AsyncStorage.setItem(storageKey, JSON.stringify(value));
}

export function pickNewestByTimestamp<T extends { updatedAt: string }>(local: T, remote: T | null): T {
  if (!remote) return local;
  const localTs = new Date(local.updatedAt).getTime();
  const remoteTs = new Date(remote.updatedAt).getTime();
  if (Number.isNaN(remoteTs) || remoteTs <= localTs) return local;
  return remote;
}
