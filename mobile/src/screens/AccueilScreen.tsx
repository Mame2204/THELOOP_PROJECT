import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChroniqueCard } from '@/components/ChroniqueCard';
import { CreatorCornerCard } from '@/components/CreatorCornerCard';
import { EventCard } from '@/components/EventCard';
import { HeroSlider } from '@/components/HeroSlider';
import { LoopWalksHomeBlock } from '@/components/LoopWalksHomeBlock';
import { OneTapPoll } from '@/components/OneTapPoll';
import { PageHeader } from '@/components/PageHeader';
import { PartnersLogoStrip } from '@/components/PartnersLogoStrip';
import { SearchBar } from '@/components/SearchBar';
import { SpotCard } from '@/components/SpotCard';
import { SystemUnavailableBanner } from '@/components/SystemUnavailableBanner';
import { ThemedScreenBackdrop } from '@/components/ThemedScreenBackdrop';
import { CONTENT_H_PADDING, HERO_COLLAPSE_SCROLL, HERO_COMPACT_HEIGHT, HERO_EXPAND_SCROLL, HERO_HEIGHT, SEARCH_TO_HERO_GAP } from '@/constants/layout';
import { useAuthContext } from '@/context/AuthContext';
import { useAppGates } from '@/context/AppGatesContext';
import { useContent } from '@/context/ContentContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useScrollContentContainerStyle } from '@/hooks/useScrollContentContainerStyle';
import {
  DEFAULT_SECTIONS,
  getAppSections,
  type AccueilBlocksConfig,
} from '@/lib/app-sections-store';
import { listContentIdsWithBenefits } from '@/lib/content-benefits-index';
import { subscribeHomeRefresh } from '@/lib/home-refresh';
import { listLoopWalks, type LoopWalk } from '@/lib/loop-walks-store';
import { filterPublicWalks } from '@/lib/walk-public-visibility';
import { countUserActiveBenefits } from '@/lib/prime-benefits-store';
import { filterEventsByQuery, filterLocationsByQuery } from '@/lib/search-utils';
import { usePromptFavoritesSignup } from '@/lib/favorites-auth-prompt';
import { isPassPurchaseUiEnabled } from '@/lib/pass-purchase-ui';
import { isAuthenticated } from '@/types';
import type { TabScreenProps } from '@/navigation/types';

type Props = TabScreenProps<'Accueil'>;

const WELCOME_LINES = [
  "Qu'est-ce qu'on fait aujourd'hui ?",
  'Envie d’une sortie ?',
  'Conakry t’attend.',
  'On commence par où ?',
];

function pickWelcomeLine(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i) * (i + 1)) % 997;
  return WELCOME_LINES[hash % WELCOME_LINES.length] ?? WELCOME_LINES[0];
}

export function AccueilScreen({ navigation }: Props) {
  const { user, role } = useAuthContext();
  const { gates } = useAppGates();
  const showPrivilegeBadges = isPassPurchaseUiEnabled(gates);
  const { shell, theme } = useMemberTheme();
  const { isUnavailable, publicEvents, getHomeLocations, activeCountryCode, refresh: refreshContent } = useContent();
  const { isEventFavorite, isLocationFavorite, toggleEventFavorite, toggleLocationFavorite } =
    useFavorites();
  const openFavoritesSignup = usePromptFavoritesSignup();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeBenefits, setActiveBenefits] = useState(0);
  const [heroCollapsed, setHeroCollapsed] = useState(false);
  const [blocks, setBlocks] = useState<AccueilBlocksConfig>(DEFAULT_SECTIONS.accueil);
  const [benefitIds, setBenefitIds] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [walkCatalog, setWalkCatalog] = useState<LoopWalk[]>([]);
  const [walksLoading, setWalksLoading] = useState(false);
  const [walkHits, setWalkHits] = useState<Array<{ id: string; slug: string; title: string; summary: string | null }>>([]);
  const [cornerHit, setCornerHit] = useState<{ id: string; slug: string; title: string; subjectName: string } | null>(null);
  const [chroniqueHit, setChroniqueHit] = useState<{
    id: string;
    title: string;
    locationLabel: string | null;
    targetType: 'event' | 'spot' | 'tool' | null;
    targetSlug: string | null;
    ctaEnabled: boolean;
    contactPhone: string | null;
    contactEmail: string | null;
  } | null>(null);
  const c = theme.colors;

  const reloadHome = useCallback(async (force = false) => {
    if (force) setWalksLoading(true);
    const [sections, ids, walks, corner, chronique] = await Promise.all([
      getAppSections(activeCountryCode, { force }),
      listContentIdsWithBenefits(),
      listLoopWalks(activeCountryCode, { force }),
      import('@/lib/creator-corner-store').then((m) => m.loadActiveCreatorCorner(activeCountryCode, { force })),
      import('@/lib/chronique-store').then((m) => m.loadActiveChronique(activeCountryCode, { force })),
    ]);
    setBlocks(sections?.accueil ?? DEFAULT_SECTIONS.accueil);
    setBenefitIds(ids instanceof Set ? ids : new Set());
    const safeWalks = Array.isArray(walks) ? walks : [];
    setWalkCatalog(safeWalks);
    setWalkHits(
      safeWalks.map((w) => ({ id: w.id, slug: w.slug, title: w.title, summary: w.summary })),
    );
    setCornerHit(
      corner?.id && corner.slug
        ? {
            id: corner.id,
            slug: corner.slug,
            title: corner.title ?? '',
            subjectName: corner.subjectName ?? '',
          }
        : null,
    );
    setChroniqueHit(
      chronique?.id
        ? {
            id: chronique.id,
            title: chronique.title ?? '',
            locationLabel: chronique.locationLabel ?? null,
            targetType: chronique.targetType ?? null,
            targetSlug: chronique.targetSlug ?? null,
            ctaEnabled: chronique.ctaEnabled !== false,
            contactPhone: chronique.contactPhone ?? null,
            contactEmail: chronique.contactEmail ?? null,
          }
        : null,
    );
    setWalksLoading(false);
    if (force) setRefreshKey((k) => k + 1);
  }, [activeCountryCode]);

  const openChroniqueTarget = useCallback(
    (target: {
      targetType: 'event' | 'spot' | 'tool' | null;
      targetSlug: string | null;
      ctaEnabled?: boolean;
      contactPhone?: string | null;
      contactEmail?: string | null;
    }) => {
      const canDiscover =
        target.ctaEnabled !== false &&
        Boolean(target.targetType) &&
        Boolean(target.targetSlug?.trim());
      if (canDiscover) {
        const slug = target.targetSlug!.trim();
        if (target.targetType === 'event') {
          navigation.navigate('EventDetail', { slug });
          return;
        }
        navigation.navigate('SpotDetail', { slug });
        return;
      }
      const phone = target.contactPhone?.trim();
      if (phone) {
        const digits = phone.replace(/[^\d+]/g, '');
        if (digits) {
          void Linking.openURL(`tel:${digits}`);
          return;
        }
      }
      const email = target.contactEmail?.trim();
      if (email) void Linking.openURL(`mailto:${email}`);
    },
    [navigation],
  );

  const catalogLocations = useMemo(() => getHomeLocations(), [getHomeLocations]);

  const featuredWalk = useMemo(() => {
    const visible = filterPublicWalks(walkCatalog, publicEvents, catalogLocations);
    return visible.find((w) => w.isFeaturedWeek) ?? visible[0] ?? null;
  }, [walkCatalog, publicEvents, catalogLocations]);

  useFocusLoad(
    async (force) => {
      await reloadHome(force);
    },
    { ttlMs: 60_000, resetKey: activeCountryCode },
  );

  useEffect(
    () =>
      subscribeHomeRefresh((reason) => {
        const force =
          reason === 'accueil-blocks'
          || reason === 'sections'
          || reason.startsWith('admin-accueil');
        void reloadHome(force);
      }),
    [reloadHome],
  );

  const welcomeName = useMemo(() => {
    if (!user || user.id === 'anonymous') return null;
    const first = user.firstName?.trim();
    if (first) return first;
    const full = user.fullName?.trim();
    if (full) return full.split(/\s+/)[0] ?? full;
    return null;
  }, [user]);

  const loggedIn = isAuthenticated(role);

  useEffect(() => {
    if (!user || user.id === 'anonymous') {
      setActiveBenefits(0);
      return;
    }
    let cancelled = false;
    void countUserActiveBenefits(user.id, { phone: user.phoneNumber, email: user.email }).then((n) => {
      if (!cancelled) setActiveBenefits(n);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.phoneNumber, user?.email, refreshKey]);

  const welcomeSub = useMemo(() => {
    if (activeBenefits > 0) {
      return activeBenefits === 1
        ? 'Votre privilège vous attend.'
        : `Vos ${activeBenefits} privilèges vous attendent.`;
    }
    const seed = `${user?.id ?? 'guest'}-${new Date().toDateString()}`;
    return pickWelcomeLine(seed);
  }, [activeBenefits, user?.id]);

  const toggleSearch = useCallback(() => {
    setSearchOpen((prev) => {
      if (prev) {
        setQuery('');
        return false;
      }
      return true;
    });
  }, []);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    setHeroCollapsed((prev) => {
      if (!prev && y >= HERO_COLLAPSE_SCROLL) return true;
      if (prev && y <= HERO_EXPAND_SCROLL) return false;
      return prev;
    });
  }, []);

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

  const onFavoriteSpot = useCallback(
    (id: string, kind?: 'tool' | 'spot') => {
      if (role === 'USER_ANONYMOUS') {
        openFavoritesSignup(navigation);
        return;
      }
      void toggleLocationFavorite(id, kind ? { kind } : { kind: 'spot' });
    },
    [role, navigation, openFavoritesSignup, toggleLocationFavorite],
  );

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([reloadHome(true), refreshContent()]);
    } finally {
      setRefreshing(false);
    }
  }, [reloadHome, refreshContent]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { events: [], spots: [], tools: [], walks: [], corner: null as typeof cornerHit, chronique: null as typeof chroniqueHit };
    const events = filterEventsByQuery(publicEvents ?? [], q).slice(0, 6);
    const spots = filterLocationsByQuery(
      (getHomeLocations() ?? []).filter((l) => l.visibility !== 'prime' && l.subCategory !== 'tools'),
      q,
    ).slice(0, 6);
    const tools = filterLocationsByQuery(
      (getHomeLocations('tools') ?? []).filter((l) => l.isVerified === true),
      q,
    ).slice(0, 6);
    const walks = (walkHits ?? [])
      .filter(
        (w) =>
          w.title.toLowerCase().includes(q) ||
          (w.summary?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 4);
    const corner =
      cornerHit &&
      (cornerHit.title.toLowerCase().includes(q) ||
        cornerHit.subjectName.toLowerCase().includes(q))
        ? cornerHit
        : null;
    const chronique =
      chroniqueHit &&
      (chroniqueHit.title.toLowerCase().includes(q) ||
        (chroniqueHit.locationLabel?.toLowerCase().includes(q) ?? false))
        ? chroniqueHit
        : null;
    return { events, spots, tools, walks, corner, chronique };
  }, [query, publicEvents, getHomeLocations, walkHits, cornerHit, chroniqueHit]);

  const hasSearchHits =
    searchResults.events.length +
      searchResults.spots.length +
      searchResults.tools.length +
      searchResults.walks.length +
      (searchResults.corner ? 1 : 0) +
      (searchResults.chronique ? 1 : 0) >
    0;

  const showHero = blocks.hero && (!searchOpen || !query.trim());

  const stickyHeaderEstimate = useMemo(() => {
    let h = 56;
    if (isUnavailable) h += 28;
    if (searchOpen) h += 52;
    else if (loggedIn && !heroCollapsed) h += 64;
    if (showHero && !searchOpen) {
      h += heroCollapsed
        ? HERO_COMPACT_HEIGHT + 12
        : HERO_HEIGHT + SEARCH_TO_HERO_GAP + 12 + 24;
    }
    return h;
  }, [isUnavailable, searchOpen, loggedIn, heroCollapsed, showHero]);

  const scrollContentStyle = useScrollContentContainerStyle(styles.content, {
    stickyHeaderEstimate,
    includeTabBar: true,
    paddingBottom: 28,
  });

  return (
    <ThemedScreenBackdrop theme={theme}>
      <View style={styles.page}>
        <View style={[styles.sticky, { backgroundColor: 'transparent' }]}>
          <PageHeader
            title="Accueil"
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
                onChangeText={setQuery}
                placeholder="Rechercher sur Accueil…"
                accentColor={c.accent}
                accentSoft={c.accentSoft}
                borderColor={c.border}
                autoFocus
              />
            ) : null}

            {loggedIn && !searchOpen && !heroCollapsed ? (
              <View
                style={[
                  styles.welcome,
                  {
                    backgroundColor: c.surface,
                    borderColor: c.border,
                  },
                  theme.elevation.card,
                ]}
              >
                <Text style={[styles.welcomeKicker, { color: c.accent }]}>Bienvenue</Text>
                <Text style={[styles.welcomeTitle, { color: c.textPrimary }]}>
                  {welcomeName ? `Bonjour, ${welcomeName}` : 'Bonjour'}
                </Text>
                <Text style={[styles.welcomeSub, { color: c.textSecondary }]}>{welcomeSub}</Text>
              </View>
            ) : null}

            {showHero && !searchOpen ? (
              <HeroSlider key={`hero-${refreshKey}`} variant="home" collapsed={heroCollapsed} pinned />
            ) : null}
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={scrollContentStyle}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          alwaysBounceVertical
          overScrollMode="always"
          onScroll={onScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onPullRefresh()} tintColor={c.accent} />
          }
        >
          {searchOpen && query.trim() ? (
            <View style={styles.searchHits}>
              {!hasSearchHits ? (
                <Text style={[styles.emptySearch, { color: c.textSecondary }]}>
                  Aucun résultat pour « {query.trim()} ».
                </Text>
              ) : (
                <>
                  {searchResults.events.length > 0 ? (
                    <Text style={[styles.groupLabel, { color: c.accent }]}>Agenda</Text>
                  ) : null}
                  {searchResults.events.map((e) => (
                    <View key={`e-${e.id}`} style={styles.cardWrap}>
                      {showPrivilegeBadges && benefitIds.has(e.id) ? (
                        <View style={[styles.benefitBadge, { backgroundColor: c.accent }]}>
                          <Text style={styles.benefitBadgeText}>Privilèges</Text>
                        </View>
                      ) : null}
                      <EventCard
                        event={e}
                        isFavorite={isEventFavorite(e.id)}
                        onPress={() => navigation.navigate('EventDetail', { slug: e.slug })}
                        onToggleFavorite={() => onFavoriteEvent(e.id)}
                      />
                    </View>
                  ))}

                  {searchResults.spots.length > 0 ? (
                    <Text style={[styles.groupLabel, { color: c.accent }]}>Spots</Text>
                  ) : null}
                  {searchResults.spots.map((s) => (
                    <View key={`s-${s.id}`} style={styles.cardWrap}>
                      {showPrivilegeBadges && benefitIds.has(s.id) ? (
                        <View style={[styles.benefitBadge, { backgroundColor: c.accent }]}>
                          <Text style={styles.benefitBadgeText}>Privilèges</Text>
                        </View>
                      ) : null}
                      <SpotCard
                        spot={s}
                        isFavorite={isLocationFavorite(s.id)}
                        onPress={() => navigation.navigate('SpotDetail', { slug: s.slug })}
                        onToggleFavorite={() => onFavoriteSpot(s.id)}
                      />
                    </View>
                  ))}

                  {searchResults.tools.length > 0 ? (
                    <Text style={[styles.groupLabel, { color: c.accent }]}>Outils</Text>
                  ) : null}
                  {searchResults.tools.map((t) => (
                    <View key={`t-${t.id}`} style={styles.cardWrap}>
                      {showPrivilegeBadges && benefitIds.has(t.id) ? (
                        <View style={[styles.benefitBadge, { backgroundColor: c.accent }]}>
                          <Text style={styles.benefitBadgeText}>Privilèges</Text>
                        </View>
                      ) : null}
                      <SpotCard
                        spot={t}
                        isFavorite={isLocationFavorite(t.id)}
                        onPress={() => navigation.navigate('SpotDetail', { slug: t.slug })}
                        onToggleFavorite={() => onFavoriteSpot(t.id, 'tool')}
                      />
                    </View>
                  ))}

                  {searchResults.walks.length > 0 ? (
                    <Text style={[styles.groupLabel, { color: c.accent }]}>Parcours</Text>
                  ) : null}
                  {searchResults.walks.map((w) => (
                    <Pressable
                      key={`w-${w.id}`}
                      style={[styles.hit, { borderColor: c.border, backgroundColor: c.surface }]}
                      onPress={() => navigation.navigate('LoopWalkDetail', { slug: w.slug })}
                    >
                      <Text style={[styles.hitKicker, { color: c.accent }]}>Parcours</Text>
                      <Text style={[styles.hitTitle, { color: c.textPrimary }]} numberOfLines={1}>
                        {w.title}
                      </Text>
                      {w.summary ? (
                        <Text style={[styles.hitMeta, { color: c.textSecondary }]} numberOfLines={2}>
                          {w.summary}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))}

                  {searchResults.corner ? (
                    <>
                      <Text style={[styles.groupLabel, { color: c.accent }]}>Le Singulier</Text>
                      <Pressable
                        style={[styles.hit, { borderColor: c.border, backgroundColor: c.surface }]}
                        onPress={() =>
                          navigation.navigate('CreatorCornerDetail', { slug: searchResults.corner!.slug })
                        }
                      >
                        <Text style={[styles.hitKicker, { color: c.accent }]}>Le Singulier</Text>
                        <Text style={[styles.hitTitle, { color: c.textPrimary }]} numberOfLines={1}>
                          {searchResults.corner.subjectName}
                        </Text>
                        <Text style={[styles.hitMeta, { color: c.textSecondary }]} numberOfLines={1}>
                          {searchResults.corner.title}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                  {searchResults.chronique ? (
                    <>
                      <Text style={[styles.groupLabel, { color: c.accent }]}>Le Fragment</Text>
                      <Pressable
                        style={[styles.hit, { borderColor: c.border, backgroundColor: c.surface }]}
                        onPress={() => openChroniqueTarget(searchResults.chronique!)}
                      >
                        <Text style={[styles.hitKicker, { color: c.accent }]}>Le Fragment</Text>
                        <Text style={[styles.hitTitle, { color: c.textPrimary }]} numberOfLines={1}>
                          {searchResults.chronique.title}
                        </Text>
                        <Text style={[styles.hitMeta, { color: c.textSecondary }]} numberOfLines={1}>
                          {searchResults.chronique.locationLabel ?? 'Contenu lié'}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                </>
              )}
            </View>
          ) : (
            <>
              {blocks.poll ? (
                <OneTapPoll
                  key={`poll-${refreshKey}`}
                  accent={c.accent}
                  surface={c.surface}
                  border={c.border}
                  text={c.textPrimary}
                  muted={c.textSecondary}
                  background={c.background}
                />
              ) : null}

              {blocks.corner ? (
                <CreatorCornerCard
                  key={`corner-${refreshKey}`}
                  accent={c.accent}
                  text={c.textPrimary}
                  muted={c.textSecondary}
                  surface={c.surface}
                  border={c.border}
                  onOpen={(feature) =>
                    navigation.navigate('CreatorCornerDetail', { slug: feature.slug })
                  }
                />
              ) : null}

              {blocks.chronique ? (
                <ChroniqueCard
                  key={`chronique-${refreshKey}`}
                  accent={c.accent}
                  text={c.textPrimary}
                  muted={c.textSecondary}
                  surface={c.surface}
                  border={c.border}
                  onOpenDetail={(feature) =>
                    navigation.navigate('FragmentDetail', { slug: feature.slug })
                  }
                  onDiscover={(feature) => openChroniqueTarget(feature)}
                />
              ) : null}

              {blocks.walks ? (
                <LoopWalksHomeBlock
                  featured={featuredWalk}
                  loading={walksLoading}
                  accent={c.accent}
                  text={c.textPrimary}
                  muted={c.textSecondary}
                  surface={c.surface}
                  border={c.border}
                  onOpenWalk={(walk) => navigation.navigate('LoopWalkDetail', { slug: walk.slug })}
                  onOpenList={() => navigation.navigate('LoopWalksList')}
                />
              ) : null}

              {blocks.logos ? (
                <PartnersLogoStrip
                  key={`logos-${activeCountryCode}-${refreshKey}`}
                  accent={c.accent}
                  text={c.textPrimary}
                  muted={c.textSecondary}
                  surface={c.surface}
                  border={c.border}
                />
              ) : null}
            </>
          )}
        </ScrollView>
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
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: CONTENT_H_PADDING,
    paddingTop: 4,
  },
  welcome: {
    marginTop: 2,
    marginBottom: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  welcomeKicker: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  welcomeTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  welcomeSub: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  emptySearch: { fontSize: 13, marginBottom: 12 },
  searchHits: { gap: 10, marginBottom: 12 },
  groupLabel: {
    marginTop: 8,
    marginBottom: 2,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  hit: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hitKicker: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  hitTitle: { fontSize: 14, fontWeight: '700' },
  hitMeta: { marginTop: 4, fontSize: 12, lineHeight: 16 },
  cardWrap: { position: 'relative' },
  benefitBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  benefitBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
