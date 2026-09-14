import { useEffect, useRef, useState } from 'react';
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
import { useMemberTheme } from '@/hooks/useMemberTheme';
import {
  getCreatorCornerBySlug,
  type CreatorCornerFeature,
} from '@/lib/creator-corner-store';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreatorCornerDetail'>;

export function CreatorCornerDetailScreen({ route, navigation }: Props) {
  const { slug } = route.params;
  const { theme } = useMemberTheme();
  const c = theme.colors;
  const [feature, setFeature] = useState<CreatorCornerFeature | null>(null);
  const [loading, setLoading] = useState(true);
  const clickRecordedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getCreatorCornerBySlug(slug).then((f) => {
      if (!cancelled) {
        setFeature(f);
        setLoading(false);
        if (f && clickRecordedRef.current !== f.id) {
          clickRecordedRef.current = f.id;
          void import('@/lib/creator-corner-store').then((m) => m.recordCreatorCornerClick(f.id));
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (!feature) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <Text style={{ color: c.textSecondary }}>Le Singulier introuvable.</Text>
      </View>
    );
  }

  const canOpenRelated = Boolean(feature.relatedTargetSlug && feature.relatedTargetType);

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {feature.mediaUrl ? (
        <View style={styles.hero}>
          <RemoteImage
            uri={feature.mediaUrl}
            style={styles.heroImg}
            resizeMode="cover"
            contentPosition="top"
            renderWidth={900}
          />
        </View>
      ) : null}

      <View style={styles.pad}>
        {feature.badgeTag ? (
          <View style={[styles.heroBadge, { backgroundColor: c.accent }]}>
            <Text style={styles.heroBadgeText}>{feature.badgeTag}</Text>
          </View>
        ) : null}
        <View style={styles.metaRow}>
          {feature.category ? (
            <Text style={[styles.category, { color: c.accent }]}>{feature.category}</Text>
          ) : null}
          {feature.periodLabel ? (
            <Text style={[styles.period, { color: c.textMuted }]}>{feature.periodLabel}</Text>
          ) : null}
        </View>

        <Text style={[styles.subject, { color: c.textSecondary }]}>{feature.subjectName}</Text>
        <Text style={[styles.title, { color: c.textPrimary }]}>{feature.title}</Text>
        {feature.locationLabel ? (
          <Text style={[styles.location, { color: c.textMuted }]}>{feature.locationLabel}</Text>
        ) : null}

        {feature.coreQuote ? (
          <View style={[styles.quoteBox, { borderLeftColor: c.accent, backgroundColor: c.surface }]}>
            <Text style={[styles.quote, { color: c.textPrimary }]}>« {feature.coreQuote} »</Text>
          </View>
        ) : null}

        <Text style={[styles.sectionLabel, { color: c.accent }]}>L’impact</Text>
        <Text style={[styles.impact, { color: c.textPrimary }]}>{feature.impactDescription}</Text>

        {canOpenRelated ? (
          <Pressable
            onPress={() => {
              const relatedSlug = feature.relatedTargetSlug!;
              if (feature.relatedTargetType === 'event') {
                navigation.navigate('EventDetail', { slug: relatedSlug });
              } else {
                navigation.navigate('SpotDetail', { slug: relatedSlug });
              }
            }}
            style={[styles.relatedBtn, { borderColor: c.accentBorder, backgroundColor: c.accentSoft }]}
          >
            <Text style={[styles.relatedBtnText, { color: c.accentDeep }]}>
              Voir le contenu lié →
            </Text>
          </Pressable>
        ) : null}

        {feature.usefulLinks.length > 0 ? (
          <View style={styles.linksBlock}>
            <Text style={[styles.sectionLabel, { color: c.accent }]}>Aller plus loin</Text>
            <View style={styles.links}>
              {feature.usefulLinks.map((link) => (
                <Pressable
                  key={`${link.label}-${link.url}`}
                  onPress={() => void Linking.openURL(link.url)}
                  style={[styles.linkChip, { borderColor: c.border, backgroundColor: c.surface }]}
                >
                  <Text style={[styles.linkText, { color: c.textPrimary }]}>{link.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingBottom: 40 },
  hero: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  heroImg: { width: '100%', height: '100%' },
  heroBadge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    marginBottom: 10,
  },
  heroBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  pad: { paddingHorizontal: 16, paddingTop: 14 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  category: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    flex: 1,
  },
  period: { fontSize: 11, fontWeight: '600' },
  subject: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  location: { fontSize: 13, marginBottom: 14 },
  quoteBox: {
    borderLeftWidth: 3,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 18,
  },
  quote: { fontSize: 15, lineHeight: 22, fontStyle: 'italic', fontWeight: '600' },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  impact: { fontSize: 16, lineHeight: 24, marginBottom: 20 },
  relatedBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  relatedBtnText: { fontSize: 14, fontWeight: '800' },
  linksBlock: { marginTop: 4 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  linkText: { fontSize: 12, fontWeight: '700' },
});
