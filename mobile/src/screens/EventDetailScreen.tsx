import { useEffect } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EventPhotoGallery } from '@/components/EventPhotoGallery';
import { CoverImage } from '@/components/CoverImage';
import { DetailHeroScrim, detailHeroTextShadow } from '@/components/DetailHeroScrim';
import { FavoriteBarAction, FavoriteHeartButton } from '@/components/FavoriteHeartButton';
import { buildDetailGalleryImages } from '@/lib/detail-gallery-utils';
import { EventMetaStrip } from '@/components/EventMetaStrip';
import { ShareIcon } from '@/components/ShareIcon';
import { SocialLinksRow } from '@/components/SocialLinksRow';
import { ContentBenefitsSection } from '@/components/ContentBenefitsSection';
import { getEventCategoryStyle } from '@/lib/event-styles';
import {
  buildGoogleCalendarUrl,
  getEventInfoUrl,
  getEventShareText,
} from '@/lib/event-actions';
import { useContent } from '@/context/ContentContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useCategoryLabels } from '@/context/CategoryLabelsContext';
import type { RootStackParamList } from '@/navigation/types';
import { usePromptFavoritesSignup } from '@/lib/favorites-auth-prompt';
import { formatEventLocationDisplay } from '@/lib/content-location-utils';
import { recordEventClick } from '@/lib/event-engagement-store';

type Props = NativeStackScreenProps<RootStackParamList, 'EventDetail'>;

const HERO_HEIGHT = 220;

export function EventDetailScreen({ route, navigation }: Props) {
  const { getEventBySlug, getHomeLocations } = useContent();
  const { role } = useAuthContext();
  const { shell, theme } = useMemberTheme();
  const { isEventFavorite, toggleEventFavorite } = useFavorites();
  const { eventLabel, eventEmoji } = useCategoryLabels();
  const openFavoritesSignup = usePromptFavoritesSignup();
  const event = getEventBySlug(route.params.slug);

  useEffect(() => {
    if (!event?.id) return;
    void recordEventClick(event.id);
  }, [event?.id]);

  // Header masqué (popup) — ne pas appeler setOptions (shell nouveau à chaque rendu → boucle).

  if (!event) {
    return (
      <View style={[styles.center, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageKicker }}>Événement introuvable.</Text>
      </View>
    );
  }

  const style = getEventCategoryStyle(event.category);
  const galleryImages = buildDetailGalleryImages(event.coverImageUrl, event.galleryImages);
  const infoUrl = getEventInfoUrl(event);
  const isPaid = event.entryPrice != null && event.entryPrice > 0 && !event.isInvitationOnly;
  const isFavorite = isEventFavorite(event.id);
  const cardBg = shell.filterInactiveBg;
  const cardBorder = shell.filterInactiveBorder;
  const textColor = shell.pageTitle;
  const mutedColor = shell.pageKicker;
  const locationLine = formatEventLocationDisplay(event);
  const linkedSpot = event.locationId
    ? getHomeLocations().find((loc) => loc.id === event.locationId)
    : undefined;
  const openLinkedSpot = linkedSpot
    ? () => navigation.navigate('SpotDetail', { slug: linkedSpot.slug })
    : undefined;

  const onFavorite = () => {
    if (role === 'USER_ANONYMOUS') {
      openFavoritesSignup(navigation);
      return;
    }
    void toggleEventFavorite(event.id);
  };

  return (
    <View style={[styles.page, { backgroundColor: shell.pageBg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        {galleryImages.length > 1 ? (
          <EventPhotoGallery
            images={galleryImages}
            title={event.title}
            categoryLabel={eventLabel(event.category)}
            categoryEmoji={eventEmoji(event.category) !== '🏷️' ? eventEmoji(event.category) : style.emoji}
            locationLine={locationLine}
            onLocationPress={openLinkedSpot}
            favoriteControl={
              <FavoriteHeartButton active={isFavorite} onPress={onFavorite} size={24} variant="overlay" />
            }
          />
        ) : (
          <View style={styles.hero}>
            <CoverImage uri={event.coverImageUrl} height={HERO_HEIGHT} fallbackColor={style.fallback} borderRadius={16} />
            <DetailHeroScrim />
            <View style={styles.heroOverlay}>
              <View style={styles.heroTop}>
                <View style={styles.categoryBadgeWrap}>
                  <Text style={[styles.categoryBadge, detailHeroTextShadow]}>
                    {eventEmoji(event.category) !== '🏷️' ? eventEmoji(event.category) : style.emoji} {eventLabel(event.category)}
                  </Text>
                </View>
                <FavoriteHeartButton active={isFavorite} onPress={onFavorite} size={24} variant="overlay" />
              </View>
              <View style={styles.heroBottom}>
                <Text style={[styles.heroTitle, detailHeroTextShadow]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                  {event.title}
                </Text>
                {locationLine ? (
                  openLinkedSpot ? (
                    <Pressable onPress={openLinkedSpot} accessibilityRole="link">
                      <Text style={[styles.heroLocation, styles.heroLocationLink, detailHeroTextShadow]} numberOfLines={1}>
                        📍 {locationLine}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text style={[styles.heroLocation, detailHeroTextShadow]} numberOfLines={1}>
                      📍 {locationLine}
                    </Text>
                  )
                ) : null}
              </View>
            </View>
          </View>
        )}

        <View style={[styles.metaWrap, { marginTop: 8 }]}>
          <EventMetaStrip
            event={event}
          />
        </View>

        <Text style={[styles.section, { color: mutedColor }]}>À propos de l'événement</Text>
        <Text style={[styles.body, { color: textColor }]}>{event.description}</Text>

        {event.organizerName ? (
          <>
            <Text style={[styles.section, { color: mutedColor }]}>Organisateur</Text>
            <Text style={[styles.body, { color: textColor }]}>{event.organizerName}</Text>
          </>
        ) : null}

        {event.program ? (
          <>
            <Text style={[styles.section, { color: mutedColor }]}>Programme</Text>
            <Text style={[styles.body, { color: textColor }]}>{event.program}</Text>
          </>
        ) : null}

        {event.speakers.length > 0 ? (
          <>
            <Text style={[styles.section, { color: mutedColor }]}>Speakers confirmés</Text>
            {event.speakers.map((sp) => (
              <View key={sp.id} style={[styles.speakerCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <View style={[styles.speakerAvatar, { backgroundColor: theme.colors.ctaBg }]}>
                  <Text style={styles.speakerInitial}>{sp.name.charAt(0)}</Text>
                </View>
                <View style={styles.speakerInfo}>
                  <Text style={[styles.speakerName, { color: textColor }]}>{sp.name}</Text>
                  <Text style={[styles.speakerMeta, { color: mutedColor }]}>
                    {sp.title}{sp.company ? ` · ${sp.company}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </>
        ) : null}

        <SocialLinksRow
          instagramUrl={event.instagramUrl}
          facebookUrl={event.facebookUrl}
          websiteUrl={event.websiteUrl}
          shell={shell}
        />

        <ContentBenefitsSection contentId={event.id} contentType="event" shell={shell} />

        {isPaid && infoUrl ? (
          <Pressable
            style={[styles.cta, { backgroundColor: theme.colors.ctaBg }]}
            onPress={() => void Linking.openURL(infoUrl)}
          >
            <Text style={[styles.ctaText, { color: theme.colors.ctaText }]}>
              Réserver billet
            </Text>
          </Pressable>
        ) : infoUrl ? (
          <Pressable
            style={[styles.cta, { backgroundColor: theme.colors.ctaBg }]}
            onPress={() => void Linking.openURL(infoUrl)}
          >
            <Text style={[styles.ctaText, { color: theme.colors.ctaText }]}>
              En savoir plus
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          <Pressable style={[styles.actionBtn, { backgroundColor: cardBg, borderColor: cardBorder }]} onPress={() => void Linking.openURL(buildGoogleCalendarUrl(event))}>
            <Text style={[styles.actionText, { color: textColor }]}>📅 Calendrier</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: cardBg, borderColor: cardBorder }]}
            onPress={() => void Share.share({ message: getEventShareText(event), title: event.title })}
          >
            <View style={styles.shareRow}>
              <ShareIcon size={18} color={textColor} />
              <Text style={[styles.actionText, { color: textColor }]}>Partager</Text>
            </View>
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.stickyBar, { backgroundColor: shell.pageBg, borderTopColor: cardBorder }]}>
        <View style={[styles.saveBtn, { backgroundColor: theme.colors.ctaBg }]}>
          <FavoriteBarAction active={isFavorite} onPress={onFavorite} textColor={theme.colors.ctaText} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, paddingBottom: 100 },
  hero: { position: 'relative', height: HERO_HEIGHT, borderRadius: 16, overflow: 'hidden' },
  heroOverlay: { ...StyleSheet.absoluteFillObject },
  heroTop: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  categoryBadgeWrap: { flexShrink: 1, maxWidth: '80%' },
  categoryBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.58)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  heart: { fontSize: 22 },
  heroBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 4,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#ffffff', lineHeight: 24 },
  heroLocation: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.96)',
  },
  heroLocationLink: {
    textDecorationLine: 'underline',
  },
  metaWrap: { marginTop: 12, borderRadius: 16, overflow: 'hidden' },
  section: { marginTop: 20, fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  body: { marginTop: 8, lineHeight: 22, fontSize: 14 },
  speakerCard: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, borderWidth: 1, padding: 12 },
  speakerAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  speakerInitial: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  speakerInfo: { flex: 1 },
  speakerName: { fontSize: 14, fontWeight: '600' },
  speakerMeta: { marginTop: 2, fontSize: 11 },
  cta: { marginTop: 20, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  ctaText: { fontWeight: '700', fontSize: 14 },
  actions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 12, alignItems: 'center' },
  actionText: { fontSize: 12, fontWeight: '600' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stickyBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 24, borderTopWidth: 1 },
  saveBtn: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center' },
  saveBtnText: { fontWeight: '700', fontSize: 13, textAlign: 'center' },
  lockedPage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  lockIcon: { fontSize: 48 },
  lockedTitle: { marginTop: 16, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  lockedBody: { marginTop: 12, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  lockedBtn: { marginTop: 24, backgroundColor: '#D4AF37', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12 },
  lockedBtnText: { fontWeight: '700', color: '#000' },
  lockedBack: { marginTop: 16, fontSize: 13, fontWeight: '600' },
});
