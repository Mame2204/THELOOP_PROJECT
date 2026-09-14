import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CoverImage } from '@/components/CoverImage';
import { CatalogCoverScrim } from '@/components/DetailHeroScrim';
import { FavoriteHeartButton } from '@/components/FavoriteHeartButton';
import { CATALOG_CARD_IMAGE_HEIGHT } from '@/constants/layout';
import type { HomeLocation } from '@/lib/demo-data';
import { formatCommuneDistrictDisplay } from '@/lib/guinea-locations';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useCategoryLabels } from '@/context/CategoryLabelsContext';
import { colors } from '@/theme/colors';

interface SpotCardProps {
  spot: HomeLocation;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}

const COVER_HEIGHT = CATALOG_CARD_IMAGE_HEIGHT;

export function SpotCard({ spot, isFavorite, onPress, onToggleFavorite }: SpotCardProps) {
  const { theme } = useMemberTheme();
  const { spotLabel, toolLabel, spotEmoji, toolEmoji } = useCategoryLabels();
  const isTool = spot.subCategory === 'tools';
  const categorySlug = isTool
    ? (spot.toolCategory ?? '')
    : (spot.categories?.[0] ?? spot.subCategory);
  const categoryLabel = isTool
    ? (categorySlug ? toolLabel(categorySlug) : 'Outil')
    : spotLabel(categorySlug);
  const rawEmoji = isTool
    ? (categorySlug ? toolEmoji(categorySlug) : '🔧')
    : spotEmoji(categorySlug);
  const categoryText = `${rawEmoji && rawEmoji !== '🏷️' ? rawEmoji : isTool ? '🔧' : '✨'} ${categoryLabel}`;
  const locationLine = isTool
    ? null
    : (formatCommuneDistrictDisplay(spot.address, spot.district) ?? 'Conakry');
  const coverUri = isTool ? (spot.logoUrl ?? spot.coverImageUrl) : spot.coverImageUrl;
  const authorLine = isTool ? spot.developer : spot.organizerName;

  return (
    <Pressable
      style={[
        styles.card,
        theme.elevation.card,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderRadius: theme.radius.card,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
        },
      ]}
      onPress={onPress}
    >
      <View style={styles.coverWrap}>
        <CoverImage uri={coverUri} height={COVER_HEIGHT} />
        <CatalogCoverScrim />
        <View style={styles.overlay}>
          <View style={styles.topRow}>
            <View style={styles.badges}>
              <Text style={styles.categoryBadge} numberOfLines={1}>
                {categoryText}
              </Text>
            </View>
            <FavoriteHeartButton
              active={isFavorite}
              onPress={onToggleFavorite}
              size={22}
              variant="overlay"
            />
          </View>
          <View style={styles.bottomBlock}>
            <Text style={styles.titleOverlay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              {spot.name}
            </Text>
            {authorLine ? (
              <Text style={styles.metaOverlay} numberOfLines={1}>
                Par {authorLine}
              </Text>
            ) : null}
            {locationLine ? (
              <Text style={styles.metaOverlay} numberOfLines={1}>
                {locationLine}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    marginBottom: 14,
    overflow: 'hidden',
  },
  coverWrap: { position: 'relative', height: COVER_HEIGHT },
  overlay: { ...StyleSheet.absoluteFillObject },
  topRow: {
    position: 'absolute',
    top: 6,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1, marginRight: 8 },
  categoryBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    maxWidth: '100%',
  },
  bottomBlock: { position: 'absolute', bottom: 10, left: 12, right: 12, gap: 3 },
  titleOverlay: { fontSize: 15, fontWeight: '800', color: colors.white, lineHeight: 20 },
  metaOverlay: { fontSize: 11, color: 'rgba(255,255,255,0.88)', lineHeight: 15 },
});
