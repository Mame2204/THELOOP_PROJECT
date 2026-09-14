import type { Event } from '@/types';

export function formatEventTimeRange(event: Event): string {
  const start = new Date(event.startsAt);
  const startTime = start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (!event.endsAt) return startTime;
  const end = new Date(event.endsAt);
  const endTime = end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${startTime} — ${endTime}`;
}

export function formatEventDate(event: Event): string {
  return new Date(event.startsAt).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatEventPrice(event: Event): string {
  if (event.entryPrice === null) return 'Gratuit';
  return `${event.entryPrice.toLocaleString('fr-FR')} ${event.currency}`;
}

export function getEventShareUrl(slug: string): string {
  return `${window.location.origin}/agenda/${slug}`;
}

export function getEventShareText(event: Event): string {
  return `${event.title} · ${formatEventDate(event)} · ${event.venueName}`;
}

export function getEventSharePayload(event: Event) {
  return {
    title: event.title,
    text: getEventShareText(event),
    url: getEventShareUrl(event.slug),
  };
}

export function getEventInfoUrl(event: Event): string {
  if (event.infoUrl) return event.infoUrl;
  return getEventShareUrl(event.slug);
}

export function addEventToCalendar(event: Event): void {
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + 2 * 60 * 60 * 1000);

  const toGoogleDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toGoogleDate(start)}/${toGoogleDate(end)}`,
    details: event.description,
    location: event.venueAddress ?? event.venueName,
  });

  window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, '_blank', 'noopener,noreferrer');
}
