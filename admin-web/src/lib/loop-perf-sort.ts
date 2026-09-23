import {
  DEFAULT_LOOP_PERF_WEIGHTS as DEFAULT_WEIGHTS,
  type LoopPerfScoreWeights,
} from './loop-perf-score-weights';
import type { TeamLoopPerfRow } from './team-loop-performance';

/** Aligné `AdminLoopStatsScreen` (mobile) — onglets Favoris / Clics / Étoiles / Notes / Tous. */
export type LoopPerfMetricTab = 'all' | 'favorites' | 'clicks' | 'stars' | 'ratings';

/** Contenu agrégé ou filtré par type (mobile : Tous / Événements / Spots / Outils). */
export type LoopPerfSectionTab = 'all' | 'events' | 'spots' | 'tools';

export const LOOP_PERF_PAGE_SIZE = 20;

/**
 * Score engagement (Paramètres → Étoiles) — tri onglet « Tous » :
 *   score = (clics × poidsClic) + (favoris × poidsFavori) + (moyenne note × poidsNote)
 * Défaut : clics×1 + favoris×5 + moyenne×10 (`computeEngagementScore` mobile).
 */
export function loopPerfEngagementScore(
  row: Pick<TeamLoopPerfRow, 'clicks' | 'favorites' | 'ratingAvg'>,
  weights: LoopPerfScoreWeights = DEFAULT_WEIGHTS,
): number {
  return Math.round(
    row.clicks * weights.clickWeight
      + row.favorites * weights.favoriteWeight
      + row.ratingAvg * weights.ratingWeight,
  );
}

export function sortLoopPerfRows(
  rows: TeamLoopPerfRow[],
  metric: LoopPerfMetricTab,
  weights: LoopPerfScoreWeights = DEFAULT_WEIGHTS,
): TeamLoopPerfRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (metric === 'favorites') return b.favorites - a.favorites || b.clicks - a.clicks;
    if (metric === 'clicks') return b.clicks - a.clicks || b.favorites - a.favorites;
    if (metric === 'stars') return b.stars - a.stars || b.favorites - a.favorites;
    if (metric === 'ratings') return b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount;
    return (
      loopPerfEngagementScore(b, weights) - loopPerfEngagementScore(a, weights)
      || b.clicks - a.clicks
      || b.favorites - a.favorites
    );
  });
  return copy;
}
