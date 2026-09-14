import { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { CATALOG_SCRIM_COLOR, CATALOG_SCRIM_HEIGHT } from '@/components/DetailHeroScrim';
import { useContent } from '@/context/ContentContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import { colors } from '@/theme/colors';
import type { ResolvedHeroBanner } from '@/types';
import {
  CONTENT_H_PADDING,
  HERO_COLLAPSE_SCROLL,
  HERO_COMPACT_HEIGHT,
  HERO_HEIGHT,
  SEARCH_TO_HERO_GAP,
} from '@/constants/layout';

const TRANSITION_MS = 280;

interface HeroSliderProps {
  variant?: 'events' | 'spots' | 'tools' | 'home';
  /** Déclenche une animation fluide vers la bande horizontale (pas de liaison au scroll). */
  collapsed?: boolean;
  /** En-tête fixe (Accueil / catalogues) : marges réduites, le bandeau ne disparaît pas au scroll. */
  pinned?: boolean;
}

const HeroSlide = memo(function HeroSlide({
  item,
  width,
  progress,
  isFloating,
  showScrim,
  onPress,
}: {
  item: ResolvedHeroBanner;
  width: number;
  progress: Animated.Value;
  isFloating: boolean;
  /** Accueil « À la une » : pas de voile (badge or + ombre texte suffisent). */
  showScrim: boolean;
  onPress: () => void;
}) {
  const height = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [HERO_HEIGHT, HERO_COMPACT_HEIGHT],
  });

  const borderRadius = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 12],
  });

  const fadeOpacity = progress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [1, 0.35, 0.22],
    extrapolate: 'clamp',
  });

  const expandedOpacity = progress.interpolate({
    inputRange: [0, 0.3, 0.55],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  const compactOpacity = progress.interpolate({
    inputRange: [0.45, 0.7, 1],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  const imageUrl = item.imageUrl;

  return (
    <Pressable onPress={onPress} style={{ width }}>
      <Animated.View
        style={[
          styles.cardShell,
          isFloating && styles.cardFloating,
          { width, height, borderRadius },
        ]}
      >
        <RemoteImage uri={imageUrl} style={styles.image} resizeMode="cover" fallbackColor="#374151" renderWidth={800} />

        {showScrim ? (
          <Animated.View style={[styles.fade, { opacity: fadeOpacity }]} />
        ) : null}

        <Animated.View
          style={[styles.contentExpanded, { opacity: expandedOpacity }]}
          pointerEvents="none"
        >
          <View style={styles.badge}>
            <Text style={styles.badgeText}>À la une</Text>
          </View>
          <Text style={styles.titleExpanded} numberOfLines={1}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text style={styles.subtitleExpanded} numberOfLines={1}>{item.subtitle}</Text>
          ) : null}
        </Animated.View>

        <Animated.View
          style={[styles.compactRow, { opacity: compactOpacity }]}
          pointerEvents="none"
        >
          <View style={styles.compactThumbZone} />
          <View style={styles.compactBody}>
            <Text style={styles.compactBadge}>À la une</Text>
            <Text style={styles.compactTitle} numberOfLines={1}>{item.title}</Text>
            {item.subtitle ? (
              <Text style={styles.compactSubtitle} numberOfLines={1}>{item.subtitle}</Text>
            ) : null}
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

export function HeroSlider({ variant = 'events', collapsed = false, pinned = false }: HeroSliderProps) {
  const {
    featuredBanners,
    featuredSpotBanners,
    featuredToolBanners,
    getEventBySlug,
    getLocationBySlug,
    publicEvents,
    getHomeLocations,
  } = useContent();
  const { grade } = useMemberTheme();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.max(windowWidth - CONTENT_H_PADDING * 2, 280);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const banners = (() => {
    const source =
      variant === 'home'
        ? [...featuredBanners, ...featuredSpotBanners, ...featuredToolBanners]
        : variant === 'tools'
          ? featuredToolBanners
          : variant === 'spots'
            ? featuredSpotBanners
            : featuredBanners;
    const seen = new Set<string>();
    const unique: ResolvedHeroBanner[] = [];
    for (const b of source) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      unique.push(b);
    }
    return unique;
  })();
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const progress = useRef(new Animated.Value(collapsed ? 1 : 0)).current;
  const isFloating = grade === 'member' || grade === 'prime';

  function openBannerDetail(item: ResolvedHeroBanner) {
    const slugFromUrl = (url: string, kind: 'event' | 'location') => {
      if (kind === 'location') {
        return url.replace(/^\/spots\//, '').replace(/^spots\//, '').replace(/^\//, '');
      }
      return url.replace(/^\/agenda\//, '').replace(/^agenda\//, '').replace(/^\//, '');
    };

    if (item.targetType === 'event') {
      const slug = slugFromUrl(item.linkUrl, 'event');
      const event =
        (slug ? getEventBySlug(slug) : null) ??
        publicEvents.find((e) => e.id === item.targetId) ??
        null;
      if (event?.slug) {
        navigation.navigate('EventDetail', { slug: event.slug });
        return;
      }
      if (slug) navigation.navigate('EventDetail', { slug });
      return;
    }

    const slug = slugFromUrl(item.linkUrl, 'location');
    const spot =
      (slug ? getLocationBySlug(slug) : null) ??
      getHomeLocations().find((l) => l.id === item.targetId) ??
      getHomeLocations('tools').find((l) => l.id === item.targetId) ??
      null;
    if (spot?.slug) {
      navigation.navigate('SpotDetail', { slug: spot.slug });
      return;
    }
    if (slug) navigation.navigate('SpotDetail', { slug });
  }

  useEffect(() => {
    Animated.timing(progress, {
      toValue: collapsed ? 1 : 0,
      duration: TRANSITION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [collapsed, progress]);

  useEffect(() => {
    setCurrent(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [banners.length, variant, cardWidth]);

  useEffect(() => {
    if (banners.length <= 1 || collapsed) return;
    const timer = setInterval(() => {
      setCurrent((prev) => {
        const next = (prev + 1) % banners.length;
        scrollRef.current?.scrollTo({ x: next * cardWidth, animated: true });
        return next;
      });
    }, 5500);
    return () => clearInterval(timer);
  }, [banners.length, collapsed, cardWidth]);

  if (banners.length === 0) return null;

  const marginTop = progress.interpolate({
    inputRange: [0, 1],
    outputRange: pinned ? [4, 2] : [SEARCH_TO_HERO_GAP, 6],
  });

  const marginBottom = progress.interpolate({
    inputRange: [0, 1],
    outputRange: pinned ? [8, 4] : [12, 6],
  });

  const shellHeight = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [HERO_HEIGHT, HERO_COMPACT_HEIGHT],
  });

  const dotsOpacity = progress.interpolate({
    inputRange: [0, 0.25, 0.5],
    outputRange: [1, 0.4, 0],
    extrapolate: 'clamp',
  });

  const dotsHeight = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [24, 8, 0],
    extrapolate: 'clamp',
  });

  function onScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    setCurrent(Math.max(0, Math.min(index, banners.length - 1)));
  }

  return (
    <Animated.View style={[styles.listWrap, { marginTop, marginBottom }]}>
      <Animated.View style={[styles.carouselShell, { height: shellHeight }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          decelerationRate="fast"
          directionalLockEnabled
          onMomentumScrollEnd={onScrollEnd}
          contentContainerStyle={{ alignItems: 'stretch' }}
        >
          {banners.map((item) => (
            <HeroSlide
              key={item.id}
              item={item}
              width={cardWidth}
              progress={progress}
              isFloating={isFloating}
              showScrim={variant !== 'home'}
              onPress={() => openBannerDetail(item)}
            />
          ))}
        </ScrollView>
      </Animated.View>
      {banners.length > 1 ? (
        <Animated.View style={[styles.dots, { opacity: dotsOpacity, height: dotsHeight }]}>
          {banners.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => {
                setCurrent(i);
                scrollRef.current?.scrollTo({ x: i * cardWidth, animated: true });
              }}
              hitSlop={8}
            >
              <View style={[styles.dot, i === current && styles.dotActive]} />
            </Pressable>
          ))}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export { HERO_HEIGHT, HERO_COMPACT_HEIGHT, HERO_COLLAPSE_SCROLL };

const styles = StyleSheet.create({
  listWrap: {
    width: '100%',
    overflow: 'visible',
  },
  carouselShell: {
    width: '100%',
    overflow: Platform.OS === 'ios' ? 'visible' : 'hidden',
  },
  cardShell: {
    overflow: 'hidden',
    backgroundColor: colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  cardFloating: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: CATALOG_SCRIM_HEIGHT,
    backgroundColor: CATALOG_SCRIM_COLOR,
  },
  contentExpanded: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    padding: 18,
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.gold,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  badgeText: {
    color: colors.black,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  titleExpanded: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subtitleExpanded: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.95)',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  compactRow: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  compactThumbZone: { width: 72 },
  compactBody: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 0,
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  compactBadge: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: colors.gold,
    textTransform: 'uppercase',
  },
  compactTitle: { marginTop: 2, fontSize: 13, fontWeight: '700', color: colors.publicText },
  compactSubtitle: { marginTop: 1, fontSize: 10, color: colors.publicMuted },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginTop: 10,
    overflow: 'hidden',
  },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.2)' },
  dotActive: { width: 18, backgroundColor: colors.gold },
});
