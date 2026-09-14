/** Étoiles dérivées des likes (favoris) sur THE LOOP — pas une note statique. */
export function favoriteCountToRating(count: number): number {
  if (count <= 0) return 0;
  if (count >= 500) return 5;
  if (count >= 300) return 4.5;
  if (count >= 150) return 4;
  if (count >= 80) return 3.5;
  if (count >= 40) return 3;
  if (count >= 15) return 2.5;
  if (count >= 5) return 2;
  return 1.5;
}

export function renderStarString(rating: number): string {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return `${'★'.repeat(full)}${half ? '⯨' : ''}${'☆'.repeat(empty)}`.replace(/⯨/, '★');
}
