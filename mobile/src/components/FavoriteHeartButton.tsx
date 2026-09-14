import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

interface FavoriteHeartButtonProps {
  active: boolean;
  onPress: () => void;
  size?: number;
  /** Sur image sombre (cartes catalogue). */
  variant?: 'overlay' | 'default' | 'tab';
  hitSlop?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function FavoriteHeartButton({
  active,
  onPress,
  size = 22,
  variant = 'default',
  hitSlop = 12,
  style,
  accessibilityLabel,
}: FavoriteHeartButtonProps) {
  const iconName =
    variant === 'tab' || active ? 'heart' : 'heart-outline';

  let iconColor = colors.favorite;
  if (variant === 'overlay') {
    iconColor = active ? colors.favorite : 'rgba(255,255,255,0.92)';
  } else if (variant === 'tab') {
    iconColor = colors.favorite;
  } else {
    iconColor = active ? colors.favorite : colors.favoriteMuted;
  }

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        onPress();
      }}
      hitSlop={hitSlop}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (active ? 'Retirer des favoris' : 'Ajouter aux favoris')
      }
    >
      <Ionicons name={iconName} size={size} color={iconColor} />
    </Pressable>
  );
}

interface FavoriteBarActionProps {
  active: boolean;
  onPress: () => void;
  textColor?: string;
}

/** Bouton bas de fiche détail — cœur rouge plein quand favori. */
export function FavoriteBarAction({ active, onPress, textColor = '#FFFFFF' }: FavoriteBarActionProps) {
  return (
    <Pressable style={styles.barBtn} onPress={onPress}>
      <View style={styles.barRow}>
        <Ionicons
          name={active ? 'heart' : 'heart-outline'}
          size={18}
          color={active ? colors.favorite : textColor}
        />
        <Text style={[styles.barText, { color: textColor }]}>
          {active ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  barBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barText: { fontWeight: '700', fontSize: 14 },
});
