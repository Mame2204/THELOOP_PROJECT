/** Formate une date ISO ou yyyy-mm-dd en jj/mm/aaaa */
export function formatDateFr(value: string): string {
  const date = new Date(value.includes('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Parse jj/mm/aaaa ou yyyy-mm-dd vers yyyy-mm-dd (input date) */
export function parseFrenchDateInput(value: string): string | null {
  const frMatch = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (frMatch) {
    const [, dd, mm, yyyy] = frMatch;
    return `${yyyy}-${mm}-${dd}`;
  }
  const isoMatch = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return value.trim();
  return null;
}
