import { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useContent } from '@/context/ContentContext';
import { subscribeHomeRefresh } from '@/lib/home-refresh';
import {
  loadActiveChronique,
  recordChroniqueClick,
  type ChroniqueFeature,
} from '@/lib/chronique-store';

interface ChroniqueCardProps {
  accent: string;
  text: string;
  muted: string;
  surface: string;
  border: string;
  onDiscover: (feature: ChroniqueFeature) => void;
  /** Ouvre le détail Fragment (popup). */
  onOpenDetail?: (feature: ChroniqueFeature) => void;
}

function resolveContactAction(feature: ChroniqueFeature): { label: string; url: string } | null {
  const phone = feature.contactPhone?.trim();
  if (phone) {
    const digits = phone.replace(/[^\d+]/g, '');
    if (digits) return { label: `Contacter · ${phone}`, url: `tel:${digits}` };
  }
  const email = feature.contactEmail?.trim();
  if (email) return { label: `Contacter · ${email}`, url: `mailto:${email}` };
  return null;
}

/** Carte Chronique Accueil — indépendante du Corner, compacte, thème app. */
export function ChroniqueCard({
  accent,
  text,
  muted,
  surface,
  border,
  onDiscover,
  onOpenDetail,
}: ChroniqueCardProps) {
  const { activeCountryCode } = useContent();
  const [feature, setFeature] = useState<ChroniqueFeature | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(
    (force = false) => {
      setLoading(true);
      void loadActiveChronique(activeCountryCode, { force }).then((f) => {
        setFeature(f);
        setLoading(false);
      });
    },
    [activeCountryCode],
  );

  useEffect(() => {
    reload(false);
  }, [reload]);

  useEffect(
    () =>
      subscribeHomeRefresh((reason) => {
        if (reason.startsWith('admin-accueil') && reason.includes('chronique')) {
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

  const canDiscover =
    feature.ctaEnabled &&
    Boolean(feature.targetType) &&
    Boolean(feature.targetSlug?.trim());
  const discoverLabel = feature.ctaLabel.trim() || 'Découvrir';
  const contact = !canDiscover ? resolveContactAction(feature) : null;

  return (
    <Pressable
      onPress={() => onOpenDetail?.(feature)}
      disabled={!onOpenDetail}
      style={({ pressed }) => [
        styles.shell,
        { backgroundColor: surface, borderColor: border, opacity: pressed && onOpenDetail ? 0.96 : 1 },
      ]}
    >
      <View style={styles.head}>
        <Text style={[styles.kicker, { color: accent }]}>Le Fragment</Text>
        {feature.volumeLabel?.trim() ? (
          <Text style={[styles.volume, { color: muted }]}>{feature.volumeLabel.trim()}</Text>
        ) : null}
      </View>

      <Text style={[styles.title, { color: text }]} numberOfLines={1}>
        {feature.title}
      </Text>

      <Text style={[styles.body, { color: muted }]} numberOfLines={onOpenDetail ? 4 : undefined}>
        {feature.body}
      </Text>

      {feature.footnote ? (
        <Text style={[styles.footnote, { color: muted }]} numberOfLines={2}>
          {feature.footnote}
        </Text>
      ) : null}

      {canDiscover ? (
        <Pressable
          onPress={() => {
            void recordChroniqueClick(feature.id);
            onDiscover(feature);
          }}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: accent, opacity: pressed ? 0.88 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={discoverLabel}
        >
          <Text style={styles.ctaText}>{discoverLabel}</Text>
        </Pressable>
      ) : contact ? (
        <Pressable
          onPress={() => {
            void recordChroniqueClick(feature.id);
            void Linking.openURL(contact.url);
          }}
          style={({ pressed }) => [
            styles.cta,
            { backgroundColor: accent, opacity: pressed ? 0.88 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={contact.label}
        >
          <Text style={styles.ctaText}>{contact.label}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  kicker: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  volume: {
    fontSize: 10,
    fontWeight: '600',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
    lineHeight: 24,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    marginBottom: 10,
  },
  footnote: {
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  cta: {
    marginTop: 4,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
