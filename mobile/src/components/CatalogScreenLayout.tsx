import { ReactElement, ReactNode, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  FlatListProps,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { HeroSlider } from '@/components/HeroSlider';
import { SearchBar } from '@/components/SearchBar';
import { SystemUnavailableBanner } from '@/components/SystemUnavailableBanner';
import { ThemedScreenBackdrop } from '@/components/ThemedScreenBackdrop';
import { useContent } from '@/context/ContentContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useScrollContentContainerStyle } from '@/hooks/useScrollContentContainerStyle';
import { CONTENT_H_PADDING, HERO_COLLAPSE_SCROLL, HERO_COMPACT_HEIGHT, HERO_EXPAND_SCROLL, HERO_HEIGHT, SEARCH_TO_HERO_GAP } from '@/constants/layout';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface CatalogScreenLayoutProps<T> {
  title: string;
  shell: ShellTheme;
  query: string;
  onQueryChange: (text: string) => void;
  searchPlaceholder: string;
  listHeaderBelowSearch: ReactNode;
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: FlatListProps<T>['renderItem'];
  ListEmptyComponent: ReactElement | null;
  refreshing: boolean;
  onRefresh: () => void;
  showHero?: boolean;
  showFilters?: boolean;
  heroVariant?: 'events' | 'spots' | 'tools';
}

/** En-tête fixe : recherche, « À la une » (animation au seuil) et filtres catégories. */
export function CatalogScreenLayout<T>({
  title,
  shell,
  query,
  onQueryChange,
  searchPlaceholder,
  listHeaderBelowSearch,
  data,
  keyExtractor,
  renderItem,
  ListEmptyComponent,
  refreshing,
  onRefresh,
  showHero = false,
  showFilters = true,
  heroVariant = 'events',
}: CatalogScreenLayoutProps<T>) {
  const { isUnavailable } = useContent();
  const { theme } = useMemberTheme();
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(() => query.trim().length > 0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!showHero) return;
      const y = e.nativeEvent.contentOffset.y;
      setHeroCollapsed((prev) => {
        if (!prev && y >= HERO_COLLAPSE_SCROLL) return true;
        if (prev && y <= HERO_EXPAND_SCROLL) return false;
        return prev;
      });
    },
    [showHero],
  );

  function toggleSearch() {
    setSearchOpen((prev) => {
      if (prev) {
        onQueryChange('');
        return false;
      }
      return true;
    });
  }

  const uniqueData = useMemo(() => {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const item of data) {
      const key = keyExtractor(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }, [data, keyExtractor]);

  const stickyHeaderEstimate =
    56 +
    (isUnavailable ? 28 : 0) +
    (searchOpen ? 52 : 0) +
    (showFilters ? 48 : 0) +
    (showHero && !searchOpen
      ? heroCollapsed
        ? HERO_COMPACT_HEIGHT + 12
        : HERO_HEIGHT + SEARCH_TO_HERO_GAP + 12 + 24
      : 0);

  const listContentStyle = useScrollContentContainerStyle(styles.listContent, {
    stickyHeaderEstimate,
    includeTabBar: true,
    paddingBottom: 32,
  });

  return (
    <ThemedScreenBackdrop theme={theme}>
      <View style={styles.page}>
        <View style={[styles.sticky, { backgroundColor: 'transparent' }]}>
          <PageHeader
            title={title}
            shell={shell}
            showSearchToggle
            searchOpen={searchOpen}
            onSearchToggle={toggleSearch}
          />
          <View style={styles.stickyBody}>
            {isUnavailable ? <SystemUnavailableBanner shell={shell} compact /> : null}
            {searchOpen ? (
              <SearchBar
                value={query}
                onChangeText={onQueryChange}
                placeholder={searchPlaceholder}
                accentColor={theme.colors.accent}
                accentSoft={theme.colors.accentSoft}
                borderColor={theme.colors.border}
                autoFocus
              />
            ) : null}
            {showFilters ? <View style={styles.filtersRow}>{listHeaderBelowSearch}</View> : null}
            {showHero && !searchOpen ? (
              <HeroSlider variant={heroVariant} collapsed={heroCollapsed} pinned />
            ) : null}
          </View>
        </View>

        <FlatList
        data={uniqueData}
        keyExtractor={keyExtractor}
        style={styles.list}
        contentContainerStyle={listContentStyle}
        ListHeaderComponent={null}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={shell.tabIndicator} />
        }
        onScroll={onScroll}
        scrollEventThrottle={16}
        alwaysBounceVertical
        overScrollMode="always"
        renderItem={renderItem}
        ListEmptyComponent={ListEmptyComponent}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
        updateCellsBatchingPeriod={50}
      />
      </View>
    </ThemedScreenBackdrop>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  sticky: {
    zIndex: 2,
  },
  stickyBody: {
    paddingHorizontal: CONTENT_H_PADDING,
  },
  filtersRow: {
    paddingBottom: 4,
  },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: CONTENT_H_PADDING,
    paddingTop: 4,
  },
});
