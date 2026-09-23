import type { TeamLoopPerfRow } from './team-loop-performance';

/** Aligné `AdminLoopStatsScreen` (mobile) — onglets Favoris / Clics / Étoiles / Notes / Tous. */
export type LoopPerfMetricTab = 'all' | 'favorites' | 'clicks' | 'stars' | 'ratings';

/**
 * Formule « Tous » (Hub THE LOOP admin) :
 *   score = favoris + clics + (étoiles × 5)
 * Événements : étoiles = 0 → score = favoris + clics.
 *
 * (Autre écran : PartnerStats utilise favoris + clics + étoiles×5 + moyenneNotes×10 + nbAvis.)
 */
export function loopPerfCompositeScore(row: Pick<TeamLoopPerfRow, 'favorites' | 'clicks' | 'stars'>): number {
  return row.favorites + row.clicks + row.stars * 5;
}

export function sortLoopPerfRows(rows: TeamLoopPerfRow[], metric: LoopPerfMetricTab): TeamLoopPerfRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (metric === 'favorites') return b.favorites - a.favorites || b.clicks - a.clicks;
    if (metric === 'clicks') return b.clicks - a.clicks || b.favorites - a.favorites;
    if (metric === 'stars') return b.stars - a.stars || b.favorites - a.favorites;
    if (metric === 'ratings') return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
    return loopPerfCompositeScore(b) - loopPerfCompositeScore(a);
  });
  return copy;
}
