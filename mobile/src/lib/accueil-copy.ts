/** Libellés Accueil — clés techniques inchangées (corner / chronique / walks). */
export const ACCUEIL_COPY = {
  corner: {
    kicker: 'Le Singulier',
    short: 'Le Singulier',
    adminTab: 'Le Singulier',
    adminBlock: 'Le Singulier',
  },
  chronique: {
    kicker: 'Le Fragment',
    short: 'Le Fragment',
    adminTab: 'Le Fragment',
    adminBlock: 'Le Fragment',
  },
  walks: {
    kicker: 'Parcours',
    short: 'Parcours',
    weekTitle: 'Parcours de la semaine',
    adminTab: 'Parcours',
    adminBlock: 'Parcours',
    listTitle: 'Parcours',
  },
} as const;

/** Catégories d’impact — Les Singuliers (pas des métiers / CV). */
export const SINGULIERS_CATEGORIES = [
  'Innovation',
  'Culture & Mémoire',
  'Savoir-faire',
  'Stratégie & Impact',
] as const;

export type SinguliersCategory = (typeof SINGULIERS_CATEGORIES)[number];

export type WalkPriceType = 'free' | 'paid' | 'theloop';

export const WALK_PRICE_OPTIONS: Array<{ value: WalkPriceType; label: string }> = [
  { value: 'free', label: 'Gratuit' },
  { value: 'paid', label: 'Payant' },
  { value: 'theloop', label: 'THE LOOP' },
];

export function formatWalkPriceLabel(
  priceType: WalkPriceType | string | null | undefined,
  priceLabel?: string | null,
): string {
  const type = (priceType ?? 'free') as WalkPriceType;
  if (type === 'paid') {
    const custom = priceLabel?.trim();
    return custom || 'Payant';
  }
  if (type === 'theloop') return 'THE LOOP';
  return 'Gratuit';
}
