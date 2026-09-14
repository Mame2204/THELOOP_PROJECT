export type ContentChannel = 'admin' | 'loop' | 'partner';
export type ContentOrigin = ContentChannel;

export const THE_LOOP_ORGANIZER_LABEL = 'THE LOOP';

export const CONTENT_ORIGIN_LABELS: Record<ContentOrigin, string> = {
  admin: 'Admin',
  loop: 'THE LOOP',
  partner: 'Partenaire',
};

export function defaultEventOrganizerName(options: {
  channel: ContentChannel;
  company?: string | null;
  fullName?: string | null;
}): string {
  if (options.channel === 'partner') {
    return (options.company ?? options.fullName ?? '').trim();
  }
  return THE_LOOP_ORGANIZER_LABEL;
}

export function resolveEventOrganizerName(
  raw: string,
  options: {
    channel: ContentChannel;
    company?: string | null;
    fullName?: string | null;
  },
): string | null {
  const trimmed = raw.trim();
  if (options.channel === 'loop') {
    return trimmed || THE_LOOP_ORGANIZER_LABEL;
  }
  if (options.channel === 'admin') {
    return trimmed || null;
  }
  return trimmed || (options.company ?? options.fullName ?? '').trim() || null;
}

export function resolveContentChannel(params: {
  asAdmin?: boolean;
  contentChannel?: ContentChannel;
}): ContentChannel {
  if (!params.asAdmin) return 'partner';
  return params.contentChannel === 'loop' ? 'loop' : 'admin';
}

/** Publications de l'équipe THE LOOP (admin / super admin), hors partenaires. */
export function isTeamContentOrigin(origin: ContentOrigin | null | undefined): boolean {
  return origin === 'admin' || origin === 'loop';
}

export function contentOriginFromStaging(event: {
  contentChannel?: ContentChannel | null;
  contentOrigin?: ContentOrigin | null;
  partnerName?: string | null;
  partnerId?: string | null;
}): ContentOrigin {
  if (event.contentOrigin === 'admin' || event.contentOrigin === 'loop' || event.contentOrigin === 'partner') {
    return event.contentOrigin;
  }
  if (event.contentChannel === 'admin' || event.contentChannel === 'loop' || event.contentChannel === 'partner') {
    return event.contentChannel;
  }
  if (event.partnerId === 'admin') return 'admin';
  const name = (event.partnerName ?? '').toLowerCase();
  if (name.includes('the loop') && !name.includes('admin')) return 'loop';
  if (name.includes('admin') || name.includes('the loop')) return 'admin';
  return 'partner';
}
