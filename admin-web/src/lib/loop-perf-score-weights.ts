import { supabase } from './supabase';

export type LoopPerfScoreWeights = {
  clickWeight: number;
  favoriteWeight: number;
  ratingWeight: number;
};

/** Défaut Paramètres → Étoiles spots (`spot_star_settings`). */
export const DEFAULT_LOOP_PERF_WEIGHTS: LoopPerfScoreWeights = {
  clickWeight: 1,
  favoriteWeight: 5,
  ratingWeight: 10,
};

/** Poids pays puis global — aligné `SpotStarsPage` / `getSpotStarSettings` (mobile). */
export async function loadLoopPerfScoreWeights(countryCode: string): Promise<LoopPerfScoreWeights> {
  const cc = countryCode.toUpperCase().slice(0, 2);
  const { data: row } = await supabase
    .from('spot_star_settings')
    .select('click_weight, favorite_weight, rating_weight')
    .eq('country_code', cc)
    .maybeSingle();
  if (row) {
    return {
      clickWeight: Number(row.click_weight ?? 1),
      favoriteWeight: Number(row.favorite_weight ?? 5),
      ratingWeight: Number(row.rating_weight ?? 10),
    };
  }
  const { data: global } = await supabase
    .from('spot_star_settings')
    .select('click_weight, favorite_weight, rating_weight')
    .is('country_code', null)
    .maybeSingle();
  if (global) {
    return {
      clickWeight: Number(global.click_weight ?? 1),
      favoriteWeight: Number(global.favorite_weight ?? 5),
      ratingWeight: Number(global.rating_weight ?? 10),
    };
  }
  return DEFAULT_LOOP_PERF_WEIGHTS;
}
