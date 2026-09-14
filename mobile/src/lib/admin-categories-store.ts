import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeCategoryEmoji } from '@/lib/category-emoji-utils';
import { isNetworkOnline } from '@/lib/offline-store';
import { removeInactiveCategoryRegistry, syncInactiveCategoryRegistry } from '@/lib/inactive-category-registry';
import { loadCachedJson, saveCachedJson } from '@/lib/remote-settings-sync';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type ContentCategoryKind = 'event' | 'spot' | 'tool';

export interface AdminCategory {
  id: string;
  kind: ContentCategoryKind;
  label: string;
  emoji: string;
  isActive: boolean;
  sortOrder: number;
  isBuiltin: boolean;
  createdAt: string;
  updatedAt: string;
}

const CACHE_KEY = 'loop_admin_categories_v3';

let memoryCategories: AdminCategory[] | null = null;

export function getCachedAdminCategories(): AdminCategory[] | null {
  return memoryCategories;
}

export function invalidateAdminCategoriesMemory(): void {
  memoryCategories = null;
}
const LEGACY_CACHE_KEYS = ['loop_admin_categories_v1', 'loop_admin_categories_v2'];
const CACHE_SCHEMA_KEY = 'loop_categories_cache_schema';
const CACHE_SCHEMA_VERSION = '3';

/** Purge les anciennes clés AsyncStorage (catégories fantômes). */
export async function purgeLegacyCategoryCaches(): Promise<void> {
  for (const key of LEGACY_CACHE_KEYS) {
    await AsyncStorage.removeItem(key);
  }
}

/** À appeler au démarrage — invalide le cache local si schéma changé. */
export async function bootstrapCategoryStore(): Promise<void> {
  const current = await AsyncStorage.getItem(CACHE_SCHEMA_KEY);
  if (current === CACHE_SCHEMA_VERSION) return;
  memoryCategories = null;
  await purgeLegacyCategoryCaches();
  await AsyncStorage.removeItem(CACHE_KEY);
  memoryCategories = null;
  await AsyncStorage.setItem(CACHE_SCHEMA_KEY, CACHE_SCHEMA_VERSION);
}

function now() {
  return new Date().toISOString();
}

type DbRow = {
  id: string;
  kind: ContentCategoryKind;
  slug: string;
  label: string;
  emoji: string;
  is_active: boolean;
  sort_order: number;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
};

function rowToCategory(row: DbRow): AdminCategory {
  return {
    id: row.slug,
    kind: row.kind,
    label: row.label,
    emoji: row.emoji,
    isActive: row.is_active,
    sortOrder: row.sort_order,
    isBuiltin: row.is_builtin,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function categoryToRow(item: AdminCategory): Omit<DbRow, 'id' | 'created_at'> & { slug: string } {
  return {
    kind: item.kind,
    slug: item.id,
    label: item.label,
    emoji: item.emoji,
    is_active: item.isActive,
    sort_order: item.sortOrder,
    is_builtin: item.isBuiltin,
    updated_at: item.updatedAt,
  };
}

async function fetchRemote(): Promise<AdminCategory[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from('content_categories')
    .select('id, kind, slug, label, emoji, is_active, sort_order, is_builtin, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .limit(200);
  if (error) {
    console.warn('[Categories] fetch:', error.message);
    return null;
  }
  return ((data ?? []) as DbRow[]).map(rowToCategory);
}

async function upsertRemote(item: AdminCategory): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const row = categoryToRow(item);
  const { error } = await supabase.from('content_categories').upsert(
    {
      kind: row.kind,
      slug: row.slug,
      label: row.label,
      emoji: row.emoji,
      is_active: row.is_active,
      sort_order: row.sort_order,
      is_builtin: row.is_builtin,
      updated_at: row.updated_at,
    },
    { onConflict: 'kind,slug' },
  );
  if (error) console.warn('[Categories] upsert:', error.message);
}

async function deleteRemote(kind: ContentCategoryKind, slug: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const { error } = await supabase.from('content_categories').delete().eq('kind', kind).eq('slug', slug);
  if (error) throw new Error(error.message);
}

async function refreshCategoriesFromRemote(): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const online = await isNetworkOnline();
  if (!online) return;
  const remote = await fetchRemote();
  if (remote !== null) {
    memoryCategories = remote;
    await saveCachedJson(CACHE_KEY, remote);
  }
}

async function loadAll(forceRemote = false): Promise<AdminCategory[]> {
  await bootstrapCategoryStore();

  if (!forceRemote && memoryCategories) {
    void refreshCategoriesFromRemote();
    return memoryCategories;
  }

  const cached = memoryCategories ?? (await loadCachedJson<AdminCategory[]>(CACHE_KEY));
  if (cached?.length && !forceRemote) {
    memoryCategories = cached;
    void refreshCategoriesFromRemote();
    return cached;
  }

  if (isSupabaseConfigured() && supabase) {
    const online = await isNetworkOnline();
    if (online) {
      const remote = await fetchRemote();
      if (remote !== null) {
        memoryCategories = remote;
        await saveCachedJson(CACHE_KEY, remote);
        return remote;
      }
    }
  }

  memoryCategories = cached ?? [];
  return memoryCategories;
}

async function saveAll(items: AdminCategory[]): Promise<void> {
  memoryCategories = items;
  await saveCachedJson(CACHE_KEY, items);
  for (const item of items) {
    await upsertRemote(item);
  }
}

export async function listAdminCategories(kind?: ContentCategoryKind, activeOnly = false): Promise<AdminCategory[]> {
  let items = await loadAll();
  if (kind) items = items.filter((c) => c.kind === kind);
  if (activeOnly) items = items.filter((c) => c.isActive);
  return items.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'fr'));
}

export async function getCategoryLabelMap(kind: ContentCategoryKind): Promise<Record<string, string>> {
  const items = await listAdminCategories(kind, true);
  return Object.fromEntries(items.map((c) => [c.id, c.label]));
}

export async function getCategoryOptions(
  kind: ContentCategoryKind,
  options?: { activeOnly?: boolean; forceRemote?: boolean },
): Promise<Array<{ id: string; label: string; emoji: string }>> {
  const activeOnly = options?.activeOnly !== false;
  const items = options?.forceRemote
    ? (await loadAll(true)).filter((c) => c.kind === kind && (activeOnly ? c.isActive : true))
    : await listAdminCategories(kind, activeOnly);
  return items
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'fr'))
    .map((c) => ({ id: c.id, label: c.label.trim() || c.id, emoji: c.emoji }));
}

export async function addAdminCategory(kind: ContentCategoryKind, label: string, emoji = '🏷️'): Promise<AdminCategory> {
  const items = await loadAll();
  const id = `custom-${kind}-${Date.now()}`;
  const item: AdminCategory = {
    id,
    kind,
    label: label.trim(),
    emoji: normalizeCategoryEmoji(emoji),
    isActive: true,
    sortOrder: items.filter((c) => c.kind === kind).length,
    isBuiltin: false,
    createdAt: now(),
    updatedAt: now(),
  };
  items.push(item);
  await saveAll(items);
  return item;
}

export async function updateAdminCategory(
  id: string,
  patch: Partial<Pick<AdminCategory, 'label' | 'emoji' | 'isActive' | 'sortOrder'>>,
): Promise<AdminCategory | null> {
  const items = await loadAll();
  const idx = items.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  const previous = items[idx];
  const patchEmoji = patch.emoji !== undefined ? normalizeCategoryEmoji(patch.emoji) : undefined;
  items[idx] = { ...previous, ...patch, ...(patchEmoji !== undefined ? { emoji: patchEmoji } : {}), updatedAt: now() };
  memoryCategories = items;
  await saveCachedJson(CACHE_KEY, items);
  if (patch.isActive !== undefined) {
    await syncInactiveCategoryRegistry(
      items[idx].kind,
      items[idx].id,
      items[idx].label,
      items[idx].isActive,
    );
  }
  await upsertRemote(items[idx]);
  return items[idx];
}

export async function getActiveCategorySlugs(kind: ContentCategoryKind): Promise<Set<string>> {
  const items = await listAdminCategories(kind, true);
  return new Set(items.map((c) => c.id));
}

export async function getActiveCategoryLabels(kind: ContentCategoryKind): Promise<Set<string>> {
  const items = await listAdminCategories(kind, true);
  return new Set(items.map((c) => c.label));
}

export async function setAdminCategoryActive(id: string, isActive: boolean): Promise<AdminCategory | null> {
  return updateAdminCategory(id, { isActive });
}

export async function deleteAdminCategory(id: string): Promise<boolean> {
  return deactivateAdminCategory(id);
}

export async function deactivateAdminCategory(id: string): Promise<boolean> {
  const updated = await updateAdminCategory(id, { isActive: false });
  return updated != null;
}

/** @deprecated Utiliser deactivateAdminCategory */
export async function archiveAdminCategory(id: string): Promise<boolean> {
  return deactivateAdminCategory(id);
}

export async function removeAdminCategoryPermanently(id: string): Promise<boolean> {
  const items = await loadAll();
  const idx = items.findIndex((c) => c.id === id);
  if (idx < 0) return false;
  const { kind } = items[idx];
  items.splice(idx, 1);
  try {
    await deleteRemote(kind, id);
  } catch (err) {
    console.warn('[Categories] delete:', err);
    return false;
  }
  await removeInactiveCategoryRegistry(kind, id);
  memoryCategories = items;
  await saveCachedJson(CACHE_KEY, items);
  return true;
}

export const CATEGORY_KIND_LABELS: Record<ContentCategoryKind, string> = {
  event: 'Événements',
  spot: 'Spots',
  tool: 'Outils',
};

/** Aligné sur supabase/scripts/seed_platform_defaults.sql */
function buildBuiltinCategories(): AdminCategory[] {
  const ts = now();
  const row = (
    id: string,
    kind: ContentCategoryKind,
    label: string,
    emoji: string,
    sortOrder: number,
  ): AdminCategory => ({
    id,
    kind,
    label,
    emoji,
    isActive: true,
    sortOrder,
    isBuiltin: true,
    createdAt: ts,
    updatedAt: ts,
  });

  return [
    row('corporate', 'event', 'Corporate', '💼', 0),
    row('nightlife', 'event', 'Nightlife', '🌙', 1),
    row('art_culture', 'event', 'Art & Culture', '🎨', 2),
    row('gastronomie', 'event', 'Gastronomie', '🍽️', 3),
    row('fine_dining', 'spot', 'Fine Dining', '🍽️', 0),
    row('hotels', 'spot', 'Hôtels', '🏨', 1),
    row('bars_lounges', 'spot', 'Bars & Lounges', '🍸', 2),
    row('tool-productivite', 'tool', 'Productivité', '🛠️', 0),
    row('tool-finance', 'tool', 'Finance', '🛠️', 1),
    row('tool-commerce', 'tool', 'Commerce', '🛠️', 2),
    row('tool-social', 'tool', 'Social', '🛠️', 3),
    row('tool-sante', 'tool', 'Santé', '🛠️', 4),
    row('tool-education', 'tool', 'Éducation', '🛠️', 5),
    row('tool-autre', 'tool', 'Autre', '🛠️', 6),
  ];
}

/** Vide toutes les catégories (BDD + cache local). */
export async function clearAllCategories(): Promise<void> {
  await purgeLegacyCategoryCaches();
  await AsyncStorage.removeItem(CACHE_KEY);
  memoryCategories = null;

  if (isSupabaseConfigured() && supabase && (await isNetworkOnline())) {
    const { error } = await supabase.from('content_categories').delete().neq('slug', '');
    if (error) throw new Error(error.message);
  }
}

/**
 * Supprime tout (custom + intégrées) puis réinsère les 14 catégories intégrées en BDD.
 * Ne repasse jamais par l'ancien cache AsyncStorage.
 */
export async function resetAdminCategoriesToDefaults(): Promise<AdminCategory[]> {
  const builtins = buildBuiltinCategories();

  await purgeLegacyCategoryCaches();
  await AsyncStorage.removeItem(CACHE_KEY);
  memoryCategories = null;

  if (isSupabaseConfigured() && supabase && (await isNetworkOnline())) {
    const { error: delError } = await supabase.from('content_categories').delete().neq('slug', '');
    if (delError) throw new Error(`Suppression BDD : ${delError.message}`);

    const { error: insError } = await supabase.from('content_categories').insert(
      builtins.map((item) => ({
        kind: item.kind,
        slug: item.id,
        label: item.label,
        emoji: item.emoji,
        is_active: true,
        sort_order: item.sortOrder,
        is_builtin: true,
        updated_at: item.updatedAt,
      })),
    );
    if (insError) throw new Error(`Réinsertion BDD : ${insError.message}`);
  }

  await saveCachedJson(CACHE_KEY, builtins);
  memoryCategories = builtins;
  return builtins;
}
