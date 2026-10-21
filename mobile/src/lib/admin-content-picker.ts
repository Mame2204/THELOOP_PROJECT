export type AdminPickerKind = 'event' | 'spot' | 'tool';

export interface AdminPickerEntry {
  id: string;
  kind: AdminPickerKind;
  title: string;
  subtitle: string;
  slug: string;
}

export function foldPickerText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Tous les contenus du type, filtrés par le texte saisi (titre et détail). */
export function filterPickerEntries(
  items: AdminPickerEntry[],
  kind: AdminPickerKind,
  query: string,
): AdminPickerEntry[] {
  const needle = foldPickerText(query.trim());
  return items.filter((item) => {
    if (item.kind !== kind) return false;
    if (!needle) return true;
    return foldPickerText(`${item.title} ${item.subtitle}`).includes(needle);
  });
}
