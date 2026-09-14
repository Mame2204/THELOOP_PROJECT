import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useMemo, useState } from 'react';
import { EventCard } from '@/components/EventCard';
import { SpotCard } from '@/components/SpotCard';
import { WalkCard } from '@/components/WalkCard';
import { FilterPills } from '@/components/FilterPills';
import { PageHeader } from '@/components/PageHeader';
import { ThemedScreenBackdrop } from '@/components/ThemedScreenBackdrop';
import { CONTENT_H_PADDING } from '@/constants/layout';
import { useContent } from '@/context/ContentContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useAuthContext } from '@/context/AuthContext';
import { useAppGates } from '@/context/AppGatesContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useScrollContentContainerStyle } from '@/hooks/useScrollContentContainerStyle';
import {
  getEventStatusLabel,
  isEventPast,
  sortEventsByDateAsc,
} from '@/lib/event-list-utils';
import { listLoopWalks, type LoopWalk } from '@/lib/loop-walks-store';
import { listWalkFavorites, toggleWalkFavorite } from '@/lib/walk-engagement-store';
import { isSpotLocation, isToolLocation } from '@/lib/location-kind-utils';
import type { TabScreenProps } from '@/navigation/types';
import { FAVORITES_AUTH_MESSAGE, usePromptFavoritesSignup } from '@/lib/favorites-auth-prompt';
import { resolveMissingFavoriteTools } from '@/lib/favorites-store';
import type { HomeLocation } from '@/lib/demo-data';

type Props = TabScreenProps<'Favoris'>;
type FavFilter = 'all' | 'events' | 'spots' | 'tools' | 'walks';

const FILTERS: { value: FavFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'events', label: 'Événements' },
  { value: 'spots', label: 'Spots' },
  { value: 'tools', label: 'Outils' },
  { value: 'walks', label: 'Parcours' },
];

export function FavorisScreen({ navigation }: Props) {
  const [filter, setFilter] = useState<FavFilter>('all');
  const [walks, setWalks] = useState<LoopWalk[]>([]);
  const [favWalkIds, setFavWalkIds] = useState<string[]>([]);
  const [extraTools, setExtraTools] = useState<HomeLocation[]>([]);
  const { role, user } = useAuthContext();
  const { gates } = useAppGates();
  const { shell, theme } = useMemberTheme();
  const { publicEvents, getHomeLocations, activeCountryCode } = useContent();
  const {
    favoriteEventIds,
    favoriteLocationIds,
    isEventFavorite,
    isLocationFavorite,
    toggleEventFavorite,
    toggleLocationFavorite,
  } = useFavorites();

  useFocusLoad(
    async () => {
      if (!user || user.id === 'anonymous') return;
      const [all, ids] = await Promise.all([
        listLoopWalks(activeCountryCode),
        listWalkFavorites(user.id),
      ]);
      setWalks(all);
      setFavWalkIds(ids);
    },
    {
      ttlMs: 90_000,
      enabled: Boolean(user) && user?.id !== 'anonymous',
      resetKey: `${user?.id ?? ''}:${activeCountryCode}`,
    },
  );

  const events = useMemo(() => publicEvents, [publicEvents]);
  const locations = useMemo(
    () => getHomeLocations().filter((l) => l.visibility !== 'prime' && isSpotLocation(l)),
    [getHomeLocations],
  );
  const tools = useMemo(
    () => getHomeLocations().filter((l) => isToolLocation(l)),
    [getHomeLocations],
  );

  useFocusLoad(
    async () => {
      const favToolIds = [...favoriteLocationIds].filter((id) => !tools.some((t) => t.id === id));
      if (favToolIds.length === 0) {
        setExtraTools([]);
        return;
      }
      setExtraTools(await resolveMissingFavoriteTools(favToolIds, tools));
    },
    {
      ttlMs: 120_000,
      enabled: Boolean(user) && user?.id !== 'anonymous',
      resetKey: `${[...favoriteLocationIds].sort().join(',')}:${tools.length}`,
    },
  );

  const allTools = useMemo(() => {
    const byId = new Map<string, HomeLocation>();
    tools.forEach((t) => byId.set(t.id, t));
    extraTools.forEach((t) => byId.set(t.id, t));
    return [...byId.values()];
  }, [tools, extraTools]);

  const favEvents = useMemo(() => {
    const list = events.filter((e) => favoriteEventIds.has(e.id));
    const upcoming = sortEventsByDateAsc(list.filter((e) => !isEventPast(e)));
    const past = sortEventsByDateAsc(list.filter((e) => isEventPast(e))).reverse();
    return [...upcoming, ...past];
  }, [events, favoriteEventIds]);
  const favSpots = locations.filter((l) => favoriteLocationIds.has(l.id));
  const favTools = allTools.filter((l) => favoriteLocationIds.has(l.id));
  const favWalks = walks.filter((w) => favWalkIds.includes(w.id));

  const rows = useMemo(() => {
    const list: Array<{
      type: 'event' | 'spot' | 'tool' | 'walk';
      id: string;
      item: (typeof favEvents)[0] | (typeof favSpots)[0] | (typeof favTools)[0] | LoopWalk;
    }> = [];
    if (filter === 'all' || filter === 'events') {
      favEvents.forEach((e) => list.push({ type: 'event', id: e.id, item: e }));
    }
    if (filter === 'all' || filter === 'spots') {
      favSpots.forEach((s) => list.push({ type: 'spot', id: s.id, item: s }));
    }
    if (filter === 'all' || filter === 'tools') {
      favTools.forEach((t) => list.push({ type: 'tool', id: t.id, item: t }));
    }
    if (filter === 'all' || filter === 'walks') {
      favWalks.forEach((w) => list.push({ type: 'walk', id: w.id, item: w }));
    }
    return list;
  }, [filter, favEvents, favSpots, favTools, favWalks]);

  const emptyFilterMessage = useMemo(() => {
    if (filter === 'events') return 'Aucun événement en favori.';
    if (filter === 'spots') return 'Aucun spot en favori.';
    if (filter === 'tools') return 'Aucun outil en favori.';
    if (filter === 'walks') return 'Aucun parcours en favori.';
    return 'Aucun favori dans cette sélection.';
  }, [filter]);

  const openFavoritesSignup = usePromptFavoritesSignup();

  const listContentStyle = useScrollContentContainerStyle(
    { paddingHorizontal: CONTENT_H_PADDING },
    { stickyHeaderEstimate: 120, includeTabBar: true, paddingBottom: 32 },
  );

  if (role === 'USER_ANONYMOUS') {
    return (
      <ThemedScreenBackdrop theme={theme}>
        <View style={styles.denied}>
          <PageHeader title="Favoris" shell={shell} />
          <Text style={[styles.empty, { color: shell.pageKicker }]}>{FAVORITES_AUTH_MESSAGE}</Text>
          <Pressable onPress={() => openFavoritesSignup(navigation)}>
            <Text style={{ color: shell.tabIndicator, fontWeight: '700', textAlign: 'center' }}>
              {gates.signupEnabled ? 'Créer un compte →' : 'Se connecter →'}
            </Text>
          </Pressable>
        </View>
      </ThemedScreenBackdrop>
    );
  }

  return (
    <ThemedScreenBackdrop theme={theme}>
      <View style={styles.page}>
        <PageHeader title="Favoris" shell={shell} />
        <View style={styles.body}>
        <FilterPills
          options={FILTERS}
          active={filter}
          onChange={setFilter}
          activeBg={shell.filterActiveBg}
          activeText={shell.filterActiveText}
          inactiveBg={shell.filterInactiveBg}
          inactiveText={shell.filterInactiveText}
          inactiveBorder={shell.filterInactiveBorder}
        />
        </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        style={{ flex: 1 }}
        contentContainerStyle={listContentStyle}
        alwaysBounceVertical
        overScrollMode="always"
        ListEmptyComponent={
          <Text style={[styles.empty, { color: shell.pageKicker }]}>{emptyFilterMessage}</Text>
        }
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews
        updateCellsBatchingPeriod={50}
        renderItem={({ item }) => {
          if (item.type === 'event') {
            const e = item.item as (typeof favEvents)[0];
            return (
              <EventCard
                event={e}
                isFavorite={isEventFavorite(e.id)}
                statusLabel={getEventStatusLabel(e)}
                onPress={() => navigation.navigate('EventDetail', { slug: e.slug })}
                onToggleFavorite={() => void toggleEventFavorite(e.id)}
              />
            );
          }
          if (item.type === 'walk') {
            const w = item.item as LoopWalk;
            return (
              <WalkCard
                walk={w}
                isFavorite
                onPress={() => navigation.navigate('LoopWalkDetail', { slug: w.slug })}
                onToggleFavorite={() => {
                  if (!user) return;
                  void toggleWalkFavorite(user.id, w.id).then((on) => {
                    setFavWalkIds((prev) =>
                      on ? [...prev, w.id] : prev.filter((id) => id !== w.id),
                    );
                  });
                }}
              />
            );
          }
          const loc = item.item as (typeof favSpots)[0];
          return (
            <SpotCard
              spot={loc}
              isFavorite={isLocationFavorite(loc.id)}
              onPress={() => navigation.navigate('SpotDetail', { slug: loc.slug })}
              onToggleFavorite={() =>
                void toggleLocationFavorite(loc.id, { kind: item.type === 'tool' ? 'tool' : 'spot' })
              }
            />
          );
        }}
      />
      </View>
    </ThemedScreenBackdrop>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  body: { paddingHorizontal: CONTENT_H_PADDING },
  denied: { flex: 1, paddingHorizontal: CONTENT_H_PADDING },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
});
