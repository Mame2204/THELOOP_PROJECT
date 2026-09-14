import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FavoriteHeartButton } from '@/components/FavoriteHeartButton';
import { useAuthContext } from '@/context/AuthContext';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useScrollContentContainerStyle } from '@/hooks/useScrollContentContainerStyle';
import { usePromptFavoritesSignup } from '@/lib/favorites-auth-prompt';
import { useContent } from '@/context/ContentContext';
import {
  formatWalkMetaLine,
  listVisibleLoopWalks,
  type LoopWalk,
} from '@/lib/loop-walks-store';
import {
  isWalkFavorite,
  listWalkFavorites,
  toggleWalkFavorite,
} from '@/lib/walk-engagement-store';
import type { RootStackParamList } from '@/navigation/types';
import { canInteract } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LoopWalksList'>;

export function LoopWalksListScreen({ navigation }: Props) {
  const { user, role } = useAuthContext();
  const { publicEvents, getHomeLocations, activeCountryCode } = useContent();
  const { shell, theme } = useMemberTheme();
  const openFavoritesSignup = usePromptFavoritesSignup();
  const c = theme.colors;
  const listContentStyle = useScrollContentContainerStyle(styles.list, {
    stickyHeaderEstimate: 0,
    paddingBottom: 32,
  });
  const [walks, setWalks] = useState<LoopWalk[]>([]);
  const [favIds, setFavIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useFocusLoad(
    useCallback(
      async () => {
        const list = await listVisibleLoopWalks(publicEvents, getHomeLocations(), activeCountryCode);
        setWalks(list);
        if (user && user.id !== 'anonymous') {
          setFavIds(new Set(await listWalkFavorites(user.id)));
        } else {
          setFavIds(new Set());
        }
        setLoading(false);
      },
      [user, publicEvents, getHomeLocations, activeCountryCode],
    ),
    {
      ttlMs: 90_000,
      resetKey: `${user?.id ?? 'anon'}:${activeCountryCode}`,
    },
  );

  const onToggleFavorite = (walk: LoopWalk) => {
    if (!canInteract(role) || !user || user.id === 'anonymous') {
      openFavoritesSignup(navigation);
      return;
    }
    void toggleWalkFavorite(user.id, walk.id).then(async () => {
      const on = await isWalkFavorite(user.id, walk.id);
      setFavIds((prev) => {
        const next = new Set(prev);
        if (on) next.add(walk.id);
        else next.delete(walk.id);
        return next;
      });
    });
  };

  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : (
        <FlatList
          data={walks}
          keyExtractor={(item) => item.id}
          style={{ flex: 1 }}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={listContentStyle}
          alwaysBounceVertical
          overScrollMode="always"
          ListHeaderComponent={
            <Text style={[styles.intro, { color: shell.pageKicker }]}>
              Tous les parcours THE LOOP disponibles.
            </Text>
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun parcours pour le moment.</Text>
          }
          renderItem={({ item }) => {
            const isFavorite = favIds.has(item.id);
            return (
              <Pressable
                onPress={() => navigation.navigate('LoopWalkDetail', { slug: item.slug })}
                style={[styles.card, { borderColor: c.border, backgroundColor: c.surface }]}
              >
                <View style={styles.imgWrap}>
                  <RemoteImage uri={item.coverImageUrl} style={styles.img} resizeMode="cover" />
                  {item.isFeaturedWeek ? (
                    <View style={[styles.weekBadge, { backgroundColor: c.accent }]}>
                      <Text style={styles.weekBadgeText}>Semaine</Text>
                    </View>
                  ) : null}
                  <FavoriteHeartButton
                    active={isFavorite}
                    onPress={() => onToggleFavorite(item)}
                    size={18}
                    variant="overlay"
                    style={styles.heartBtn}
                  />
                </View>
                <View style={styles.body}>
                  <View style={[styles.tag, { borderColor: c.accent }]}>
                    <Text style={[styles.tagText, { color: c.accent }]} numberOfLines={1}>
                      {item.categoryLabel}
                    </Text>
                  </View>
                  <Text style={[styles.title, { color: c.textPrimary }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={[styles.meta, { color: c.textSecondary }]}>
                    {formatWalkMetaLine(item)}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  empty: { textAlign: 'center', marginTop: 40 },
  row: { gap: 10, marginBottom: 10 },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    maxWidth: '49%',
  },
  imgWrap: { position: 'relative' },
  img: { width: '100%', height: 110 },
  weekBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  weekBadgeText: { color: '#0a0a0a', fontSize: 9, fontWeight: '800' },
  heartBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  body: { padding: 10 },
  tag: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 5,
  },
  tagText: { fontSize: 9, fontWeight: '800' },
  title: { fontSize: 13, fontWeight: '800', lineHeight: 17 },
  meta: { marginTop: 4, fontSize: 10, fontWeight: '600' },
});
