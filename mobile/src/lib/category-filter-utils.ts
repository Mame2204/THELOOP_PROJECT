export interface CategoryVisibilityFilter {
  slugs: Set<string>;
  labels: Set<string>;
}

export function emptyCategoryVisibilityFilter(): CategoryVisibilityFilter {
  return { slugs: new Set(), labels: new Set() };
}

export function normalizeCategoryToken(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

export function buildCategoryVisibilityFilter(
  items: Array<{ id: string; label: string }>,
): CategoryVisibilityFilter {
  return {
    slugs: new Set(items.map((c) => normalizeCategoryToken(c.id)).filter(Boolean)),
    labels: new Set(items.map((c) => normalizeCategoryToken(c.label)).filter(Boolean)),
  };
}

export function matchesCategoryToken(
  slugOrLabel: string | null | undefined,
  filter: CategoryVisibilityFilter,
): boolean {
  const token = normalizeCategoryToken(slugOrLabel);
  if (!token) return false;
  return filter.slugs.has(token) || filter.labels.has(token);
}

export function matchesAnyCategoryToken(
  values: Array<string | null | undefined>,
  filter: CategoryVisibilityFilter,
): boolean {
  return values.some((v) => matchesCategoryToken(v, filter));
}
