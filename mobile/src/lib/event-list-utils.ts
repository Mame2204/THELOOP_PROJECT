import type { Event } from '@/types';

export type AgendaListRow =
  | { kind: 'month'; id: string; label: string }
  | { kind: 'event'; id: string; event: Event };

/** Événement terminé (hors liste agenda, visible en favoris). */
export function isEventPast(event: Event, now: Date = new Date()): boolean {
  if (event.endsAt) {
    return new Date(event.endsAt).getTime() < now.getTime();
  }
  const dayEnd = new Date(event.startsAt);
  dayEnd.setHours(23, 59, 59, 999);
  return dayEnd.getTime() < now.getTime();
}

/** Événement prévu aujourd'hui. */
export function isEventToday(event: Event, now: Date = new Date()): boolean {
  const start = new Date(event.startsAt);
  return (
    start.getDate() === now.getDate() &&
    start.getMonth() === now.getMonth() &&
    start.getFullYear() === now.getFullYear()
  );
}

export function getEventStatusLabel(event: Event): 'Aujourd\'hui' | 'Passé' | null {
  if (isEventToday(event)) return 'Aujourd\'hui';
  if (isEventPast(event)) return 'Passé';
  return null;
}

/** Du plus proche au plus lointain. */
export function sortEventsByDateAsc(events: Event[]): Event[] {
  return [...events].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}

export function filterUpcomingEvents(events: Event[], now: Date = new Date()): Event[] {
  return events.filter((e) => !isEventPast(e, now));
}

export function formatMonthYearFr(date: Date): string {
  const label = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Regroupe par mois — n'affiche un titre que si le mois contient des événements. */
export function buildAgendaListRows(events: Event[]): AgendaListRow[] {
  const sorted = sortEventsByDateAsc(events);
  const rows: AgendaListRow[] = [];
  const seenEventIds = new Set<string>();
  let lastMonthKey = '';

  for (const event of sorted) {
    if (seenEventIds.has(event.id)) continue;
    seenEventIds.add(event.id);

    const d = new Date(event.startsAt);
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
    if (monthKey !== lastMonthKey) {
      rows.push({ kind: 'month', id: `month-${monthKey}`, label: formatMonthYearFr(d) });
      lastMonthKey = monthKey;
    }
    rows.push({ kind: 'event', id: event.id, event });
  }

  return rows;
}
