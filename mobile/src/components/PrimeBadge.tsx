import { StyleSheet, Text, View } from 'react-native';

interface PrimeBadgeProps {
  size?: 'sm' | 'md';
}

/** Badge doré Prime — losange sur l'avatar ou l'onglet profil. */
export function PrimeBadge({ size = 'sm' }: PrimeBadgeProps) {
  const dim = size === 'sm' ? 14 : 18;
  const fontSize = size === 'sm' ? 8 : 10;

  return (
    <View style={[styles.badge, { width: dim, height: dim, borderRadius: dim / 2 }]}>
      <Text style={[styles.icon, { fontSize }]}>◆</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#D4AF37',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E8C547',
  },
  icon: {
    color: '#000000',
    fontWeight: '900',
    lineHeight: 12,
    marginTop: -1,
  },
});
