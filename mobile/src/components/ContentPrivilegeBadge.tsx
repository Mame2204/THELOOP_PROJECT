import { StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme/colors';

type Props = {
  /** Sur la couverture des cartes catalogue (Agenda, Spots, …). */
  variant?: 'overlay' | 'inline';
  accent?: string;
};

/** Indique qu’au moins un privilège catalogue actif est lié à ce contenu. */
export function ContentPrivilegeBadge({ variant = 'overlay', accent = colors.gold }: Props) {
  if (variant === 'inline') {
    return (
      <View style={[styles.inline, { backgroundColor: `${accent}22`, borderColor: accent }]}>
        <Text style={[styles.inlineText, { color: accent }]} numberOfLines={1}>
          🎁 Privilège
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.overlay, { backgroundColor: accent }]}>
      <Text style={styles.overlayText} numberOfLines={1}>
        🎁 Privilège
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  overlayText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  inline: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  inlineText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
