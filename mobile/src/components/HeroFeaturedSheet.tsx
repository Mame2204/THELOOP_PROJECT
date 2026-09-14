import { Linking, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useContent } from '@/context/ContentContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import {
  buildGoogleCalendarUrl,
  getEventInfoUrl,
  getEventShareText,
  isPaidEvent,
} from '@/lib/event-actions';
import { getLocationPrimaryAction, getLocationShareText, normalizeExternalUrl } from '@/lib/location-actions';
import type { RootStackParamList } from '@/navigation/types';
import type { ResolvedHeroBanner } from '@/types';

interface Props {
  banner: ResolvedHeroBanner | null;
  visible: boolean;
  onClose: () => void;
}

type Action = { key: string; label: string; onPress: () => void };

/** Popup d’actions « À la une » — sans quitter l’écran. */
export function HeroFeaturedSheet({ banner, visible, onClose }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { getEventBySlug, getLocationBySlug, publicEvents, getHomeLocations } = useContent();
  const { shell, theme } = useMemberTheme();
  const c = theme.colors;

  if (!banner) return null;

  const slugFromUrl = (url: string, kind: 'event' | 'location') => {
    if (kind === 'location') {
      return url.replace(/^\/spots\//, '').replace(/^spots\//, '').replace(/^\//, '');
    }
    return url.replace(/^\/agenda\//, '').replace(/^agenda\//, '').replace(/^\//, '');
  };

  const actions: Action[] = [];

  if (banner.targetType === 'event') {
    const slug = slugFromUrl(banner.linkUrl, 'event');
    const event =
      (slug ? getEventBySlug(slug) : null) ??
      publicEvents.find((e) => e.id === banner.targetId) ??
      null;

    if (event) {
      actions.push({
        key: 'fiche',
        label: 'Voir la fiche',
        onPress: () => {
          onClose();
          navigation.navigate('EventDetail', { slug: event.slug });
        },
      });

      const infoUrl = getEventInfoUrl(event);
      if (infoUrl) {
        actions.push({
          key: 'info',
          label: isPaidEvent(event) ? 'Réserver billet' : 'En savoir plus',
          onPress: () => {
            onClose();
            void Linking.openURL(infoUrl);
          },
        });
      }

      actions.push({
        key: 'cal',
        label: 'Ajouter au calendrier',
        onPress: () => {
          onClose();
          void Linking.openURL(buildGoogleCalendarUrl(event));
        },
      });

      actions.push({
        key: 'share',
        label: 'Partager',
        onPress: () => {
          onClose();
          void Share.share({ message: getEventShareText(event), title: event.title });
        },
      });

      if (event.instagramUrl?.trim()) {
        actions.push({
          key: 'ig',
          label: 'Instagram',
          onPress: () => {
            onClose();
            void Linking.openURL(normalizeExternalUrl(event.instagramUrl));
          },
        });
      }
      if (event.facebookUrl?.trim()) {
        actions.push({
          key: 'fb',
          label: 'Facebook',
          onPress: () => {
            onClose();
            void Linking.openURL(normalizeExternalUrl(event.facebookUrl));
          },
        });
      }
      if (event.websiteUrl?.trim()) {
        actions.push({
          key: 'web',
          label: 'Site web',
          onPress: () => {
            onClose();
            void Linking.openURL(normalizeExternalUrl(event.websiteUrl));
          },
        });
      }
    } else if (slug) {
      actions.push({
        key: 'fiche',
        label: 'Voir la fiche',
        onPress: () => {
          onClose();
          navigation.navigate('EventDetail', { slug });
        },
      });
    }
  } else {
    const slug = slugFromUrl(banner.linkUrl, 'location');
    const all = getHomeLocations();
    const spot =
      (slug ? getLocationBySlug(slug) : null) ??
      all.find((l) => l.id === banner.targetId) ??
      null;

    if (spot) {
      actions.push({
        key: 'fiche',
        label: 'Voir la fiche',
        onPress: () => {
          onClose();
          navigation.navigate('SpotDetail', { slug: spot.slug });
        },
      });

      const primary = getLocationPrimaryAction(spot);
      if (primary.href) {
        actions.push({
          key: 'cta',
          label: primary.label,
          onPress: () => {
            onClose();
            void Linking.openURL(primary.href);
          },
        });
      }

      if (spot.phone?.trim()) {
        actions.push({
          key: 'tel',
          label: 'Appeler',
          onPress: () => {
            onClose();
            void Linking.openURL(`tel:${spot.phone!.trim()}`);
          },
        });
      }

      actions.push({
        key: 'share',
        label: 'Partager',
        onPress: () => {
          onClose();
          void Share.share({ message: getLocationShareText(spot), title: spot.name });
        },
      });

      if (spot.instagramUrl?.trim()) {
        actions.push({
          key: 'ig',
          label: 'Instagram',
          onPress: () => {
            onClose();
            void Linking.openURL(normalizeExternalUrl(spot.instagramUrl));
          },
        });
      }
      if (spot.facebookUrl?.trim()) {
        actions.push({
          key: 'fb',
          label: 'Facebook',
          onPress: () => {
            onClose();
            void Linking.openURL(normalizeExternalUrl(spot.facebookUrl));
          },
        });
      }
      if (spot.website?.trim() && !primary.href) {
        actions.push({
          key: 'web',
          label: 'Site web',
          onPress: () => {
            onClose();
            void Linking.openURL(normalizeExternalUrl(spot.website));
          },
        });
      }
    } else if (slug) {
      actions.push({
        key: 'fiche',
        label: 'Voir la fiche',
        onPress: () => {
          onClose();
          navigation.navigate('SpotDetail', { slug });
        },
      });
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: c.surface, borderColor: c.border }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: c.border }]} />
          <Text style={[styles.kicker, { color: theme.colors.accent }]}>À la une</Text>
          <Text style={[styles.title, { color: shell.pageTitle }]} numberOfLines={2}>
            {banner.title}
          </Text>
          {banner.subtitle ? (
            <Text style={[styles.sub, { color: shell.pageKicker }]} numberOfLines={1}>
              {banner.subtitle}
            </Text>
          ) : null}

          <View style={styles.actions}>
            {actions.map((a) => (
              <Pressable
                key={a.key}
                onPress={a.onPress}
                style={[styles.action, { borderColor: c.border, backgroundColor: c.background }]}
              >
                <Text style={[styles.actionText, { color: shell.pageTitle }]}>{a.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable onPress={onClose} style={styles.cancel}>
            <Text style={[styles.cancelText, { color: shell.pageKicker }]}>Fermer</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: { fontSize: 18, fontWeight: '800', lineHeight: 24 },
  sub: { marginTop: 4, fontSize: 13 },
  actions: { marginTop: 16, gap: 8 },
  action: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  actionText: { fontSize: 14, fontWeight: '700', textAlign: 'center' },
  cancel: { marginTop: 12, paddingVertical: 10, alignItems: 'center' },
  cancelText: { fontSize: 13, fontWeight: '600' },
});
