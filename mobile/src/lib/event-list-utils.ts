import type { Event } from '@/types';

export type AgendaListRow =
  | { kind: 'month'; id: string; label: string }
  | { kind: 'event'; id: string; event: Event };

function endOfLocalCalendarDay(date: Date): Date {
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  return dayEnd;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isMidnightLocal(date: Date): boolean {
  return (
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0
  );
}

/** Date de fin saisie sans heure explicite (souvent minuit UTC/Z). */
function isDateOnlyEnd(iso: string, parsed: Date): boolean {
  const trimmed = iso.trim();
  if (/T00:00:00(\.000)?(Z|[+-]00:00)?$/i.test(trimmed)) return true;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return true;
  return isMidnightLocal(parsed);
}

/** Instant où l'événement quitte l'agenda (fin de journée si pas d'heure de fin explicite). */
export function getEventAgendaEndAt(event: Event): Date {
  const start = new Date(event.startsAt);

  if (!event.endsAt) {
    return endOfLocalCalendarDay(start);
  }

  const end = new Date(event.endsAt);
  // Date de fin saisie à minuit (souvent sans heure) : visible toute la journée J.
  if (isDateOnlyEnd(event.endsAt, end) && (isSameCalendarDay(start, end) || end.getTime() <= start.getTime())) {
    return endOfLocalCalendarDay(end);
  }

  return end;
}

/** Événement terminé (hors liste agenda, visible en favoris). */
export function isEventPast(event: Event, now: Date = new Date()): boolean {
  return getEventAgendaEndAt(event).getTime() < now.getTime();
}

/** Événement prévu aujourd'hui. */
export function isEventToday(event: Event, now: Date = new Date()): boolean {
  const start = new Date(event.startsAt);
  return isSameCalendarDay(start, now);
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
