/**
 * Marque Loop officielle (alignée src/components/shared/LoopLogo.tsx).
 * dotR légèrement plus grand pour lisibilité sur affiches exportées.
 */

export const LOOP_ARC = 'M 13.5 10.21 A 9 9 0 1 1 13.5 25.79';

export function loopMarkInner({ color, strokeWidth = 3, dotR = 3 }) {
  const sw = strokeWidth;
  return `<circle cx="18" cy="18" r="15" stroke="${color}" stroke-width="${sw}"/><path d="${LOOP_ARC}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/><circle cx="10" cy="18" r="${dotR}" fill="${color}"/>`;
}

/** Chapeau Père Noël (coords viewBox étendu, centré sur le cercle 18,18). */
export function santaHatOverlay() {
  return `<g aria-hidden="true">
    <path fill="#fff" d="M4 11.5h28v5H4z"/>
    <path fill="#c62828" d="M7 11.5 18-2.5 29 11.5z"/>
    <circle cx="18" cy="-2.5" r="4.2" fill="#fff"/>
  </g>`;
}

/**
 * @param {{ color: string; width?: number; strokeWidth?: number; dotR?: number; santaHat?: boolean; className?: string }} opts
 */
export function loopMarkSvg(opts) {
  const {
    color,
    width = 48,
    strokeWidth = 3,
    dotR = strokeWidth <= 2 ? 2.5 : 3,
    santaHat = false,
    className = '',
  } = opts;
  const viewBox = santaHat ? '-6 -14 48 50' : '0 0 36 36';
  const cls = className ? ` class="${className}"` : '';
  const hat = santaHat ? santaHatOverlay() : '';
  return `<svg${cls} width="${width}" height="${width}" viewBox="${viewBox}" fill="none" xmlns="http://www.w3.org/2000/svg">${hat}${loopMarkInner({ color, strokeWidth, dotR })}</svg>`;
}
