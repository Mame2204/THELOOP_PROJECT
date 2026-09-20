import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CatalogScreenLayout } from '@/components/CatalogScreenLayout';
import { EventCard } from '@/components/EventCard';
import { FilterPills } from '@/components/FilterPills';
import { MonthSeparator } from '@/components/MonthSeparator';
import { useContent } from '@/context/ContentContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import {
  buildAgendaListRows,
  filterUpcomingEvents,
  type AgendaListRow,
} from '@/lib/event-list-utils';
import { filterEventsByActiveCategories } from '@/lib/category-visibility';
import { filterEventsByQuery } from '@/lib/search-utils';
import { usePromptFavoritesSignup } from '@/lib/favorites-auth-prompt';
import { useCategoryLabels } from '@/context/CategoryLabelsContext';
import { getCategoryOptions } from '@/lib/admin-categories-store';
import { DEFAULT_SECTIONS, getAppSections } from '@/lib/app-sections-store';
import { canViewPrimeContent, type EventCategory } from '@/types';
import type { TabScreenProps } from '@/navigation/types';

type Props = TabScreenProps<'Agenda'>;

type AgendaFilter = EventCategory | 'all' | 'loopx' | string;

export function AgendaScreen({ navigation }: Props) {
  const [eventFilter, setEventFilter] = useState<AgendaFilter>('all');
  const [agendaFilters, setAgendaFilters] = useState<Array<{ value: AgendaFilter; label: string }>>([{ value: 'all', label: 'Tous' }]);
  const [query, setQuery] = useState('');
  const [blocks, setBlocks] = useState(DEFAULT_SECTIONS.agenda);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const { isLoading, publicEvents, primeEvents, refresh, activeCountryCode } = useContent();
  const { role, user } = useAuthContext();
  const canViewExclusive = canViewPrimeContent(role, user);
  const { shell } = useMemberTheme();
  const { isEventFavorite, toggleEventFavorite } = useFavorites();

  const openFavoritesSignup = usePromptFavoritesSignup();

  const { ready: categoriesReady, revision, activeEventFilter, inactiveEventFilter } = useCategoryLabels();

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getAppSections(activeCountryCode).then((s) => {
        if (!cancelled) setBlocks(s.agenda);
      });
      return () => {
        cancelled = true;
      };
    }, [activeCountryCode]),
  );

  useEffect(() => {
    if (!categoriesReady) return;
    void getCategoryOptions('event').then((cats) => {
      const filters: Array<{ value: AgendaFilter; label: string }> = [
        { value: 'all', label: 'Tous' },
        ...cats.map((c) => ({ value: c.id, label: c.label })),
      ];
      if (canViewExclusive) {
        filters.push({ value: 'loopx', label: 'LoopX' });
      }
      setAgendaFilters(filters);
    });
  }, [categoriesReady, revision, canViewExclusive]);

  const onFavorite = (id: string) => {
    if (role === 'USER_ANONYMOUS') {
      openFavoritesSignup(navigation);
      return;
    }
    void toggleEventFavorite(id);
  };

  const catalogEvents = useMemo(() => {
    if (!canViewExclusive) return publicEvents;
    const publicIds = new Set(publicEvents.map((event) => event.id));
    const primeOnly = primeEvents.filter((event) => !publicIds.has(event.id));
    return [...publicEvents, ...primeOnly];
  }, [publicEvents, primeEvents, canViewExclusive]);

  const rows = useMemo(() => {
    const visibleEvents = filterEventsByActiveCategories(
      catalogEvents,
      activeEventFilter,
      inactiveEventFilter,
      categoriesReady,
    );
    const filtered = visibleEvents.filter((event) => {
      if (eventFilter === 'all') return true;
      if (eventFilter === 'loopx') return event.visibility === 'prime';
      return event.category === eventFilter;
    });
    const searched = filterEventsByQuery(filtered, query);
    const upcoming = filterUpcomingEvents(searched);
    return buildAgendaListRows(upcoming);
  }, [catalogEvents, activeEventFilter, inactiveEventFilter, categoriesReady, eventFilter, query]);

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
      title="Agenda"
      shell={shell}
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder="Rechercher un événement…"
      refreshing={pullRefreshing || isLoading}
      onRefresh={() => void onRefresh()}
      showHero={blocks.hero}
      showFilters={blocks.filters}
      heroVariant="events"
      data={rows}
      keyExtractor={(item) =>
        item.kind === 'month' ? item.id : `event-${item.id}`
      }
      listHeaderBelowSearch={
        <FilterPills
          options={agendaFilters}
          active={eventFilter}
          onChange={setEventFilter}
          activeBg={shell.filterActiveBg}
          activeText={shell.filterActiveText}
          inactiveBg={shell.filterInactiveBg}
          inactiveText={shell.filterInactiveText}
          inactiveBorder={shell.filterInactiveBorder}
        />
      }
      renderItem={({ item }: { item: AgendaListRow }) =>
        item.kind === 'month' ? (
          <MonthSeparator
            label={item.label}
            color={shell.pageKicker}
            lineColor={shell.filterInactiveBorder}
          />
        ) : (
          <EventCard
            event={item.event}
            isFavorite={isEventFavorite(item.event.id)}
            onPress={() => navigation.navigate('EventDetail', { slug: item.event.slug })}
            onToggleFavorite={() => onFavorite(item.event.id)}
          />
        )
      }
      ListEmptyComponent={
        <Text style={[styles.empty, { color: shell.pageKicker }]}>
          {hasSearch
            ? `Aucun événement pour « ${query.trim()} ».`
            : eventFilter === 'loopx'
              ? 'Aucun événement LoopX à venir.'
              : 'Aucun événement à venir dans cette catégorie.'}
        </Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
