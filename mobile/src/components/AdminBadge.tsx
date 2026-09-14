import { StyleSheet, Text, View } from 'react-native';
import { BRAND, LOOP_GOLD } from '@/lib/theme-config';

interface AdminBadgeProps {
  size?: 'sm' | 'md';
  isSuperAdmin?: boolean;
}

export function AdminBadge({ size = 'sm', isSuperAdmin = false }: AdminBadgeProps) {
  const dim = size === 'sm' ? 14 : 18;
  const fontSize = size === 'sm' ? 7 : 9;
  const bg = isSuperAdmin ? BRAND.ADMIN.accentDeep : BRAND.ADMIN.accent;
  const border = isSuperAdmin ? LOOP_GOLD : '#ffffff';

  return (
    <View style={[styles.badge, { width: dim, height: dim, borderRadius: dim / 2, backgroundColor: bg, borderColor: border }]}>
      <Text style={[styles.icon, { fontSize }]}>{isSuperAdmin ? 'S' : 'A'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  icon: {
    color: '#ffffff',
    fontWeight: '900',
  },
});
