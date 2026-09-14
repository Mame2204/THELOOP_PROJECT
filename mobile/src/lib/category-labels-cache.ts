import {
  bootstrapCategoryStore,
  getCachedAdminCategories,
  getCategoryOptions,
  listAdminCategories,
  type AdminCategory,
  type ContentCategoryKind,
} from '@/lib/admin-categories-store';
import {
  buildCategoryVisibilityFilter,
  emptyCategoryVisibilityFilter,
  type CategoryVisibilityFilter,
} from '@/lib/category-filter-utils';
import {
  getCachedInactiveRegistry,
  loadInactiveRegistry,
  mergeInactiveCategoryFilters,
  type InactiveCategoryEntry,
} from '@/lib/inactive-category-registry';

type LabelMap = Record<string, string>;
type EmojiMap = Record<string, string>;

let eventLabels: LabelMap = {};
let spotLabels: LabelMap = {};
let toolLabels: LabelMap = {};
let eventEmojis: EmojiMap = {};
let spotEmojis: EmojiMap = {};
let toolEmojis: EmojiMap = {};
let activeEventFilter: CategoryVisibilityFilter = emptyCategoryVisibilityFilter();
let activeSpotFilter: CategoryVisibilityFilter = emptyCategoryVisibilityFilter();
let activeToolFilter: CategoryVisibilityFilter = emptyCategoryVisibilityFilter();
let inactiveEventFilter: CategoryVisibilityFilter = emptyCategoryVisibilityFilter();
let inactiveSpotFilter: CategoryVisibilityFilter = emptyCategoryVisibilityFilter();
let inactiveToolFilter: CategoryVisibilityFilter = emptyCategoryVisibilityFilter();
let loaded = false;

function mapLabelsAndEmojis(items: Array<Pick<AdminCategory, 'id' | 'label' | 'emoji'>>): { labels: LabelMap; emojis: EmojiMap } {
  return {
    labels: Object.fromEntries(items.map((c) => [c.id, c.label])),
    emojis: Object.fromEntries(items.map((c) => [c.id, c.emoji])),
  };
}

export function applyCategoryLabelsFromCategories(
  allCategories: AdminCategory[],
  registry: Record<ContentCategoryKind, InactiveCategoryEntry[]>,
): void {
  const events = allCategories.filter((c) => c.kind === 'event' && c.isActive);
  const spots = allCategories.filter((c) => c.kind === 'spot' && c.isActive);
  const tools = allCategories.filter((c) => c.kind === 'tool' && c.isActive);
  const inactiveFromDb = allCategories.filter((c) => !c.isActive);

  const eventMaps = mapLabelsAndEmojis(events);
  const spotMaps = mapLabelsAndEmojis(spots);
  const toolMaps = mapLabelsAndEmojis(tools);

  eventLabels = eventMaps.labels;
  spotLabels = spotMaps.labels;
  toolLabels = toolMaps.labels;
  eventEmojis = eventMaps.emojis;
  spotEmojis = spotMaps.emojis;
  toolEmojis = toolMaps.emojis;
  activeEventFilter = buildCategoryVisibilityFilter(events);
  activeSpotFilter = buildCategoryVisibilityFilter(spots);
  activeToolFilter = buildCategoryVisibilityFilter(tools);
  inactiveEventFilter = mergeInactiveCategoryFilters(
    'event',
    registry,
    inactiveFromDb.filter((c) => c.kind === 'event'),
  );
  inactiveSpotFilter = mergeInactiveCategoryFilters(
    'spot',
    registry,
    inactiveFromDb.filter((c) => c.kind === 'spot'),
  );
  inactiveToolFilter = mergeInactiveCategoryFilters(
    'tool',
    registry,
    inactiveFromDb.filter((c) => c.kind === 'tool'),
  );
  loaded = true;
  bumpCategoryLabelsRevision();
}

type CategoryLabelsListener = () => void;
const categoryLabelsListeners = new Set<CategoryLabelsListener>();

export function subscribeCategoryLabelsRevision(listener: CategoryLabelsListener): () => void {
  categoryLabelsListeners.add(listener);
  return () => {
    categoryLabelsListeners.delete(listener);
  };
}

function bumpCategoryLabelsRevision(): void {
  categoryLabelsListeners.forEach((listener) => listener());
}

/** Mise à jour instantanée depuis le cache mémoire (sans requête réseau). */
export function refreshCategoryLabelsFromMemory(): boolean {
  const allCategories = getCachedAdminCategories();
  if (!allCategories) return false;
  applyCategoryLabelsFromCategories(allCategories, getCachedInactiveRegistry());
  return true;
}

export async function refreshCategoryLabelsCache(): Promise<void> {
  await bootstrapCategoryStore();
  const cached = getCachedAdminCategories();
  if (cached) {
    applyCategoryLabelsFromCategories(cached, getCachedInactiveRegistry());
    return;
  }
  const allCategories = await listAdminCategories(undefined, false);
  const registry = await loadInactiveRegistry();
  applyCategoryLabelsFromCategories(allCategories, registry);
}

export function isCategoryLabelsLoaded(): boolean {
  return loaded;
}

export function getActiveEventCategoryFilter(): CategoryVisibilityFilter {
  return activeEventFilter;
}

export function getActiveSpotCategoryFilter(): CategoryVisibilityFilter {
  return activeSpotFilter;
}

export function getActiveToolCategoryFilter(): CategoryVisibilityFilter {
  return activeToolFilter;
}

export function getInactiveEventCategoryFilter(): CategoryVisibilityFilter {
  return inactiveEventFilter;
}

export function getInactiveSpotCategoryFilter(): CategoryVisibilityFilter {
  return inactiveSpotFilter;
}

export function getInactiveToolCategoryFilter(): CategoryVisibilityFilter {
  return inactiveToolFilter;
}

export function getEventCategoryLabel(id: string): string {
  return eventLabels[id] ?? id;
}

export function getSpotCategoryLabel(id: string): string {
  return spotLabels[id] ?? id;
}

export function getToolCategoryLabel(id: string): string {
  return toolLabels[id] ?? id;
}

export function getEventCategoryEmoji(id: string): string {
  return eventEmojis[id] ?? '🏷️';
}

export function getSpotCategoryEmoji(id: string): string {
  return spotEmojis[id] ?? '✨';
}

export function getToolCategoryEmoji(id: string): string {
  return toolEmojis[id] ?? '🛠️';
}

export function getCategoryLabel(kind: ContentCategoryKind, id: string): string {
  if (kind === 'event') return getEventCategoryLabel(id);
  if (kind === 'spot') return getSpotCategoryLabel(id);
  return getToolCategoryLabel(id);
}

export async function loadCategoryLabelMaps(): Promise<{
  event: LabelMap;
  spot: LabelMap;
  tool: LabelMap;
}> {
  await refreshCategoryLabelsCache();
  return { event: { ...eventLabels }, spot: { ...spotLabels }, tool: { ...toolLabels } };
}

export async function loadCategoryOptions(kind: ContentCategoryKind) {
  return getCategoryOptions(kind);
}

export async function loadCategoryLabelMap(kind: ContentCategoryKind): Promise<LabelMap> {
  const items = await listAdminCategories(kind, true);
  return Object.fromEntries(items.map((c) => [c.id, c.label]));
}
