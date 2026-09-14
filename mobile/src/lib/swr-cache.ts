import AsyncStorage from '@react-native-async-storage/async-storage';

const memory = new Map<string, unknown>();
const refreshing = new Set<string>();

export function peekMemory<T>(scope: string): T | null {
  const hit = memory.get(scope);
  return hit !== undefined ? (hit as T) : null;
}

export async function peekDisk<T>(storageKey: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Cache mémoire puis disque — sans réseau. */
export async function peekScoped<T>(scope: string, storageKey: string): Promise<T | null> {
  const mem = peekMemory<T>(scope);
  if (mem !== null) return mem;
  const disk = await peekDisk<T>(storageKey);
  if (disk !== null) memory.set(scope, disk);
  return disk;
}

export async function hydrateScoped<T>(scope: string, storageKey: string, data: T): Promise<void> {
  memory.set(scope, data);
  await AsyncStorage.setItem(storageKey, JSON.stringify(data));
}

/**
 * Ancien SWR : cache local + fetch Supabase en arrière-plan.
 * Désactivé — si le cache existe, on ne relance plus le réseau.
 * Les écrans rechargent via `force: true` (pull-to-refresh / action manuelle).
 */
export function scheduleScopedRefresh<T>(
  _refreshKey: string,
  _fetcher: () => Promise<T | null>,
  _onFresh?: (data: T) => void,
  _persist?: (data: T) => Promise<void>,
): void {
  return;
}

export function invalidateScope(scope: string, storageKey?: string): void {
  memory.delete(scope);
  if (storageKey) void AsyncStorage.removeItem(storageKey);
}

/** Vide les caches mémoire SWR (après purge Supabase / reset appareil). */
export function clearAllScopedMemory(): void {
  memory.clear();
  refreshing.clear();
}

export function scopedStorageKey(prefix: string, scope: string): string {
  return `${prefix}_${scope.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

/** Rejette les entrées cache corrompues (objet/null au lieu d’un tableau). */
export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value : [];
}
