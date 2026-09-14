import { StyleSheet, Text, View } from 'react-native';

interface LikeStarRatingProps {
  favoriteCount?: number;
  starCount?: number;
  light?: boolean;
}

export function LikeStarRating({ starCount = 0, light = false }: LikeStarRatingProps) {
  const full = Math.min(5, Math.max(0, Math.round(starCount)));

  return (
    <View style={styles.row}>
      <View style={styles.stars}>
        {Array.from({ length: 5 }, (_, i) => (
          <Text key={i} style={[styles.star, i < full ? styles.starFull : styles.starEmpty, light && styles.starLight]}>
            ★
          </Text>
        ))}
      </View>
      {full > 0 ? <Text style={[styles.count, light && styles.countLight]}>{full}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  count: { fontSize: 11, fontWeight: '800', color: '#fbbf24' },
  stars: { flexDirection: 'row', gap: 1 },
  star: { fontSize: 10 },
  starFull: { color: '#fbbf24' },
  starEmpty: { color: 'rgba(255,255,255,0.25)' },
  starLight: { color: '#fbbf24' },
  countLight: { color: '#6b7280' },
});
