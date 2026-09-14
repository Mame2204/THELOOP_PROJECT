import { StyleSheet, Text, View } from 'react-native';
import { DetailPhotoGallery } from '@/components/DetailPhotoGallery';
import { SpotDetailHeroScrim, detailHeroTextShadow } from '@/components/DetailHeroScrim';
import { formatSpotQuartierVilleDisplay } from '@/lib/content-location-utils';
import { colors } from '@/theme/colors';

interface LocationPhotoGalleryProps {
  images: string[];
  name: string;
  district: string;
  address?: string | null;
  countryCode?: string | null;
  organizerName?: string | null;
  favoriteCount: number;
  starCount?: number;
}

export function LocationPhotoGallery({ images, name, district, address, countryCode, organizerName }: LocationPhotoGalleryProps) {
  const locationLine = formatSpotQuartierVilleDisplay({ address, district, countryCode });

  if (images.length === 0) return null;

  return (
    <DetailPhotoGallery
      images={images}
      overlay={
        <>
          <SpotDetailHeroScrim />
          <View style={styles.overlay}>
            <View style={styles.heroBottom}>
              <Text style={[styles.title, detailHeroTextShadow]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                {name}
              </Text>
              {organizerName ? (
                <Text style={[styles.organizer, detailHeroTextShadow]} numberOfLines={1}>
                  Par {organizerName}
                </Text>
              ) : null}
              {locationLine ? (
                <Text style={[styles.location, detailHeroTextShadow]} numberOfLines={1}>
                  {locationLine}
                </Text>
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
  heroBottom: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 4,
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.white, lineHeight: 24 },
  organizer: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.92)' },
  location: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.96)',
  },
});
