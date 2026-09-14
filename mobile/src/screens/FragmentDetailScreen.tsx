import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import {
  getChroniqueBySlug,
  recordChroniqueClick,
  type ChroniqueFeature,
} from '@/lib/chronique-store';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'FragmentDetail'>;

function resolveContact(feature: ChroniqueFeature): { label: string; url: string } | null {
  const phone = feature.contactPhone?.trim();
  if (phone) {
    const digits = phone.replace(/[^\d+]/g, '');
    if (digits) return { label: `Contacter · ${phone}`, url: `tel:${digits}` };
  }
  const email = feature.contactEmail?.trim();
  if (email) return { label: `Contacter · ${email}`, url: `mailto:${email}` };
  return null;
}

/** Détail Fragment (Chronique) — même contenu que la carte Accueil, en popup. */
export function FragmentDetailScreen({ route, navigation }: Props) {
  const { slug } = route.params;
  const { theme } = useMemberTheme();
  const c = theme.colors;
  const [feature, setFeature] = useState<ChroniqueFeature | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void getChroniqueBySlug(slug).then((f) => {
      if (!cancelled) {
        setFeature(f);
        setLoading(false);
        if (f) void recordChroniqueClick(f.id);
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
        <Text style={{ color: c.textSecondary }}>Le Fragment introuvable.</Text>
      </View>
    );
  }

  const canDiscover =
    feature.ctaEnabled && Boolean(feature.targetType) && Boolean(feature.targetSlug?.trim());
  const discoverLabel = feature.ctaLabel.trim() || 'Découvrir';
  const contact = !canDiscover ? resolveContact(feature) : null;

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.kicker, { color: c.accent }]}>Le Fragment</Text>
      {feature.volumeLabel?.trim() ? (
        <Text style={[styles.volume, { color: c.textMuted }]}>{feature.volumeLabel.trim()}</Text>
      ) : null}
      <Text style={[styles.title, { color: c.textPrimary }]}>{feature.title}</Text>
      <Text style={[styles.body, { color: c.textSecondary }]}>{feature.body}</Text>
      {feature.footnote ? (
        <Text style={[styles.footnote, { color: c.textMuted }]}>{feature.footnote}</Text>
      ) : null}

      {canDiscover ? (
        <Pressable
          onPress={() => {
            const type = feature.targetType;
            const targetSlug = feature.targetSlug?.trim();
            if (!type || !targetSlug) return;
            if (type === 'event') {
              navigation.navigate('EventDetail', { slug: targetSlug });
              return;
            }
            navigation.navigate('SpotDetail', { slug: targetSlug });
          }}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.accent, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Text style={styles.ctaText}>{discoverLabel}</Text>
        </Pressable>
      ) : contact ? (
        <Pressable
          onPress={() => void Linking.openURL(contact.url)}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: c.accent, opacity: pressed ? 0.9 : 1 },
          ]}
        >
          <Text style={styles.ctaText}>{contact.label}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, paddingBottom: 40 },
  kicker: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  volume: { fontSize: 11, fontWeight: '600', marginBottom: 10 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 12,
    lineHeight: 28,
  },
  body: { fontSize: 15, lineHeight: 22, marginBottom: 14 },
  footnote: { fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginBottom: 20 },
  cta: {
    alignSelf: 'flex-start',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 8,
  },
  ctaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
