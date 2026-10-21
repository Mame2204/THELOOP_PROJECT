import { buildTheLoopTeamContentOptions } from '@/lib/partner-content-options';
import type { ContentSnapshot } from '@/lib/content-store';
import type { HomeLocation } from '@/lib/demo-data';
import type { Event } from '@/types';

function event(partial: Partial<Event> & Pick<Event, 'id' | 'title'>): Event {
  return {
    slug: partial.id,
    description: '',
    program: null,
    category: 'nightlife',
    visibility: 'public',
    status: 'published',
    contentStatus: 'published',
    startsAt: '2026-12-01T19:00:00.000Z',
    endsAt: null,
    venueName: 'Lieu',
    venueAddress: null,
    locationId: null,
    entryPrice: null,
    currency: 'GNF',
    coverImageUrl: null,
    speakers: [],
    partnerId: null,
    clickCount: 0,
    countryCode: 'GN',
    contentOrigin: 'admin',
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  } as Event;
}

function location(partial: Partial<HomeLocation> & Pick<HomeLocation, 'id' | 'name' | 'subCategory'>): HomeLocation {
  return {
    slug: partial.id,
    description: '',
    address: 'Conakry',
    phone: null,
    website: null,
    coverImageUrl: null,
    isVip: false,
    clickCount: 0,
    countryCode: 'GN',
    contentOrigin: 'admin',
    contentStatus: 'published',
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  } as HomeLocation;
}

function snapshot(events: Event[], locations: HomeLocation[]): ContentSnapshot {
  return {
    events,
    locations,
    featuredBanners: [],
    featuredSpotBanners: [],
    slugToEventId: new Map(),
    slugToLocationId: new Map(),
    source: 'supabase',
  };
}

describe('buildTheLoopTeamContentOptions', () => {
  it('propose les spots et outils équipe même si l’origine brute n’est pas admin', () => {
    const options = buildTheLoopTeamContentOptions(
      snapshot(
        [event({ id: 'evt-new', title: 'Jazz au Comptoir' })],
        [
          location({ id: 'spot-old', name: 'Ancien spot', subCategory: 'hotels' }),
          location({
            id: 'spot-new',
            name: 'Hôtel Baie d\'Or',
            subCategory: 'hotels',
            contentOrigin: 'partner',
          }),
          location({
            id: 'tool-new',
            name: 'Nago',
            subCategory: 'tools',
            toolCategory: 'tool-autre',
            contentOrigin: null,
          }),
          location({
            id: 'spot-partner',
            name: 'Vrai partenaire',
            subCategory: 'fine_dining',
            contentOrigin: 'partner',
          }),
        ],
      ),
      'GN',
      {
        events: new Set(['evt-new']),
        locations: new Set(['spot-old', 'spot-new', 'tool-new']),
      },
    );

    expect(options.map((option) => option.title)).toEqual([
      'Ancien spot',
      'Hôtel Baie d\'Or',
      'Jazz au Comptoir',
      'Nago',
    ]);
    expect(options.find((option) => option.title === 'Nago')?.contentType).toBe('tool');
    expect(options.find((option) => option.title === 'Hôtel Baie d\'Or')?.contentType).toBe('spot');
  });

  it('ignore un brouillon et un autre pays', () => {
    const options = buildTheLoopTeamContentOptions(
      snapshot(
        [event({ id: 'evt-draft', title: 'Brouillon', status: 'draft', contentStatus: 'draft' })],
        [
          location({
            id: 'spot-sn',
            name: 'Dakar',
            subCategory: 'hotels',
            countryCode: 'SN',
          }),
        ],
      ),
      'GN',
      { events: new Set(['evt-draft']), locations: new Set(['spot-sn']) },
    );

    expect(options).toEqual([]);
  });
});
