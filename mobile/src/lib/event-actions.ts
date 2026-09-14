import type { Event } from '@/types';
import { isEventToday } from '@/lib/event-list-utils';
import { normalizeExternalUrl } from '@/lib/location-actions';

function normalizeUrlForCompare(url: string): string {
  return normalizeExternalUrl(url).replace(/\/+$/, '').toLowerCase();
}

export function urlsEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = a?.trim();
  const right = b?.trim();
  if (!left || !right) return false;
  return normalizeUrlForCompare(left) === normalizeUrlForCompare(right);
}

export function formatExternalUrlLabel(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

export function formatEventStartTime(event: Event): string {
  return new Date(event.startsAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Date + heure de début (sans heure de fin). */
export function formatEventDateTimeStart(event: Event): string {
  return `${formatEventDate(event)} · ${formatEventStartTime(event)}`;
}

export function formatEventTimeRange(event: Event): string {
  const startTime = formatEventStartTime(event);
  if (!event.endsAt) return startTime;
  const end = new Date(event.endsAt);
  const endTime = end.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${startTime} — ${endTime}`;
}

export function formatEventDate(event: Event): string {
  if (isEventToday(event)) return 'Aujourd\'hui';
  return new Date(event.startsAt).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatEventPrice(event: Event): string {
  if (event.isInvitationOnly) return 'Sur invitation';
  if (event.entryPrice === null) return 'Gratuit';
  return `${event.entryPrice.toLocaleString('fr-FR')} ${event.currency}`;
}

export function isInvitationOnlyEvent(event: Event): boolean {
  return event.isInvitationOnly === true;
}

export function isFreeEvent(event: Event): boolean {
  return !isInvitationOnlyEvent(event) && event.entryPrice === null;
}

export function getEventShareText(event: Event): string {
  return `${event.title} · ${formatEventDate(event)} · ${event.venueName}`;
}

export function isPaidEvent(event: Event): boolean {
  return !event.isInvitationOnly && event.entryPrice != null && event.entryPrice > 0;
}

/** Billetterie — événements payants uniquement. */
export function getEventTicketUrl(event: Event): string | null {
  if (!isPaidEvent(event)) return null;
  const info = event.infoUrl?.trim();
  return info ? normalizeExternalUrl(info) : null;
}

/** CTA « En savoir plus » — événements gratuits uniquement. */
export function getEventLearnMoreUrl(event: Event): string | null {
  if (isPaidEvent(event)) return null;
  const info = event.infoUrl?.trim();
  if (info) return normalizeExternalUrl(info);
  const website = event.websiteUrl?.trim();
  if (website) return normalizeExternalUrl(website);
  return null;
}

/** Site web affiché dans la ligne sociale (sans doublon avec billetterie / en savoir plus). */
export function getEventWebsiteSocialUrl(event: Event): string | null {
  const website = event.websiteUrl?.trim();
  if (!website) return null;
  const normalized = normalizeExternalUrl(website);
  if (!normalized) return null;
  const primary = isPaidEvent(event) ? getEventTicketUrl(event) : getEventLearnMoreUrl(event);
  if (primary && urlsEquivalent(normalized, primary)) return null;
  return normalized;
}

/** @deprecated Préférer getEventTicketUrl / getEventLearnMoreUrl */
export function getEventInfoUrl(event: Event): string | null {
  return getEventTicketUrl(event) ?? getEventLearnMoreUrl(event);
}

export function buildGoogleCalendarUrl(event: Event): string {
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
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
