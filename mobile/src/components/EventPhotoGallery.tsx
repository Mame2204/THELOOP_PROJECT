import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DetailPhotoGallery } from '@/components/DetailPhotoGallery';
import { DetailHeroScrim, detailHeroTextShadow } from '@/components/DetailHeroScrim';
import { colors } from '@/theme/colors';

interface EventPhotoGalleryProps {
  images: string[];
  title: string;
  categoryLabel: string;
  categoryEmoji: string;
  locationLine?: string | null;
  onLocationPress?: () => void;
  favoriteControl?: ReactNode;
}

export function EventPhotoGallery({
  images,
  title,
  categoryLabel,
  categoryEmoji,
  locationLine,
  onLocationPress,
  favoriteControl,
}: EventPhotoGalleryProps) {
  if (images.length === 0) return null;

  return (
    <DetailPhotoGallery
      images={images}
      overlay={
        <>
          <DetailHeroScrim />
          <View style={styles.overlay}>
            <View style={styles.heroTop}>
              <View style={styles.categoryBadgeWrap}>
                <Text style={[styles.categoryBadge, detailHeroTextShadow]}>
                  {categoryEmoji} {categoryLabel}
                </Text>
              </View>
              {favoriteControl}
            </View>
            <View style={styles.heroBottom}>
              <Text style={[styles.heroTitle, detailHeroTextShadow]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                {title}
              </Text>
              {locationLine ? (
                onLocationPress ? (
                  <Pressable onPress={onLocationPress} accessibilityRole="link">
                    <Text style={[styles.location, styles.locationLink, detailHeroTextShadow]} numberOfLines={1}>
                      📍 {locationLine}
                    </Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.location, detailHeroTextShadow]} numberOfLines={1}>
                    📍 {locationLine}
                  </Text>
                )
              ) : null}
            </View>
          </View>
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject },
  heroTop: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  categoryBadgeWrap: { flex: 1, marginRight: 8 },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.58)',
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  heroBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 4,
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: colors.white, lineHeight: 24 },
  location: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.96)',
  },
  locationLink: {
    textDecorationLine: 'underline',
  },
});
