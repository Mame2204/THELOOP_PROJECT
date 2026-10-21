/** Ajoute le catalogue LoopX aux favoris quand le membre a le droit de le voir. */
export function mergePrimeIntoFavorites<T extends { id: string }>(
  publicItems: T[],
  primeItems: T[],
  canViewPrime: boolean,
): T[] {
  if (!canViewPrime) return publicItems;
  const seen = new Set(publicItems.map((item) => item.id));
  return [...publicItems, ...primeItems.filter((item) => !seen.has(item.id))];
}
