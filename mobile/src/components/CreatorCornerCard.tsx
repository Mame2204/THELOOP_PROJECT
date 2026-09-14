import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CatalogCoverScrim, detailHeroTextShadow } from '@/components/DetailHeroScrim';
import { RemoteImage } from '@/components/RemoteImage';
import { useContent } from '@/context/ContentContext';
import { ACCUEIL_COPY } from '@/lib/accueil-copy';
import { subscribeHomeRefresh } from '@/lib/home-refresh';
import {
  loadActiveCreatorCorner,
  type CreatorCornerFeature,
} from '@/lib/creator-corner-store';

interface CreatorCornerCardProps {
  accent: string;
  text: string;
  muted: string;
  surface: string;
  border: string;
  onOpen: (feature: CreatorCornerFeature) => void;
}

/** Carte Accueil — impact / œuvre (pas de portrait biographique). */
export function CreatorCornerCard({
  accent,
  text,
  muted,
  surface,
  border,
  onOpen,
}: CreatorCornerCardProps) {
  const { activeCountryCode } = useContent();
  const [feature, setFeature] = useState<CreatorCornerFeature | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(
    (force = false) => {
      setLoading(true);
      void loadActiveCreatorCorner(activeCountryCode, { force }).then((f) => {
        setFeature(f);
        setLoading(false);
      });
    },
    [activeCountryCode],
  );

  useEffect(() => {
    reload(false);
  }, [reload]);

  // Accueil parent recharge déjà via useFocusLoad — pas de re-fetch au focus (egress).

  useEffect(
    () =>
      subscribeHomeRefresh((reason) => {
        // Accueil parent recharge déjà — éviter double force + images.
        if (reason.startsWith('admin-accueil') && reason.includes('corner')) {
          reload(true);
        }
      }),
    [reload],
  );

  if (loading) {
    return (
      <View style={[styles.shell, { backgroundColor: surface, borderColor: border }]}>
        <ActivityIndicator color={accent} />
      </View>
    );
  }

  if (!feature) return null;

  return (
    <View style={[styles.shell, { backgroundColor: surface, borderColor: border }]}>
      <View style={styles.head}>
        <Text style={[styles.kicker, { color: accent }]}>{ACCUEIL_COPY.corner.kicker}</Text>
        {feature.periodLabel ? (
          <Text style={[styles.period, { color: muted }]}>{feature.periodLabel}</Text>
        ) : null}
      </View>

      {feature.mediaUrl ? (
        <Pressable
          onPress={() => onOpen(feature)}
          style={({ pressed }) => [styles.mediaWrap, { opacity: pressed ? 0.94 : 1 }]}
        >
          <RemoteImage
            uri={feature.mediaUrl}
            style={styles.media}
            resizeMode="cover"
            contentPosition="top"
            renderWidth={800}
          />
          <CatalogCoverScrim />
          <View style={styles.nameOverlay} pointerEvents="none">
            <Text style={styles.nameOnPhoto} numberOfLines={1}>
              {feature.subjectName}
            </Text>
          </View>
        </Pressable>
      ) : (
        <Text style={[styles.subject, { color: text }]} numberOfLines={1}>
          {feature.subjectName}
        </Text>
      )}

      {feature.badgeTag ? (
        <View style={[styles.badge, { backgroundColor: accent }]}>
          <Text style={styles.badgeText} numberOfLines={1}>
            {feature.badgeTag}
          </Text>
        </View>
      ) : null}

      <View style={styles.metaRow}>
        {feature.category ? (
          <Text style={[styles.category, { color: accent }]} numberOfLines={1}>
            {feature.category}
          </Text>
        ) : null}
        {feature.locationLabel ? (
          <Text style={[styles.location, { color: muted }]} numberOfLines={1}>
            {feature.locationLabel}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.title, { color: text }]} numberOfLines={2}>
        {feature.title}
      </Text>

      <Pressable
        onPress={() => onOpen(feature)}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: accent, opacity: pressed ? 0.9 : 1 },
        ]}
      >
        <Text style={styles.ctaText}>{feature.ctaLabel?.trim() || 'Découvrir'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  kicker: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  period: { fontSize: 10, fontWeight: '600' },
  mediaWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: '#e5e7eb',
    position: 'relative',
  },
  media: { width: '100%', height: '100%' },
  nameOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 28,
  },
  nameOnPhoto: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
    ...detailHeroTextShadow,
  },
  badge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 8,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 6,
  },
  category: {
    flex: 1,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  location: { fontSize: 11, fontWeight: '600' },
  subject: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  title: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    letterSpacing: -0.2,
    marginBottom: 12,
  },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 999,
    minWidth: 120,
    alignItems: 'center',
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
