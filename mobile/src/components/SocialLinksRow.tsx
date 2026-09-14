import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { normalizeExternalUrl } from '@/lib/location-actions';

interface SocialLinksRowProps {
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  websiteUrl?: string | null;
  shell: { pageTitle: string; filterInactiveBorder: string; filterInactiveBg: string; tabIndicator: string };
}

function InstagramIcon({ size = 22, color = '#E1306C' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={5} stroke={color} strokeWidth={2} />
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={2} />
      <Circle cx={17.5} cy={6.5} r={1.2} fill={color} />
    </Svg>
  );
}

function FacebookIcon({ size = 22, color = '#1877F2' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H6v4h3v8h4v-8h3.5l.5-4H13V9c0-.6.4-1 1-1z" />
    </Svg>
  );
}

function WebsiteIcon({ size = 22, color = '#64748b' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M3 12h18M12 3c2.5 2.8 3.8 6 3.8 9s-1.3 6.2-3.8 9M12 3c-2.5 2.8-3.8 6-3.8 9s1.3 6.2 3.8 9" stroke={color} strokeWidth={2} />
    </Svg>
  );
}

export function SocialLinksRow({ instagramUrl, facebookUrl, websiteUrl, shell }: SocialLinksRowProps) {
  const links = [
    instagramUrl ? { key: 'ig', url: instagramUrl, icon: <InstagramIcon /> } : null,
    facebookUrl ? { key: 'fb', url: facebookUrl, icon: <FacebookIcon /> } : null,
    websiteUrl ? { key: 'web', url: websiteUrl, icon: <WebsiteIcon />, label: 'Site' } : null,
  ].filter(Boolean) as Array<{ key: string; url: string; icon: ReactNode; label?: string }>;

  if (!links.length) return null;

  return (
    <View style={styles.row}>
      {links.map((link) => (
        <Pressable
          key={link.key}
          style={[styles.btn, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
          onPress={() => void Linking.openURL(normalizeExternalUrl(link.url))}
          accessibilityLabel={link.label ?? link.key}
        >
          {link.icon}
          {link.label ? <Text style={[styles.label, { color: shell.pageTitle }]}>{link.label}</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  label: { fontSize: 12, fontWeight: '700' },
});
