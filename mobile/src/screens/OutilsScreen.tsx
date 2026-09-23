import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CatalogScreenLayout } from '@/components/CatalogScreenLayout';
import { FilterPills } from '@/components/FilterPills';
import { SpotCard } from '@/components/SpotCard';
import { useContent } from '@/context/ContentContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useContentIdsWithBenefits } from '@/hooks/useContentIdsWithBenefits';
import { useShuffleOnFocus } from '@/hooks/useShuffleOnFocus';
import { usePromptFavoritesSignup } from '@/lib/favorites-auth-prompt';
import { shuffleWithSeed } from '@/lib/shuffle-utils';
import { filterLocationsByQuery } from '@/lib/search-utils';
import { filterToolsByActiveCategories } from '@/lib/category-visibility';
import { useCategoryLabels } from '@/context/CategoryLabelsContext';
import { getCategoryOptions } from '@/lib/admin-categories-store';
import { DEFAULT_SECTIONS, getAppSections } from '@/lib/app-sections-store';
import type { TabScreenProps } from '@/navigation/types';

type Props = TabScreenProps<'Outils'>;
type ToolFilter = 'all' | string;

export function OutilsScreen({ navigation }: Props) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ToolFilter>('all');
  const [toolFilters, setToolFilters] = useState<Array<{ value: ToolFilter; label: string }>>([{ value: 'all', label: 'Tous' }]);
  const [blocks, setBlocks] = useState(DEFAULT_SECTIONS.outils);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const { isLoading, getHomeLocations, refresh, activeCountryCode } = useContent();
  const { role } = useAuthContext();
  const { shell } = useMemberTheme();
  const { isLocationFavorite, toggleLocationFavorite } = useFavorites();

  const openFavoritesSignup = usePromptFavoritesSignup();
  const shuffleSeed = useShuffleOnFocus();
  const { hasBenefit } = useContentIdsWithBenefits();

  const { ready: categoriesReady, revision, activeToolFilter, inactiveToolFilter } = useCategoryLabels();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getAppSections(activeCountryCode).then((s) => {
        if (!cancelled) setBlocks(s.outils);
      });
      return () => {
        cancelled = true;
      };
    }, [activeCountryCode]),
  );

  useEffect(() => {
    if (!categoriesReady) return;
    void getCategoryOptions('tool').then((cats) => {
      setToolFilters([{ value: 'all', label: 'Tous' }, ...cats.map((c) => ({ value: c.id, label: c.label }))]);
    });
  }, [categoriesReady, revision]);

  const onFavorite = (id: string) => {
    if (role === 'USER_ANONYMOUS') {
      openFavoritesSignup(navigation);
      return;
    }
    void toggleLocationFavorite(id, { kind: 'tool' });
  };

  const tools = useMemo(() => {
    const catalog = getHomeLocations('tools').filter((l) => l.visibility !== 'prime' && l.isVerified === true);
    const mixed = shuffleWithSeed(catalog, shuffleSeed);
    const base = filterToolsByActiveCategories(
      mixed,
      activeToolFilter,
      inactiveToolFilter,
      categoriesReady,
    );
    return filterLocationsByQuery(
      base.filter((l) => categoryFilter === 'all' || l.toolCategory === categoryFilter),
      query,
    );
  }, [getHomeLocations, query, categoryFilter, activeToolFilter, inactiveToolFilter, categoriesReady, shuffleSeed]);

  const onRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await refresh();
    } finally {
      setPullRefreshing(false);
    }
  }, [refresh]);

  const hasSearch = query.trim().length > 0;

  return (
    <CatalogScreenLayout
      title="Outils"
      shell={shell}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder="Rechercher un outil…"
      refreshing={pullRefreshing || isLoading}
      onRefresh={() => void onRefresh()}
      showHero={blocks.hero}
      showFilters={blocks.filters}
      heroVariant="tools"
      data={tools}
      keyExtractor={(item) => item.id}
      listHeaderBelowSearch={
        <FilterPills
          options={toolFilters}
          active={categoryFilter}
          onChange={setCategoryFilter}
          activeBg={shell.filterActiveBg}
          activeText={shell.filterActiveText}
          inactiveBg={shell.filterInactiveBg}
          inactiveText={shell.filterInactiveText}
          inactiveBorder={shell.filterInactiveBorder}
        />
      }
      renderItem={({ item }) => (
        <SpotCard
          spot={item}
          isFavorite={isLocationFavorite(item.id)}
          hasLinkedPrivilege={hasBenefit(item.id, 'tool')}
          onPress={() => navigation.navigate('SpotDetail', { slug: item.slug })}
          onToggleFavorite={() => onFavorite(item.id)}
        />
      )}
      ListEmptyComponent={
        <Text style={[styles.empty, { color: shell.pageKicker }]}>
          {hasSearch ? `Aucun outil pour « ${query.trim()} ».` : 'Aucun outil disponible pour cette catégorie.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
