/** Paths officiels THE LOOP — cercle fermé + arc ouvert (gap à gauche) + point. */

export const LOOP_MARK = {
  sm: {
    viewBox: '0 0 36 36',
    circle: { cx: 18, cy: 18, r: 15, strokeWidth: 3 },
    /** Arc ~270° côté droit ; ne se referme pas (contrairement à l'ancien path cubique). */
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

export type LoopMarkSize = keyof typeof LOOP_MARK;
