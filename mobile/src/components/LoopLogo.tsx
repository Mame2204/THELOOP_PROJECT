import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { LOOP_MARK, type LoopMarkSize } from '@/lib/loop-mark-paths';

export type LoopLogoVariant = 'blanc' | 'light' | 'gold' | 'app';

/** Couleurs marque — noir partout (y compris ancien variant « gold » Prime). */
const LOGO_COLORS: Record<LoopLogoVariant, { mark: string; text: string; tagline: string }> = {
  blanc: { mark: '#000000', text: '#0a0a0a', tagline: '#6b7280' },
  light: { mark: '#ffffff', text: '#ffffff', tagline: 'rgba(255,255,255,0.65)' },
  gold: { mark: '#000000', text: '#0a0a0a', tagline: '#6b7280' },
  app: { mark: '#000000', text: '#0a0a0a', tagline: '#6b7280' },
};

function LoopMark({
  color,
  pixelSize,
  markSize = 'sm',
}: {
  color: string;
  pixelSize: number;
  markSize?: LoopMarkSize;
}) {
  const m = LOOP_MARK[markSize];
  return (
    <Svg width={pixelSize} height={pixelSize} viewBox={m.viewBox} fill="none">
      <Circle
        cx={m.circle.cx}
        cy={m.circle.cy}
        r={m.circle.r}
        stroke={color}
        strokeWidth={m.circle.strokeWidth}
        fill="none"
      />
      <Path
        d={m.path}
        stroke={color}
        strokeWidth={m.circle.strokeWidth}
        strokeLinecap="round"
        fill="none"
      />
      <Circle cx={m.dot.cx} cy={m.dot.cy} r={m.dot.r} fill={color} />
    </Svg>
  );
}

/** Symbole seul (cercles) — sans wordmark ni cadre. */
export function LoopMarkIcon({
  color = '#000000',
  size = 28,
  markSize = 'sm',
}: {
  color?: string;
  size?: number;
  markSize?: LoopMarkSize;
}) {
  return <LoopMark color={color} pixelSize={size} markSize={markSize} />;
}

interface LoopLogoProps {
  /** @deprecated Ignoré — logo toujours noir (sauf variant light). */
  grade?: string;
  variant?: LoopLogoVariant;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  showTagline?: boolean;
  stacked?: boolean;
}

const MARK_PX = {
  sm: 22,
  md: 28,
  lg: 40,
  xl: 72,
} as const;

export function LoopLogo({
  grade: _grade = 'anonymous',
  variant,
  size = 'sm',
  showWordmark = true,
  showTagline = false,
  stacked = false,
}: LoopLogoProps) {
  // Toujours noir pour la marque (sauf fond sombre → variant light explicite).
  const v: LoopLogoVariant = variant === 'light' ? 'light' : 'app';
  void _grade;
  const markSize: LoopMarkSize = size === 'lg' || size === 'xl' ? 'lg' : 'sm';
  const pixelSize = MARK_PX[size];

  const colors = LOGO_COLORS[v];

  const mark = <LoopMark color={colors.mark} pixelSize={pixelSize} markSize={markSize} />;

  const textSize = size === 'xl' ? 28 : size === 'lg' ? 17 : size === 'md' ? 15 : 13;
  const taglineSize = size === 'xl' ? 10 : 8;

  const wordmark = showWordmark ? (
    <View style={stacked ? styles.wordmarkStack : undefined}>
      <Text
        style={[
          styles.wordmark,
          stacked && styles.wordmarkStacked,
          { color: colors.text, fontSize: textSize },
        ]}
      >
        THE LOOP
      </Text>
      {showTagline ? (
        <Text style={[styles.tagline, stacked && styles.taglineStacked, { color: colors.tagline, fontSize: taglineSize }]}>
          ÉVÉNEMENTS · LIEUX · GUINÉE
        </Text>
      ) : null}
    </View>
  ) : null;

  if (stacked) {
    return (
      <View style={styles.stacked}>
        {mark}
        {wordmark}
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {mark}
      {wordmark}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stacked: { alignItems: 'center', gap: 14 },
  wordmarkStack: { alignItems: 'center', marginTop: 4 },
  wordmarkStacked: { textAlign: 'center', letterSpacing: 4 },
  taglineStacked: { textAlign: 'center', marginTop: 6 },
  wordmark: { fontWeight: '900', letterSpacing: 2.8, textTransform: 'uppercase' },
  tagline: { marginTop: 2, fontSize: 8, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase' },
});
