import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CatalogCoverScrim } from '@/components/DetailHeroScrim';
import { FavoriteBarAction } from '@/components/FavoriteHeartButton';
import { useAuthContext } from '@/context/AuthContext';
import { useContent } from '@/context/ContentContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import type { HomeLocation } from '@/lib/demo-data';
import { formatWalkPriceLabel } from '@/lib/accueil-copy';
import {
  isPlatformLoopPartnerName,
  listHomePartnerLogos,
  type HomePartnerLogo,
} from '@/lib/home-partners-store';
import { usePromptFavoritesSignup } from '@/lib/favorites-auth-prompt';
import { normalizePartnerName } from '@/lib/partner-name-utils';
import {
  formatWalkMetaLine,
  getLoopWalkBySlug,
  type LoopWalk,
  type LoopWalkStep,
} from '@/lib/loop-walks-store';
import {
  recordWalkClick,
  toggleWalkFavorite,
  isWalkFavorite,
} from '@/lib/walk-engagement-store';
import { findWalkEvent, findWalkSpot, labelsMatch } from '@/lib/walk-step-resolve';
import { filterValidWalkSteps, isWalkPubliclyVisible } from '@/lib/walk-public-visibility';
import type { RootStackParamList } from '@/navigation/types';
import { canInteract } from '@/types';
import type { Event } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LoopWalkDetail'>;

type ResolvedStep = {
  title: string;
  kind: 'event' | 'spot' | 'tool';
  slug: string | null;
  placeLine: string;
  partnerId: string | null;
  partnerName: string | null;
};

function resolveStep(
  step: LoopWalkStep,
  events: Event[],
  spots: HomeLocation[],
): ResolvedStep {
  if (step.targetType === 'event') {
    const event = findWalkEvent(step, events);
    const place =
      event?.venueAddress?.trim() ||
      event?.venueName?.trim() ||
      '—';
    return {
      title: event?.title ?? step.title ?? 'Événement',
      kind: 'event',
      slug: event?.slug ?? null,
      placeLine: place,
      partnerId: event?.partnerId ?? null,
      partnerName: event?.organizerName?.trim() || null,
    };
  }

  const spot = findWalkSpot(step, spots);
  const isTool = step.targetType === 'tool' || spot?.subCategory === 'tools';
  const place = isTool
    ? spot?.subtitle?.trim() || spot?.toolCategory || 'Outil'
    : spot?.address?.trim() || spot?.district?.trim() || '—';

  return {
    title: spot?.name ?? step.title ?? (isTool ? 'Outil' : 'Spot'),
    kind: isTool ? 'tool' : 'spot',
    slug: spot?.slug ?? null,
    placeLine: place,
    partnerId: null,
    partnerName: spot?.organizerName?.trim() || spot?.developer?.trim() || null,
  };
}

export function LoopWalkDetailScreen({ route, navigation }: Props) {
  const { slug } = route.params;
  const { user, role } = useAuthContext();
  const { shell, theme } = useMemberTheme();
  const { publicEvents, getHomeLocations } = useContent();
  const openFavoritesSignup = usePromptFavoritesSignup();
  const c = theme.colors;
  const [walk, setWalk] = useState<LoopWalk | null>(null);
  const [loading, setLoading] = useState(true);
  const [partnerLogos, setPartnerLogos] = useState<HomePartnerLogo[]>([]);
  const [fav, setFav] = useState(false);

  // getHomeLocations() inclut déjà spots + outils.
  const allSpots = useMemo(() => getHomeLocations(), [getHomeLocations]);

  useEffect(() => {
    let cancelled = false;
    void getLoopWalkBySlug(slug).then(async (w) => {
      if (cancelled) return;
      if (w && !isWalkPubliclyVisible(w, publicEvents, allSpots)) {
        setWalk(null);
      } else {
        setWalk(w);
      }
      setLoading(false);
      if (w && isWalkPubliclyVisible(w, publicEvents, allSpots)) {
        void recordWalkClick(w.id);
        if (user && user.id !== 'anonymous') {
          setFav(await isWalkFavorite(user.id, w.id));
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // Pas de shell / setOptions : header popup masqué (évite boucle de rendu).
  }, [slug, user?.id, publicEvents, allSpots]);

  useEffect(() => {
    let cancelled = false;
    void listHomePartnerLogos().then((list) => {
      if (!cancelled) setPartnerLogos(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const displaySteps = useMemo(() => {
    if (!walk) return [] as LoopWalkStep[];
    return filterValidWalkSteps(walk, publicEvents, allSpots);
  }, [walk, publicEvents, allSpots]);

  const resolvedSteps = useMemo(() => {
    return displaySteps.map((step) => resolveStep(step, publicEvents, allSpots));
  }, [displaySteps, publicEvents, allSpots]);

  const associatedPartners = useMemo(() => {
    if (!walk) return [] as HomePartnerLogo[];

    const byKey = new Map<string, HomePartnerLogo>();

    const addFromLogo = (logo: HomePartnerLogo) => {
      if (isPlatformLoopPartnerName(logo.name)) return;
      byKey.set(normalizePartnerName(logo.name), logo);
    };

    const matchLogo = (partnerId: string | null, partnerName: string | null) => {
      if (partnerId) {
        const byId = partnerLogos.find((p) => p.partnerId === partnerId);
        if (byId) {
          addFromLogo(byId);
          return;
        }
      }
      if (!partnerName?.trim() || isPlatformLoopPartnerName(partnerName)) return;
      const byName = partnerLogos.find(
        (p) =>
          normalizePartnerName(p.name) === normalizePartnerName(partnerName) ||
          labelsMatch(p.name, partnerName),
      );
      if (byName) addFromLogo(byName);
    };

    for (const pid of walk.partnerIds) {
      const found = partnerLogos.find((p) => p.partnerId === pid);
      if (found) addFromLogo(found);
    }

    for (const step of resolvedSteps) {
      matchLogo(step.partnerId, step.partnerName);
    }

    return Array.from(byKey.values());
  }, [walk, resolvedSteps, partnerLogos]);

  const onFavorite = () => {
    if (!canInteract(role) || !user || user.id === 'anonymous') {
      openFavoritesSignup(navigation);
      return;
    }
    if (!walk) return;
    void toggleWalkFavorite(user.id, walk.id).then(setFav);
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (!walk) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={{ color: c.textSecondary }}>Parcours introuvable.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <RemoteImage uri={walk.coverImageUrl} style={styles.heroImg} resizeMode="cover" />
          <CatalogCoverScrim />
          <View style={[styles.tag, { backgroundColor: c.accent }]}>
            <Text style={styles.tagText}>{walk.categoryLabel}</Text>
          </View>
          <View style={styles.heroBody}>
            <Text style={styles.heroTitle}>{walk.title}</Text>
            <View style={styles.heroMetaRow}>
              <Text style={styles.heroMeta}>{formatWalkMetaLine(walk)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.pad}>
          {walk.summary ? (
            <Text style={[styles.summary, { color: c.textSecondary }]}>{walk.summary}</Text>
          ) : null}
          {walk.description ? (
            <>
              <Text style={[styles.section, { color: c.accent }]}>À propos</Text>
              <Text style={[styles.body, { color: c.textPrimary }]}>{walk.description}</Text>
            </>
          ) : null}

          <View
            style={[
              styles.infoCard,
              { backgroundColor: c.surface, borderColor: c.border },
            ]}
          >
            <View style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: c.textSecondary }]}>Tarif</Text>
              <Text style={[styles.infoValue, { color: c.accentDeep }]}>
                {formatWalkPriceLabel(walk.priceType, walk.priceLabel)}
              </Text>
            </View>
            {walk.contactPhone || walk.contactUrl ? (
              <View style={[styles.infoActions, { borderTopColor: c.border }]}>
                {walk.contactPhone ? (
                  <Pressable
                    onPress={() => void Linking.openURL(`tel:${walk.contactPhone!.replace(/\s/g, '')}`)}
                    style={[styles.infoBtn, { backgroundColor: c.accentSoft, borderColor: c.accentBorder }]}
                  >
                    <Text style={[styles.infoBtnText, { color: c.accentDeep }]}>Appeler</Text>
                  </Pressable>
                ) : null}
                {walk.contactUrl ? (
                  <Pressable
                    onPress={() => void Linking.openURL(walk.contactUrl!)}
                    style={[styles.infoBtn, { backgroundColor: c.accentSoft, borderColor: c.accentBorder }]}
                  >
                    <Text style={[styles.infoBtnText, { color: c.accentDeep }]}>Contacter</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          <Text style={[styles.section, { color: c.accent }]}>Itinéraire</Text>
          <View style={styles.timeline}>
            {resolvedSteps.map((resolved, index) => {
              const step = displaySteps[index] ?? walk.steps[index];
              const canOpen = Boolean(resolved.slug);
              const isLast = index === resolvedSteps.length - 1;
              return (
                <View key={`${step.order}-${step.targetId}`} style={styles.timelineItem}>
                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineDot, { backgroundColor: c.accent, borderColor: c.accentDeep }]}>
                      <Text style={styles.timelineDotText}>{step.order}</Text>
                    </View>
                    {!isLast ? (
                      <View style={[styles.timelineLine, { backgroundColor: c.accentBorder }]} />
                    ) : null}
                  </View>
                  <Pressable
                    disabled={!canOpen}
                    onPress={() => {
                      if (!resolved.slug) return;
                      if (resolved.kind === 'event') {
                        navigation.navigate('EventDetail', { slug: resolved.slug });
                      } else {
                        navigation.navigate('SpotDetail', { slug: resolved.slug });
                      }
                    }}
                    style={({ pressed }) => [
                      styles.timelineCard,
                      {
                        borderColor: canOpen ? c.accentBorder : c.border,
                        backgroundColor: c.surfaceElevated,
                        opacity: pressed && canOpen ? 0.92 : canOpen ? 1 : 0.75,
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canOpen }}
                    accessibilityLabel={`${resolved.title}. ${resolved.placeLine}`}
                  >
                    <Text style={[styles.stepKind, { color: c.accent }]}>
                      {resolved.kind === 'event' ? 'Événement' : resolved.kind === 'tool' ? 'Outil' : 'Spot'}
                      {' · '}
                      Étape {step.order}
                    </Text>
                    <Text style={[styles.stepTitle, { color: c.textPrimary }]}>{resolved.title}</Text>
                    <Text style={[styles.stepDesc, { color: c.textSecondary }]} numberOfLines={2}>
                      {resolved.placeLine}
                    </Text>
                    {canOpen ? (
                      <Text style={[styles.stepCta, { color: c.accentDeep }]}>Voir la fiche →</Text>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>

          {associatedPartners.length > 0 ? (
            <>
              <Text style={[styles.section, { color: c.accent, marginTop: 16 }]}>
                Partenaires du parcours
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.partnerRow}
              >
                {associatedPartners.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() =>
                      navigation.navigate('PartnerPublic', {
                        partnerId: p.partnerId,
                        partnerName: p.name,
                        logoUrl: p.logoUrl,
                      })
                    }
                    style={[styles.partnerCard, { borderColor: c.border, backgroundColor: c.surface }]}
                  >
                    <RemoteImage uri={p.logoUrl} style={styles.partnerLogo} resizeMode="contain" />
                    <Text style={[styles.partnerName, { color: c.textSecondary }]} numberOfLines={2}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}
        </View>
      </ScrollView>

      {/* Favoris — barre bas (comme Spot) */}
      <View style={[styles.stickyBar, { backgroundColor: shell.pageBg, borderTopColor: c.border }]}>
        <View style={[styles.saveBtn, { backgroundColor: theme.colors.ctaBg }]}>
          <FavoriteBarAction active={fav} onPress={onFavorite} textColor={theme.colors.ctaText} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 110 },
  hero: { height: 240, backgroundColor: '#111' },
  heroImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  tag: {
    position: 'absolute',
    top: 16,
    left: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tagText: { color: '#0a0a0a', fontSize: 10, fontWeight: '800' },
  heroBody: { position: 'absolute', left: 16, right: 16, bottom: 18 },
  heroMetaRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', lineHeight: 28 },
  heroMeta: { flex: 1, minWidth: 0, color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },
  pad: { paddingHorizontal: 16, paddingTop: 16 },
  summary: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  section: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 8,
  },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  infoCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    marginTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  infoValue: { fontSize: 15, fontWeight: '800' },
  infoActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  infoBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  infoBtnText: { fontSize: 13, fontWeight: '800' },
  timeline: { marginTop: 4, marginBottom: 8 },
  timelineItem: { flexDirection: 'row', gap: 12, minHeight: 88 },
  timelineRail: { width: 28, alignItems: 'center' },
  timelineDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotText: { color: '#0a0a0a', fontSize: 11, fontWeight: '800' },
  timelineLine: { width: 2, flex: 1, marginTop: 4, marginBottom: 4, borderRadius: 1 },
  timelineCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  stepKind: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  stepTitle: { fontSize: 14, fontWeight: '800' },
  stepDesc: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  stepCta: { marginTop: 8, fontSize: 12, fontWeight: '700' },
  partnerRow: { gap: 10, paddingBottom: 8 },
  partnerCard: {
    width: 92,
    borderWidth: 1,
    borderRadius: 12,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  partnerLogo: { width: 48, height: 48, borderRadius: 10 },
  partnerName: { marginTop: 6, fontSize: 10, fontWeight: '700', textAlign: 'center' },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
  },
  saveBtn: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center' },
  saveBtnText: { fontWeight: '700', fontSize: 13, textAlign: 'center' },
});
