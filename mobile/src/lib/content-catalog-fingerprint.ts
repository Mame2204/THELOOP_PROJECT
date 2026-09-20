import { isNetworkOnline, markNetworkReachable, readLocalCache, writeLocalCache, clearLocalCache } from '@/lib/offline-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type SupabasePublishedQuery = ReturnType<ReturnType<NonNullable<typeof supabase>['from']>['select']>;

export const CONTENT_CATALOG_FINGERPRINT_KEY = 'loop_content_catalog_fingerprint_v1';

type TableSlice = { n: number; rev: string | null };

export function buildFingerprintToken(events: TableSlice, spots: TableSlice, tools: TableSlice): string {
  return `e:${events.n}:${events.rev ?? ''}|s:${spots.n}:${spots.rev ?? ''}|t:${tools.n}:${tools.rev ?? ''}`;
}

async function tableSlice(
  table: 'events' | 'establishments' | 'tools',
  revColumn: 'created_at' | 'updated_at',
  applyExtra?: (q: SupabasePublishedQuery) => SupabasePublishedQuery,
): Promise<TableSlice | null> {
  if (!supabase) return null;
  let base = supabase
    .from(table)
    .select(revColumn, { count: 'exact' })
    .eq('is_active', true)
    .eq('content_status', 'published') as SupabasePublishedQuery;
  if (applyExtra) base = applyExtra(base);
  const { count, data, error } = await base.order(revColumn, { ascending: false }).limit(1);
  if (error) {
    console.warn(`[CatalogFingerprint] ${table}:`, error.message);
    return null;
  }
  markNetworkReachable();
  const row = data?.[0] as Record<string, unknown> | undefined;
  const rev = row?.[revColumn] ? String(row[revColumn]) : null;
  return { n: count ?? 0, rev };
}

/** Fallback client (~3 petites requêtes) si la RPC n’est pas encore déployée. */
async function fetchCatalogFingerprintFallback(): Promise<string | null> {
  const [events, spots, tools] = await Promise.all([
    tableSlice('events', 'created_at'),
    tableSlice('establishments', 'created_at'),
    tableSlice('tools', 'updated_at'),
  ]);
  if (!events || !spots || !tools) return null;
  return buildFingerprintToken(events, spots, tools);
}

/** Empreinte distante du catalogue public — 1 RPC ou fallback léger. */
export async function fetchCatalogFingerprint(): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return null;

  try {
    const { data, error } = await supabase.rpc('get_public_catalog_fingerprint');
    if (!error && typeof data === 'string' && data.trim()) {
      markNetworkReachable();
      return data.trim();
    }
    if (error && !/get_public_catalog_fingerprint|42883|PGRST202/i.test(error.message)) {
      console.warn('[CatalogFingerprint] RPC:', error.message);
    }
  } catch {
    /* fallback */
  }

  return fetchCatalogFingerprintFallback();
}

export async function readCachedCatalogFingerprint(): Promise<string | null> {
  const hit = await readLocalCache<string>(CONTENT_CATALOG_FINGERPRINT_KEY);
  return hit?.trim() ? hit.trim() : null;
}

export async function writeCachedCatalogFingerprint(token: string): Promise<void> {
  await writeLocalCache(CONTENT_CATALOG_FINGERPRINT_KEY, token);
}

export async function clearCachedCatalogFingerprint(): Promise<void> {
  await clearLocalCache(CONTENT_CATALOG_FINGERPRINT_KEY);
}
