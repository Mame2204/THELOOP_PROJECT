import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LoopTheme } from '@/lib/theme-config';

interface ThemedScreenBackdropProps {
  theme: LoopTheme;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/** Fond d'écran atmosphérique — dégradés simulés + halos d'accent (sans toucher au logo). */
export function ThemedScreenBackdrop({ theme, style, children }: ThemedScreenBackdropProps) {
  const a = theme.atmosphere;
  const e = theme.elevation.backdrop;

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }, style]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.heroWash, { backgroundColor: a.heroWash }]} />
        <View style={[styles.glowPrimary, { backgroundColor: a.glowPrimary }]} />
        <View style={[styles.glowSecondary, { backgroundColor: a.glowSecondary }]} />
        {a.showAccentStripe ? (
          <View style={[styles.accentStripe, { backgroundColor: theme.colors.accent }]} />
        ) : null}
      </View>
      <View style={[styles.content, e]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  heroWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 280,
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
  },
  glowPrimary: {
    position: 'absolute',
    top: -40,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.9,
  },
  glowSecondary: {
    position: 'absolute',
    top: 120,
    left: -80,
    width: 180,
    height: 180,
    borderRadius: 90,
    opacity: 0.85,
  },
  accentStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    opacity: 0.85,
  },
});
