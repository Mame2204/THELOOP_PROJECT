/** Taille de page par défaut pour toute liste Supabase (affichage / fetch). */
export const SUPABASE_LIST_PAGE_SIZE = 15;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Charge une table par pages de {@link SUPABASE_LIST_PAGE_SIZE}
 * (`.range(0,14)`, puis `15–29`, …) jusqu’à épuisement.
 */
export async function fetchSupabasePages<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  let from = 0;

  for (;;) {
    const to = from + SUPABASE_LIST_PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < SUPABASE_LIST_PAGE_SIZE) break;
    from += SUPABASE_LIST_PAGE_SIZE;
  }

  return { data: all, error: null };
}
