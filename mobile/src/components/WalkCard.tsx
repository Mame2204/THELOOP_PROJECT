import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CoverImage } from '@/components/CoverImage';
import { CatalogCoverScrim } from '@/components/DetailHeroScrim';
import { FavoriteHeartButton } from '@/components/FavoriteHeartButton';
import { CATALOG_CARD_IMAGE_HEIGHT } from '@/constants/layout';
import type { LoopWalk } from '@/lib/loop-walks-store';
import { formatWalkMetaLine } from '@/lib/loop-walks-store';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { colors } from '@/theme/colors';

interface WalkCardProps {
  walk: LoopWalk;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}

const COVER_HEIGHT = CATALOG_CARD_IMAGE_HEIGHT;

export function WalkCard({
  walk,
  isFavorite,
  onPress,
  onToggleFavorite,
}: WalkCardProps) {
  const { theme } = useMemberTheme();
  const metaLine = formatWalkMetaLine(walk);

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
        <CoverImage uri={walk.coverImageUrl} height={COVER_HEIGHT} />
        <CatalogCoverScrim />
        <View style={styles.overlay}>
          <View style={styles.topRow}>
            <View style={styles.badges}>
              <Text style={styles.categoryBadge} numberOfLines={1}>
                {walk.categoryLabel || 'Parcours'}
              </Text>
            </View>
            <FavoriteHeartButton
              active={isFavorite}
              onPress={onToggleFavorite}
              size={20}
              variant="overlay"
            />
          </View>
          <View style={styles.bottomBlock}>
            <Text style={styles.titleOverlay} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
              {walk.title}
            </Text>
            {walk.summary ? (
              <Text style={styles.organizerOverlay} numberOfLines={1}>
                {walk.summary}
              </Text>
            ) : null}
            <Text style={styles.metaOverlay} numberOfLines={2}>
              {metaLine}
            </Text>
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
  bottomBlock: { position: 'absolute', bottom: 10, left: 12, right: 12, gap: 4 },
  organizerOverlay: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
  titleOverlay: { fontSize: 14, fontWeight: '700', color: colors.white },
  metaOverlay: { fontSize: 11, color: 'rgba(255,255,255,0.9)' },
});
