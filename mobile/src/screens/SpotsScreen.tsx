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
import { filterLocationsByQuery } from '@/lib/search-utils';
import { filterSpotsByActiveCategories } from '@/lib/category-visibility';
import { isSpotLocation } from '@/lib/location-kind-utils';
import { usePromptFavoritesSignup } from '@/lib/favorites-auth-prompt';
import { shuffleWithSeed } from '@/lib/shuffle-utils';
import { useCategoryLabels } from '@/context/CategoryLabelsContext';
import { getCategoryOptions } from '@/lib/admin-categories-store';
import { DEFAULT_SECTIONS, getAppSections } from '@/lib/app-sections-store';
import type { HomeLocation } from '@/lib/demo-data';
import type { LocationSubCategory } from '@/types';
import type { TabScreenProps } from '@/navigation/types';

type Props = TabScreenProps<'Spots'>;
type SpotsFilter = LocationSubCategory | 'all' | string;

export function SpotsScreen({ navigation }: Props) {
  const [subCategory, setSubCategory] = useState<SpotsFilter>('all');
  const [spotFilters, setSpotFilters] = useState<Array<{ value: SpotsFilter; label: string }>>([{ value: 'all', label: 'Tous' }]);
  const [query, setQuery] = useState('');
  const [blocks, setBlocks] = useState(DEFAULT_SECTIONS.spots);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const { isLoading, getHomeLocations, refresh, activeCountryCode } = useContent();
  const { role } = useAuthContext();
  const { shell } = useMemberTheme();
  const { isLocationFavorite, toggleLocationFavorite } = useFavorites();

  const openFavoritesSignup = usePromptFavoritesSignup();
  const shuffleSeed = useShuffleOnFocus();
  const { hasBenefit } = useContentIdsWithBenefits();

  const { ready: categoriesReady, revision, activeSpotFilter, inactiveSpotFilter } = useCategoryLabels();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getAppSections(activeCountryCode).then((s) => {
        if (!cancelled) setBlocks(s.spots);
      });
      return () => {
        cancelled = true;
      };
    }, [activeCountryCode]),
  );

  useEffect(() => {
    if (!categoriesReady) return;
    void getCategoryOptions('spot').then((cats) => {
      setSpotFilters([{ value: 'all', label: 'Tous' }, ...cats.map((c) => ({ value: c.id, label: c.label }))]);
    });
  }, [categoriesReady, revision]);

  const onFavorite = (id: string) => {
    if (role === 'USER_ANONYMOUS') {
      openFavoritesSignup(navigation);
      return;
    }
    void toggleLocationFavorite(id, { kind: 'spot' });
  };

  const spots = useMemo(() => {
    const categoryFilter = (loc: HomeLocation) =>
      subCategory === 'all' || loc.subCategory === subCategory;

    const catalog = getHomeLocations().filter((l) => l.visibility !== 'prime' && isSpotLocation(l));
    const mixed = shuffleWithSeed(catalog, shuffleSeed);
    const base = mixed.filter(categoryFilter);

    return filterLocationsByQuery(
      filterSpotsByActiveCategories(base, activeSpotFilter, inactiveSpotFilter, categoriesReady),
      query,
    );
  }, [getHomeLocations, subCategory, query, activeSpotFilter, inactiveSpotFilter, categoriesReady, shuffleSeed]);

  const onRefresh = useCallback(async () => {
    setPullRefreshing(true);
    try {
      await refresh();
    } finally {
      setPullRefreshing(false);
    }
  }, [refresh]);

  return (
    <CatalogScreenLayout
      title="Spots"
      shell={shell}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder="Rechercher une adresse…"
      refreshing={pullRefreshing || isLoading}
      onRefresh={() => void onRefresh()}
      data={spots}
      keyExtractor={(item) => item.id}
      listHeaderBelowSearch={
        <FilterPills
          options={spotFilters}
          active={subCategory}
          onChange={setSubCategory}
          activeBg={shell.filterActiveBg}
          activeText={shell.filterActiveText}
          inactiveBg={shell.filterInactiveBg}
          inactiveText={shell.filterInactiveText}
          inactiveBorder={shell.filterInactiveBorder}
        />
      }
      showHero={blocks.hero}
      showFilters={blocks.filters}
      heroVariant="spots"
      renderItem={({ item }) => (
        <SpotCard
          spot={item}
          isFavorite={isLocationFavorite(item.id)}
          hasLinkedPrivilege={hasBenefit(item.id, 'spot')}
          onPress={() => navigation.navigate('SpotDetail', { slug: item.slug })}
          onToggleFavorite={() => onFavorite(item.id)}
        />
      )}
      ListEmptyComponent={
        <Text style={[styles.empty, { color: shell.pageKicker }]}>
          {query.trim() ? `Aucune adresse pour « ${query.trim()} ».` : 'Aucune adresse dans cette catégorie.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
