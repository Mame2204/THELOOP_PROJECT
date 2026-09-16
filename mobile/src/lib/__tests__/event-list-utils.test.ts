import type { Event } from '@/types';
import { getEventAgendaEndAt, isEventPast } from '@/lib/event-list-utils';

function makeEvent(overrides: Partial<Event> & Pick<Event, 'startsAt'>): Event {
  return {
    id: 'evt-1',
    slug: 'evt-1',
    title: 'Test',
    description: '',
    category: 'culture',
    visibility: 'public',
    status: 'published',
    countryCode: 'GN',
    endsAt: null,
    ...overrides,
  } as Event;
}

describe('event-list-utils', () => {
  it('garde un événement sans date de fin visible toute la journée J', () => {
    const event = makeEvent({ startsAt: '2026-09-16T20:00:00+00:00', endsAt: null });
    const midday = new Date('2026-09-16T12:00:00+00:00');
    expect(isEventPast(event, midday)).toBe(false);
  });

  it('retire un événement sans date de fin après la fin de la journée J', () => {
    const event = makeEvent({ startsAt: '2026-09-16T20:00:00+00:00', endsAt: null });
    const nextDay = new Date('2026-09-17T00:00:01+00:00');
    expect(isEventPast(event, nextDay)).toBe(true);
  });

  it('retire un événement quand endsAt est dépassé', () => {
    const event = makeEvent({
      startsAt: '2026-09-16T18:00:00+00:00',
      endsAt: '2026-09-16T22:00:00+00:00',
    });
    const afterEnd = new Date('2026-09-16T22:30:00+00:00');
    expect(isEventPast(event, afterEnd)).toBe(true);
  });

  it('garde un événement le jour J quand endsAt est à minuit (saisie date seule)', () => {
    const event = makeEvent({
      startsAt: '2026-09-16T18:00:00+00:00',
      endsAt: '2026-09-16T00:00:00+00:00',
    });
    const midday = new Date('2026-09-16T12:00:00+00:00');
    expect(isEventPast(event, midday)).toBe(false);
    expect(getEventAgendaEndAt(event).getHours()).toBe(23);
  });
});
