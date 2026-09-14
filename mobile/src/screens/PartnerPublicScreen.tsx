import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EventCard } from '@/components/EventCard';
import { SpotCard } from '@/components/SpotCard';
import { FilterPills } from '@/components/FilterPills';
import { useContent } from '@/context/ContentContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useScrollContentContainerStyle } from '@/hooks/useScrollContentContainerStyle';
import {
  filterPartnerPublicContent,
  listPartnerLinkedContentIds,
} from '@/lib/home-partners-store';
import { usePromptFavoritesSignup } from '@/lib/favorites-auth-prompt';
import type { RootStackParamList } from '@/navigation/types';
import type { Event } from '@/types';
import type { HomeLocation } from '@/lib/demo-data';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerPublic'>;
type TabFilter = 'all' | 'events' | 'spots' | 'tools';

type Row =
  | { kind: 'event'; id: string; item: Event }
  | { kind: 'spot' | 'tool'; id: string; item: HomeLocation };

const FILTERS: { value: TabFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'events', label: 'Événements' },
  { value: 'spots', label: 'Spots' },
  { value: 'tools', label: 'Outils' },
];

export function PartnerPublicScreen({ route, navigation }: Props) {
  const { partnerId, partnerName, logoUrl } = route.params;
  const { shell, theme } = useMemberTheme();
  const { role } = useAuthContext();
  const { publicEvents, getHomeLocations } = useContent();
  const { isEventFavorite, isLocationFavorite, toggleEventFavorite, toggleLocationFavorite } = useFavorites();
  const openFavoritesSignup = usePromptFavoritesSignup();
  const c = theme.colors;

  const [filter, setFilter] = useState<TabFilter>('all');
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const listContentStyle = useScrollContentContainerStyle(styles.list, { paddingBottom: 40 });

  useEffect(() => {
    navigation.setOptions({
      title: partnerName,
      headerStyle: { backgroundColor: shell.pageBg },
      headerTintColor: shell.tabIndicator,
      headerTitleStyle: { color: shell.pageTitle },
    });
  }, [navigation, partnerName, shell]);

  const spots = useMemo(
    () => getHomeLocations().filter((l) => l.subCategory !== 'tools' && l.visibility !== 'prime'),
    [getHomeLocations],
  );
  const tools = useMemo(() => getHomeLocations('tools'), [getHomeLocations]);

  useEffect(() => {
    let cancelled = false;
    const liveIds = new Set([
      ...publicEvents.map((e) => e.id),
      ...spots.map((s) => s.id),
      ...tools.map((t) => t.id),
    ]);
    void listPartnerLinkedContentIds(partnerId, partnerName, liveIds).then((ids) => {
      if (!cancelled) {
        setLinkedIds(ids);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [partnerId, partnerName, publicEvents, spots, tools]);

  const grouped = useMemo(
    () =>
      filterPartnerPublicContent(partnerId, partnerName, publicEvents, spots, tools, linkedIds),
    [partnerId, partnerName, publicEvents, spots, tools, linkedIds],
  );

  const rows = useMemo(() => {
    const list: Row[] = [];
    if (filter === 'all' || filter === 'events') {
      grouped.events.forEach((e) => list.push({ kind: 'event', id: e.id, item: e }));
    }
    if (filter === 'all' || filter === 'spots') {
      grouped.spots.forEach((s) => list.push({ kind: 'spot', id: s.id, item: s }));
    }
    if (filter === 'all' || filter === 'tools') {
      grouped.tools.forEach((t) => list.push({ kind: 'tool', id: t.id, item: t }));
    }
    return list;
  }, [filter, grouped]);

  const onFavoriteEvent = useCallback(
    (id: string) => {
      if (role === 'USER_ANONYMOUS') {
        openFavoritesSignup(navigation);
        return;
      }
      void toggleEventFavorite(id);
    },
    [role, navigation, openFavoritesSignup, toggleEventFavorite],
  );

  const onFavoriteLoc = useCallback(
    (id: string, kind: 'spot' | 'tool') => {
      if (role === 'USER_ANONYMOUS') {
        openFavoritesSignup(navigation);
        return;
      }
      void toggleLocationFavorite(id, { kind });
    },
    [role, navigation, openFavoritesSignup, toggleLocationFavorite],
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.background }}
      data={rows}
      keyExtractor={(row) => `${row.kind}-${row.id}`}
      contentContainerStyle={listContentStyle}
      alwaysBounceVertical
      overScrollMode="always"
      ListHeaderComponent={
        <View style={styles.header}>
          {logoUrl ? (
            <RemoteImage uri={logoUrl} style={[styles.logo, { borderColor: c.border }]} resizeMode="cover" />
          ) : null}
          <Text style={[styles.name, { color: c.textPrimary }]}>{partnerName}</Text>
          <Text style={[styles.meta, { color: c.textSecondary }]}>
            {grouped.events.length} événement{grouped.events.length !== 1 ? 's' : ''} ·{' '}
            {grouped.spots.length} spot{grouped.spots.length !== 1 ? 's' : ''} ·{' '}
            {grouped.tools.length} outil{grouped.tools.length !== 1 ? 's' : ''}
          </Text>
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
      }
      ListEmptyComponent={
        <Text style={[styles.empty, { color: c.textSecondary }]}>
          Aucun contenu public associé à ce partenaire pour le moment.
        </Text>
      }
      renderItem={({ item: row }) => {
        if (row.kind === 'event') {
          return (
            <EventCard
              event={row.item}
              isFavorite={isEventFavorite(row.item.id)}
              onPress={() => navigation.navigate('EventDetail', { slug: row.item.slug })}
              onToggleFavorite={() => onFavoriteEvent(row.item.id)}
            />
          );
        }
        return (
          <SpotCard
            spot={row.item}
            isFavorite={isLocationFavorite(row.item.id)}
            onPress={() => navigation.navigate('SpotDetail', { slug: row.item.slug })}
            onToggleFavorite={() => onFavoriteLoc(row.item.id, row.kind)}
          />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 40, gap: 12 },
  header: { marginBottom: 12, alignItems: 'center' },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  name: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  meta: { marginTop: 4, marginBottom: 12, fontSize: 12, textAlign: 'center' },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 13, lineHeight: 18 },
});
