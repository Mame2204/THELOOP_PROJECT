import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { clearOperationalDeviceCache } from '@/lib/device-operational-cache';
import { invalidateContentCache, clearPersistedContentCache } from '@/lib/content-store';
import { invalidateLoopWalksCache } from '@/lib/loop-walks-store';
import { invalidateHomePartnerLogosCache } from '@/lib/home-partners-store';
import { invalidateAppSectionsCache } from '@/lib/app-sections-store';
import { clearAllScopedMemory, invalidateScope, scopedStorageKey } from '@/lib/swr-cache';
import { isNetworkOnline, markNetworkReachable } from '@/lib/offline-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { DbTableName } from '@/lib/supabase-types';

type SupabaseCountQuery = ReturnType<ReturnType<NonNullable<typeof supabase>['from']>['select']>;

const ACCUEIL_SCOPES = ['GN', 'SN', '__ALL__'] as const;

const DEMO_ACCUEIL_KEYS = [
  'loop_home_poll_demo',
  'loop_home_poll_votes_demo',
  'loop_walks_demo_v5',
  'loop_creator_corner_demo_v2',
  'loop_chronique_demo_v4',
  'loop_chronique_demo_v3',
  'loop_chronique_demo_v2',
  'loop_chronique_demo_v1',
];

const ADMIN_DEVICE_CACHE_KEYS = [
  'loop_admin_notifications_v3',
  'loop_admin_notifications_v2',
  'loop_admin_home_polls_v1',
  'loop_admin_creator_corner_v1',
  'loop_admin_chronique_v1',
  'loop_admin_home_logos_v1',
];

const ADMIN_CACHE_PREFIXES = [
  'loop_admin_accueil_v1',
];

const PUBLIC_CACHE_PREFIXES = [
  'loop_content_snapshot',
  'loop_home_poll_snapshot',
  'loop_walks_published',
  'loop_creator_corner_active',
  'loop_chronique_active',
  'loop_home_partner_logos',
  'loop_demo_favorites',
  'loop_partner_staging',
  'loop_admin_featured',
  'loop_local_favorite_counts',
];

async function headCount(
  table: string,
  applyFilter?: (q: SupabaseCountQuery) => SupabaseCountQuery,
): Promise<number | null> {
  if (!supabase) return null;
  try {
    let query = supabase.from(table as DbTableName).select('id', { count: 'exact', head: true }) as SupabaseCountQuery;
    if (applyFilter) query = applyFilter(query);
    const { count, error } = await query;
    if (error) {
      console.warn(`[CacheReconcile] ${table}:`, error.message);
      return null;
    }
    return count ?? 0;
  } catch {
    return null;
  }
}

async function probeRemotePublicEmpty(): Promise<boolean | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  if (!(await isNetworkOnline())) return null;

  const [events, spots, tools, polls, walks, corners, chroniques] = await Promise.all([
    headCount('events', (q) => q.eq('is_active', true).eq('content_status', 'published')),
    headCount('establishments', (q) => q.eq('is_active', true).eq('content_status', 'published')),
    headCount('tools', (q) => q.eq('is_active', true).eq('content_status', 'published')),
    headCount('home_polls', (q) => q.eq('is_active', true)),
    headCount('loop_walks', (q) => q.eq('is_published', true)),
    headCount('creator_corner_features', (q) => q.eq('is_active', true)),
    headCount('chronique_features', (q) => q.eq('is_active', true)),
  ]);

  if ([events, spots, tools, polls, walks, corners, chroniques].some((n) => n === null)) {
    return null;
  }

  markNetworkReachable();
  return (
    (events ?? 0) +
      (spots ?? 0) +
      (tools ?? 0) +
      (polls ?? 0) +
      (walks ?? 0) +
      (corners ?? 0) +
      (chroniques ?? 0) ===
    0
  );
}

export function invalidateAccueilScopedCaches(): void {
  for (const scope of ACCUEIL_SCOPES) {
    invalidateScope(scope, scopedStorageKey('loop_home_poll_snapshot_v1', scope));
    invalidateScope(scope, scopedStorageKey('loop_walks_published_v1', scope));
    invalidateScope(`creator_corner_${scope}`, scopedStorageKey('loop_creator_corner_active_v1', scope));
    invalidateScope(`chronique_${scope}`, scopedStorageKey('loop_chronique_active_v4', scope));
    invalidateScope(`chronique_${scope}`, scopedStorageKey('loop_chronique_active_v3', scope));
    invalidateScope(`chronique_${scope}`, scopedStorageKey('loop_chronique_active_v2', scope));
    invalidateScope(`chronique_${scope}`, scopedStorageKey('loop_chronique_active_v1', scope));
    // Anciennes clés mémoire (collision Corner/Chronique sur le code pays seul).
    invalidateScope(scope);
    invalidateScope(`home_logos_${scope}`, scopedStorageKey('loop_home_partner_logos_v3', scope));
    invalidateScope(`home_logos_${scope}`, scopedStorageKey('loop_home_partner_logos_v2', scope));
    invalidateScope(scope, scopedStorageKey('loop_home_partner_logos_v1', scope));
  }
  invalidateLoopWalksCache();
  invalidateHomePartnerLogosCache();
  invalidateHomePartnerLogosCache('GN');
  invalidateHomePartnerLogosCache('SN');
  invalidateAppSectionsCache(DEFAULT_COUNTRY_CODE);
  invalidateAppSectionsCache('SN');
}

/** Vide catalogue public + accueil + caches opérationnels et admin sur l'appareil. */
export async function clearAllPublicDeviceCaches(): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const extra = allKeys.filter(
    (key) =>
      DEMO_ACCUEIL_KEYS.includes(key)
      || ADMIN_DEVICE_CACHE_KEYS.includes(key)
      || PUBLIC_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))
      || ADMIN_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)),
  );

  invalidateContentCache();
  invalidateAccueilScopedCaches();
  clearAllScopedMemory();

  await Promise.all([
    clearPersistedContentCache(),
    clearOperationalDeviceCache(),
    AsyncStorage.multiRemove([...extra, ...DEMO_ACCUEIL_KEYS, ...ADMIN_DEVICE_CACHE_KEYS]),
  ]);
}

/**
 * Après purge Supabase : si le cloud est vide mais le téléphone a encore du cache,
 * on purge le local pour aligner iPhone / Android.
 */
export async function reconcilePublicCachesWithRemote(): Promise<boolean> {
  const remoteEmpty = await probeRemotePublicEmpty();
  if (remoteEmpty !== true) return false;

  const raw = await AsyncStorage.getItem('loop_content_snapshot_v1');
  let localCatalog = false;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { events?: unknown[]; locations?: unknown[] };
      localCatalog =
        (Array.isArray(parsed.events) && parsed.events.length > 0)
        || (Array.isArray(parsed.locations) && parsed.locations.length > 0);
    } catch {
      localCatalog = true;
    }
  }

  const accueilKeys = await AsyncStorage.getAllKeys();
  const localAccueil = accueilKeys.some(
    (key) =>
      key.startsWith('loop_home_poll_snapshot')
      || key.startsWith('loop_walks_published')
      || key.startsWith('loop_creator_corner_active')
      || key.startsWith('loop_chronique_active')
      || key.startsWith('loop_admin_accueil_v1')
      || key.startsWith('loop_admin_notifications')
      || DEMO_ACCUEIL_KEYS.includes(key)
      || ADMIN_DEVICE_CACHE_KEYS.includes(key),
  );

  if (!localCatalog && !localAccueil) {
    invalidateContentCache();
    invalidateAccueilScopedCaches();
    return false;
  }

  console.log('[CacheReconcile] Cloud vide — purge cache local public');
  await clearAllPublicDeviceCaches();
  return true;
}
