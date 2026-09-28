import { StyleSheet, Text, View } from 'react-native';
import { useAppGates } from '@/context/AppGatesContext';
import { isPrivilegesUiEnabled } from '@/lib/pass-purchase-ui';
import { colors } from '@/theme/colors';

type Props = {
  /** Sur la couverture des cartes catalogue (Agenda, Spots, …). */
  variant?: 'overlay' | 'inline' | 'cardGift';
  accent?: string;
};

/** Indique qu’au moins un privilège catalogue actif est lié à ce contenu. */
export function ContentPrivilegeBadge({ variant = 'overlay', accent = colors.gold }: Props) {
  const { gates } = useAppGates();
  if (!isPrivilegesUiEnabled(gates)) return null;

  if (variant === 'cardGift') {
    return (
      <View style={styles.cardGift} accessibilityLabel="Privilège disponible">
        <Text style={styles.cardGiftEmoji}>🎁</Text>
      </View>
    );
  }

  if (variant === 'inline') {
    return (
      <View style={[styles.inline, { backgroundColor: `${accent}22`, borderColor: accent }]}>
        <Text style={[styles.inlineText, { color: accent }]} numberOfLines={1}>
          🎁
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.overlay, { backgroundColor: accent }]}>
      <Text style={styles.overlayText} numberOfLines={1}>
        🎁
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardGift: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardGiftEmoji: {
    fontSize: 16,
    lineHeight: 18,
  },
  overlay: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: '100%',
  },
  overlayText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  inline: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  inlineText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
