/**
 * Symbole THE LOOP — cercle + arc ouvert + point (sans cadre ni bordure).
 */

export type LoopMarkSize = 'sm' | 'lg';

const MARK = {
  sm: {
    viewBox: '0 0 36 36',
    circle: { cx: 18, cy: 18, r: 15, strokeWidth: 3 },
    path: 'M 13.5 10.21 A 9 9 0 1 1 13.5 25.79',
    dot: { cx: 10, cy: 18, r: 2 },
  },
  lg: {
    viewBox: '0 0 52 52',
    circle: { cx: 26, cy: 26, r: 22, strokeWidth: 3.5 },
    path: 'M 19.5 14.74 A 13 13 0 1 1 19.5 37.26',
    dot: { cx: 14, cy: 26, r: 3 },
  },
} as const;

interface LoopMarkProps {
  color?: string;
  pixelSize?: number;
  markSize?: LoopMarkSize;
  className?: string;
}

export function LoopMark({
  color = '#000000',
  pixelSize = 36,
  markSize = 'sm',
  className,
}: LoopMarkProps) {
  const m = MARK[markSize];

  return (
    <svg
      width={pixelSize}
      height={pixelSize}
      viewBox={m.viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx={m.circle.cx} cy={m.circle.cy} r={m.circle.r} stroke={color} strokeWidth={m.circle.strokeWidth} />
      <path d={m.path} stroke={color} strokeWidth={m.circle.strokeWidth} strokeLinecap="round" />
      <circle cx={m.dot.cx} cy={m.dot.cy} r={m.dot.r} fill={color} />
    </svg>
  );
}

export const LOOP_BRAND = {
  gold: '#C9A84C',
  black: '#000000',
  white: '#FFFFFF',
  offWhite: '#FAFAFA',
  wordmarkTracking: '0.22em',
} as const;

interface LoopLogoProps {
  variant?: 'blanc' | 'app' | 'dark' | 'light' | 'gold';
  size?: 'sm' | 'md';
  showWordmark?: boolean;
}

export function BlancIconMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const markPx = size === 'sm' ? 22 : 28;
  return <LoopMark color={LOOP_BRAND.black} pixelSize={markPx} markSize="sm" />;
}

export function AppIconMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const markPx = size === 'sm' ? 26 : 32;
  return <LoopMark color={LOOP_BRAND.white} pixelSize={markPx} markSize="lg" />;
}

export function LoopLogo({ variant = 'blanc', size = 'md', showWordmark = true }: LoopLogoProps) {
  const markPx = size === 'sm' ? 28 : 36;
  const textSize = size === 'sm' ? 'text-[13px]' : 'text-[15px]';

  const config = {
    blanc: { mark: <LoopMark color={LOOP_BRAND.black} pixelSize={markPx} markSize="sm" />, text: 'text-loop-public-text' },
    app: { mark: <LoopMark color={LOOP_BRAND.black} pixelSize={markPx} markSize="sm" />, text: 'text-loop-public-text' },
    dark: { mark: <LoopMark color={LOOP_BRAND.black} pixelSize={markPx} markSize="sm" />, text: 'text-loop-public-text' },
    light: { mark: <LoopMark color={LOOP_BRAND.white} pixelSize={markPx} markSize="sm" />, text: 'text-white' },
    gold: { mark: <LoopMark color={LOOP_BRAND.gold} pixelSize={markPx} markSize="sm" />, text: 'text-loop-gold' },
  }[variant];

  return (
    <div className="flex items-center gap-2.5">
      {config.mark}
      {showWordmark && (
        <span
          className={`font-black uppercase leading-none ${config.text} ${textSize}`}
          style={{ letterSpacing: LOOP_BRAND.wordmarkTracking }}
        >
          THE LOOP
        </span>
      )}
    </div>
  );
}
