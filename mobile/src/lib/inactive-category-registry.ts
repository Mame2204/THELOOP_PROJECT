import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ContentCategoryKind } from '@/lib/admin-categories-store';
import {
  buildCategoryVisibilityFilter,
  normalizeCategoryToken,
  type CategoryVisibilityFilter,
} from '@/lib/category-filter-utils';

const KEY = 'loop_inactive_categories_v1';

export interface InactiveCategoryEntry {
  slug: string;
  label: string;
}

type InactiveRegistry = Record<ContentCategoryKind, InactiveCategoryEntry[]>;

const EMPTY: InactiveRegistry = { event: [], spot: [], tool: [] };

let memoryRegistry: InactiveRegistry | null = null;

function cloneRegistry(registry: InactiveRegistry): InactiveRegistry {
  return {
    event: [...registry.event],
    spot: [...registry.spot],
    tool: [...registry.tool],
  };
}

export function getCachedInactiveRegistry(): InactiveRegistry {
  return memoryRegistry ? cloneRegistry(memoryRegistry) : cloneRegistry(EMPTY);
}

async function readRegistry(): Promise<InactiveRegistry> {
  if (memoryRegistry) return cloneRegistry(memoryRegistry);
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      memoryRegistry = cloneRegistry(EMPTY);
      return cloneRegistry(memoryRegistry);
    }
    const parsed = JSON.parse(raw) as Partial<InactiveRegistry>;
    memoryRegistry = {
      event: Array.isArray(parsed.event) ? parsed.event : [],
      spot: Array.isArray(parsed.spot) ? parsed.spot : [],
      tool: Array.isArray(parsed.tool) ? parsed.tool : [],
    };
    return cloneRegistry(memoryRegistry);
  } catch {
    memoryRegistry = cloneRegistry(EMPTY);
    return cloneRegistry(memoryRegistry);
  }
}

async function writeRegistry(registry: InactiveRegistry): Promise<void> {
  memoryRegistry = cloneRegistry(registry);
  await AsyncStorage.setItem(KEY, JSON.stringify(registry));
}

export async function syncInactiveCategoryRegistry(
  kind: ContentCategoryKind,
  slug: string,
  label: string,
  isActive: boolean,
): Promise<void> {
  const registry = await readRegistry();
  const token = normalizeCategoryToken(slug);
  const list = registry[kind].filter((e) => normalizeCategoryToken(e.slug) !== token);
  if (!isActive) {
    list.push({ slug, label });
  }
  registry[kind] = list;
  await writeRegistry(registry);
}

export async function removeInactiveCategoryRegistry(kind: ContentCategoryKind, slug: string): Promise<void> {
  const registry = await readRegistry();
  const token = normalizeCategoryToken(slug);
  registry[kind] = registry[kind].filter((e) => normalizeCategoryToken(e.slug) !== token);
  await writeRegistry(registry);
}

export function mergeInactiveCategoryFilters(
  kind: ContentCategoryKind,
  registry: InactiveRegistry,
  dbInactive: Array<{ id: string; label: string }>,
): CategoryVisibilityFilter {
  const merged = new Map<string, InactiveCategoryEntry>();
  for (const entry of registry[kind]) {
    merged.set(normalizeCategoryToken(entry.slug), entry);
  }
  for (const row of dbInactive) {
    merged.set(normalizeCategoryToken(row.id), { slug: row.id, label: row.label });
  }
  return buildCategoryVisibilityFilter(Array.from(merged.values()).map((e) => ({ id: e.slug, label: e.label })));
}

export async function loadInactiveRegistry(): Promise<InactiveRegistry> {
  return readRegistry();
}

export async function clearInactiveCategoryRegistry(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
