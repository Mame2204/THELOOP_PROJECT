export function formatDateFr(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Format fixe jj/mm/aaaa. */
export function formatDateDdMmYyyy(input: string | Date): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** Échéance indicative à partir d’aujourd’hui + N jours (catalogue avantages). */
export function formatValidityEndFromDays(days: number, from = new Date()): string {
  const end = new Date(from);
  end.setDate(end.getDate() + Math.max(1, days || 30));
  return formatDateDdMmYyyy(end);
}
