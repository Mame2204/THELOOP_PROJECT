export interface SpotStarTier {
  minScore: number;
  maxScore: number | null;
  starCount: number;
}

export const DEFAULT_SPOT_STAR_TIERS: SpotStarTier[] = [
  { minScore: 0, maxScore: 50, starCount: 1 },
  { minScore: 51, maxScore: 200, starCount: 2 },
  { minScore: 201, maxScore: 500, starCount: 3 },
  { minScore: 501, maxScore: 1000, starCount: 4 },
  { minScore: 1001, maxScore: null, starCount: 5 },
];
