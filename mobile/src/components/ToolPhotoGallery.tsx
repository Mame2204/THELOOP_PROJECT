import { StyleSheet, Text, View } from 'react-native';
import { DetailPhotoGallery } from '@/components/DetailPhotoGallery';
import { DetailHeroScrim, detailHeroTextShadow } from '@/components/DetailHeroScrim';
import { colors } from '@/theme/colors';

interface Props {
  images: string[];
  name: string;
  developer?: string | null;
  starCount?: number;
}

/** Même structure / tailles que LocationPhotoGallery (fiche spot). */
export function ToolPhotoGallery({ images, name, developer }: Props) {
  const developerLabel = developer?.trim() || null;

  if (images.length === 0) return null;

  return (
    <DetailPhotoGallery
      images={images}
      overlay={
        <>
          <DetailHeroScrim />
          <View style={styles.overlay}>
            <View style={styles.heroBottom}>
              <Text style={[styles.title, detailHeroTextShadow]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
                {name}
              </Text>
              {developerLabel ? (
                <Text style={[styles.location, detailHeroTextShadow]} numberOfLines={1}>
                  🧑‍💻 {developerLabel}
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
  location: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.96)',
  },
});
