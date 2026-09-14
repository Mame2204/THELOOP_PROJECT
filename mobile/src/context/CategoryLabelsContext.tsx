import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ContentCategoryKind } from '@/lib/admin-categories-store';
import type { CategoryVisibilityFilter } from '@/lib/category-visibility';
import {
  getActiveEventCategoryFilter,
  getActiveSpotCategoryFilter,
  getActiveToolCategoryFilter,
  getInactiveEventCategoryFilter,
  getInactiveSpotCategoryFilter,
  getInactiveToolCategoryFilter,
  getCategoryLabel,
  getEventCategoryEmoji,
  getEventCategoryLabel,
  getSpotCategoryEmoji,
  getSpotCategoryLabel,
  getToolCategoryLabel,
  getToolCategoryEmoji,
  isCategoryLabelsLoaded,
  refreshCategoryLabelsCache,
  refreshCategoryLabelsFromMemory,
} from '@/lib/category-labels-cache';

interface CategoryLabelsContextValue {
  ready: boolean;
  revision: number;
  refresh: () => Promise<void>;
  activeEventFilter: CategoryVisibilityFilter;
  activeSpotFilter: CategoryVisibilityFilter;
  activeToolFilter: CategoryVisibilityFilter;
  inactiveEventFilter: CategoryVisibilityFilter;
  inactiveSpotFilter: CategoryVisibilityFilter;
  inactiveToolFilter: CategoryVisibilityFilter;
  eventLabel: (id: string) => string;
  spotLabel: (id: string) => string;
  toolLabel: (id: string) => string;
  eventEmoji: (id: string) => string;
  spotEmoji: (id: string) => string;
  toolEmoji: (id: string) => string;
  label: (kind: ContentCategoryKind, id: string) => string;
}

const CategoryLabelsContext = createContext<CategoryLabelsContextValue | null>(null);

export function CategoryLabelsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(isCategoryLabelsLoaded());
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(async () => {
    if (refreshCategoryLabelsFromMemory()) {
      setReady(true);
      setRevision((v) => v + 1);
      return;
    }
    await refreshCategoryLabelsCache();
    setReady(true);
    setRevision((v) => v + 1);
  }, []);

  useEffect(() => {
    void refresh();
  }, []);

  const value = useMemo<CategoryLabelsContextValue>(
    () => ({
      ready,
      revision,
      refresh,
      activeEventFilter: getActiveEventCategoryFilter(),
      activeSpotFilter: getActiveSpotCategoryFilter(),
      activeToolFilter: getActiveToolCategoryFilter(),
      inactiveEventFilter: getInactiveEventCategoryFilter(),
      inactiveSpotFilter: getInactiveSpotCategoryFilter(),
      inactiveToolFilter: getInactiveToolCategoryFilter(),
      eventLabel: getEventCategoryLabel,
      spotLabel: getSpotCategoryLabel,
      toolLabel: getToolCategoryLabel,
      eventEmoji: getEventCategoryEmoji,
      spotEmoji: getSpotCategoryEmoji,
      toolEmoji: getToolCategoryEmoji,
      label: getCategoryLabel,
    }),
    [ready, revision, refresh],
  );

  return <CategoryLabelsContext.Provider value={value}>{children}</CategoryLabelsContext.Provider>;
}

export function useCategoryLabels(): CategoryLabelsContextValue {
  const ctx = useContext(CategoryLabelsContext);
  if (!ctx) {
    return {
      ready: isCategoryLabelsLoaded(),
      revision: 0,
      refresh: refreshCategoryLabelsCache,
      activeEventFilter: getActiveEventCategoryFilter(),
      activeSpotFilter: getActiveSpotCategoryFilter(),
      activeToolFilter: getActiveToolCategoryFilter(),
      inactiveEventFilter: getInactiveEventCategoryFilter(),
      inactiveSpotFilter: getInactiveSpotCategoryFilter(),
      inactiveToolFilter: getInactiveToolCategoryFilter(),
      eventLabel: getEventCategoryLabel,
      spotLabel: getSpotCategoryLabel,
      toolLabel: getToolCategoryLabel,
      eventEmoji: getEventCategoryEmoji,
      spotEmoji: getSpotCategoryEmoji,
      toolEmoji: getToolCategoryEmoji,
      label: getCategoryLabel,
    };
  }
  return ctx;
}
