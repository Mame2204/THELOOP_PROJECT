import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CoverImage } from '@/components/CoverImage';
import { CatalogCoverScrim } from '@/components/DetailHeroScrim';
import { FavoriteHeartButton } from '@/components/FavoriteHeartButton';
import { CATALOG_CARD_IMAGE_HEIGHT } from '@/constants/layout';
import { formatEventCardLocationDisplay } from '@/lib/content-location-utils';
import { getEventCategoryStyle } from '@/lib/event-styles';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useCategoryLabels } from '@/context/CategoryLabelsContext';
import type { Event } from '@/types';
import { colors } from '@/theme/colors';

interface EventCardProps {
  event: Event;
  isFavorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
  statusLabel?: 'Passé' | 'Aujourd\'hui' | null;
}

export function EventCard({ event, isFavorite, onPress, onToggleFavorite, statusLabel }: EventCardProps) {
  const { theme } = useMemberTheme();
  const { eventLabel, eventEmoji } = useCategoryLabels();
  const style = getEventCategoryStyle(event.category);
  const locationLine = formatEventCardLocationDisplay(event);
  const categoryEmoji = eventEmoji(event.category);
  const categoryText = `${categoryEmoji !== '🏷️' ? categoryEmoji : style.emoji} ${eventLabel(event.category)}`;

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
        <CoverImage uri={event.coverImageUrl} height={CATALOG_CARD_IMAGE_HEIGHT} fallbackColor={style.fallback} />
        <CatalogCoverScrim />
        <View style={styles.overlay}>
          <View style={styles.topRow}>
            <View style={styles.badges}>
              <Text style={styles.categoryBadge} numberOfLines={1}>
                {categoryText}
              </Text>
              {event.visibility === 'prime' ? (
                <View style={styles.loopXBadge}>
                  <Text style={styles.loopXText}>LoopX</Text>
                </View>
              ) : null}
              {statusLabel ? (
                <View style={[styles.statusSticker, statusLabel === 'Aujourd\'hui' ? styles.statusToday : styles.statusPast]}>
                  <Text style={[styles.statusText, statusLabel === 'Aujourd\'hui' ? styles.statusTextToday : null]}>
                    {statusLabel}
                  </Text>
                </View>
              ) : null}
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
              {event.title}
            </Text>
            {locationLine ? (
              <Text style={styles.metaOverlay} numberOfLines={1}>
                {locationLine.startsWith('En ligne') || locationLine.startsWith('Non fourni')
                  ? locationLine
                  : `📍 ${locationLine}`}
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
  coverWrap: { position: 'relative', height: CATALOG_CARD_IMAGE_HEIGHT },
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
  loopXBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.gold,
  },
  loopXText: { fontSize: 10, fontWeight: '800', color: colors.black, letterSpacing: 0.4 },
  statusSticker: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusToday: { backgroundColor: colors.gold },
  statusPast: { backgroundColor: 'rgba(55,65,81,0.88)' },
  statusText: { fontSize: 10, fontWeight: '800', color: colors.white },
  statusTextToday: { color: colors.black },
  bottomBlock: { position: 'absolute', bottom: 10, left: 12, right: 12, gap: 3 },
  titleOverlay: { fontSize: 15, fontWeight: '800', color: colors.white, lineHeight: 20 },
  metaOverlay: { fontSize: 11, color: 'rgba(255,255,255,0.88)', lineHeight: 15 },
});
