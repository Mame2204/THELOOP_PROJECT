import { useEffect } from 'react';
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LocationPhotoGallery } from '@/components/LocationPhotoGallery';
import { LocationMetaStrip } from '@/components/LocationMetaStrip';
import { ToolMetaStrip } from '@/components/ToolMetaStrip';
import { ToolPhotoGallery } from '@/components/ToolPhotoGallery';
import { SocialLinksRow } from '@/components/SocialLinksRow';
import { ContentBenefitsSection } from '@/components/ContentBenefitsSection';
import { ShareIcon } from '@/components/ShareIcon';
import { FavoriteBarAction } from '@/components/FavoriteHeartButton';
import { getLocationPrimaryAction, getLocationShareText } from '@/lib/location-actions';
import { buildDetailGalleryImages } from '@/lib/detail-gallery-utils';
import { useContent } from '@/context/ContentContext';
import { useFavorites } from '@/context/FavoritesContext';
import { useAuthContext } from '@/context/AuthContext';
import { useCategoryLabels } from '@/context/CategoryLabelsContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { recordSpotClick } from '@/lib/spot-stars-store';
import { submitToolClaimRequest } from '@/lib/tool-claim-store';
import { usePromptFavoritesSignup } from '@/lib/favorites-auth-prompt';
import type { RootStackParamList } from '@/navigation/types';
import type { HomeLocation } from '@/lib/demo-data';
import { isToolLocation } from '@/lib/location-kind-utils';

type Props = NativeStackScreenProps<RootStackParamList, 'SpotDetail'>;

function buildToolGalleryImages(spot: HomeLocation): string[] {
  const primary = spot.logoUrl ?? spot.coverImageUrl;
  const gallery = (spot.galleryImages ?? []).filter(Boolean);
  if (gallery.length > 0) {
    if (primary && !gallery.includes(primary)) return [primary, ...gallery];
    return gallery;
  }
  return primary ? [primary] : [];
}

export function SpotDetailScreen({ route, navigation }: Props) {
  const { getLocationBySlug } = useContent();
  const { role } = useAuthContext();
  const { shell, theme } = useMemberTheme();
  const { spotLabel, spotEmoji } = useCategoryLabels();
  const { isLocationFavorite, toggleLocationFavorite } = useFavorites();
  const openFavoritesSignup = usePromptFavoritesSignup();
  const spot = getLocationBySlug(route.params.slug);
  const isTool = spot ? isToolLocation(spot) : false;
  const spotCategorySlugs = spot && !isTool
    ? (spot.categories?.length ? spot.categories : [spot.subCategory]).filter(Boolean)
    : [];

  useEffect(() => {
    if (!spot?.id) return;
    void recordSpotClick(spot.id, {
      countryCode: spot.countryCode,
      ratingAverage: spot.ratingAvg ?? 0,
    });
  }, [spot?.id]);

  // Header masqué (popup) — éviter setOptions (dépendance shell → boucle infinie).

  if (!spot) {
    return (
      <View style={[styles.center, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageKicker }}>Fiche introuvable.</Text>
      </View>
    );
  }

  const images = !isTool
    ? buildDetailGalleryImages(spot.coverImageUrl, spot.galleryImages)
    : [];

  const toolImages = isTool ? buildToolGalleryImages(spot) : [];

  const primaryAction = getLocationPrimaryAction(spot);
  const isFavorite = isLocationFavorite(spot.id);
  const showCta = Boolean(primaryAction.href);
  const cardBg = shell.filterInactiveBg;
  const cardBorder = shell.filterInactiveBorder;
  const textColor = shell.pageTitle;
  const phone = spot.phone?.trim() || null;

  const onFavorite = () => {
    if (role === 'USER_ANONYMOUS') {
      openFavoritesSignup(navigation);
      return;
    }
    // FavoritesContext met à jour les IDs — pas de full catalogue (egress).
    void toggleLocationFavorite(spot.id, { kind: isTool ? 'tool' : 'spot' });
  };

  return (
    <View style={[styles.page, { backgroundColor: shell.pageBg }]}>
      <ScrollView contentContainerStyle={styles.container}>
        {isTool ? (
          <ToolPhotoGallery
            images={toolImages}
            name={spot.name}
            developer={spot.developer}
          />
        ) : (
          <LocationPhotoGallery
            images={images}
            name={spot.name}
            district={spot.district}
            address={spot.address}
            countryCode={spot.countryCode}
            organizerName={spot.organizerName}
            favoriteCount={spot.favoriteCount}
          />
        )}

        {!isTool ? (
          <View style={styles.metaWrap}>
            <LocationMetaStrip location={spot} />
          </View>
        ) : (
          <View style={styles.metaWrap}>
            <ToolMetaStrip tool={spot} />
          </View>
        )}

        <View style={styles.tags}>
          {!isTool
            ? spotCategorySlugs.map((slug) => {
                const emoji = spotEmoji(slug);
                const label = spotLabel(slug);
                return (
                  <View key={slug} style={[styles.tag, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                    <Text style={[styles.tagText, { color: textColor }]}>
                      {emoji && emoji !== '🏷️' ? emoji : '✨'} {label}
                    </Text>
                  </View>
                );
              })
            : null}
        </View>

        <Text style={[styles.sectionLabel, { color: shell.pageKicker }]}>
          {isTool ? 'À propos de l\'outil' : 'À propos'}
        </Text>
        <Text style={[styles.body, { color: textColor }]}>{spot.description}</Text>

        {isTool && role !== 'PARTNER' && role !== 'ADMIN' ? (
          <Pressable
            style={styles.claimLink}
            onPress={() => {
              Alert.alert(
                'Revendiquer cet outil',
                'Vous êtes le développeur ? Contactez THE LOOP pour obtenir votre espace pro.',
                [
                  { text: 'Annuler', style: 'cancel' },
                  {
                    text: 'Envoyer une demande',
                    onPress: () => {
                      void submitToolClaimRequest({
                        toolId: spot.id,
                        toolName: spot.name,
                        contactName: 'Développeur',
                        contactEmail: '',
                        contactPhone: '',
                        message: `Demande de revendication pour ${spot.name}`,
                        countryCode: spot.countryCode ?? 'GN',
                      });
                      Alert.alert('Demande envoyée', 'Notre équipe vous recontactera.');
                    },
                  },
                ],
              );
            }}
          >
            <Text style={[styles.claimText, { color: shell.pageKicker }]}>
              Vous êtes le développeur ? Revendiquez votre espace pro
            </Text>
          </Pressable>
        ) : null}

        <SocialLinksRow
          instagramUrl={spot.instagramUrl}
          facebookUrl={spot.facebookUrl}
          websiteUrl={spot.website}
          shell={shell}
        />

        <ContentBenefitsSection
          contentId={spot.id}
          contentType={isTool ? 'tool' : 'spot'}
          shell={shell}
        />

        {showCta ? (
          <Pressable
            style={[styles.cta, { backgroundColor: theme.colors.ctaBg }]}
            onPress={() => void Linking.openURL(primaryAction.href)}
          >
            <Text style={[styles.ctaText, { color: theme.colors.ctaText }]}>
              {isTool ? 'Découvrir' : primaryAction.label}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            style={[styles.actionBtn, { backgroundColor: cardBg, borderColor: cardBorder, flex: 1 }]}
            onPress={() => void Share.share({ message: getLocationShareText(spot), title: spot.name })}
          >
            <View style={styles.shareRow}>
              <ShareIcon size={18} color={textColor} />
              <Text style={[styles.actionText, { color: textColor }]}>Partager</Text>
            </View>
          </Pressable>
          {phone ? (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: cardBg, borderColor: cardBorder, flex: 1 }]}
              onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)}
            >
              <Text style={[styles.actionText, { color: textColor }]}>Contacter</Text>
            </Pressable>
          ) : null}
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
  metaWrap: { marginTop: 12 },
  tags: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  tag: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { fontSize: 10, fontWeight: '500' },
  sectionLabel: { marginTop: 16, fontSize: 15, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  body: { marginTop: 8, lineHeight: 22, fontSize: 14 },
  claimLink: { marginTop: 12, paddingVertical: 8 },
  claimText: { fontSize: 11, textDecorationLine: 'underline', lineHeight: 16 },
  cta: { marginTop: 20, borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  ctaText: { fontWeight: '700', fontSize: 14 },
  actions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  actionBtn: { borderRadius: 12, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
  actionText: { fontSize: 13, fontWeight: '600' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stickyBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 24, borderTopWidth: 1 },
  saveBtn: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center' },
  saveBtnText: { fontWeight: '700', fontSize: 13, textAlign: 'center' },
});
