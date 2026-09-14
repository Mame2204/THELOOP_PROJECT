/** Utilitaires catégories multiples (événements & spots). */

export function normalizeCategoriesList(raw: unknown, fallback: string): string[] {
  if (Array.isArray(raw)) {
    const list = raw.map((v) => String(v).trim()).filter(Boolean);
    if (list.length) return [...new Set(list)];
  }
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [fallback];
}

export function primaryCategory(categories: string[], fallback: string): string {
  return categories[0]?.trim() || fallback;
}

export function toggleCategoryInList(list: string[], id: string, min = 1): string[] {
  if (list.includes(id)) {
    const next = list.filter((c) => c !== id);
    return next.length >= min ? next : list;
  }
  return [...list, id];
}

export function eventMatchesCategoryFilter(
  event: { category: string; categories?: string[] },
  filter: string,
): boolean {
  if (filter === 'all') return true;
  return event.category === filter || (event.categories?.includes(filter) ?? false);
}

export function spotMatchesSubCategoryFilter(
  location: { subCategory: string; categories?: string[] },
  filter: string,
): boolean {
  if (filter === 'all') return true;
  return location.subCategory === filter || (location.categories?.includes(filter) ?? false);
}
