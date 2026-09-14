import type { Event, Location, User, HeroBanner, ResolvedHeroBanner } from '@/types';
import { getApprovedPublicEvents, getApprovedPublicLocations } from '@/lib/admin-store';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';

function withCountryCode<T extends object>(items: T[]): (T & { countryCode: string })[] {
  return items.map((item) => ({ ...item, countryCode: DEFAULT_COUNTRY_CODE }));
}

export interface HomeLocation extends Location {
  district: string;
  rating: number;
  subtitle: string;
  tags: { emoji: string; label: string }[];
  galleryImages: string[];
  openingHours: string;
  priceLabel: string;
  favoriteCount: number;
  /** Lien principal du bouton CTA (site, réseaux, carte…) */
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
}

export const EVENT_ORGANIZERS: Record<string, string> = {
  'evt-1': 'Vista Bank',
  'evt-2': 'Conakry Events',
  'evt-3': 'Fondation Yéya',
  'evt-4': 'Orange Guinée',
  'evt-5': 'Conakry Events',
};

const _DEMO_EVENTS = [
  {
    id: 'evt-1',
    title: 'Forum Leaders & Finance — Édition Guinée 2025',
    slug: 'forum-leaders-finance-guinee-2025',
    description: 'Rejoignez les décideurs de l\'écosystème financier guinéen pour une soirée d\'échanges haut niveau.',
    program: '18h00 Accueil VIP · 18h30 Panels Experts · 20h30 Cocktail Networking · 22h00 Fin',
    category: 'corporate',
    visibility: 'public',
    status: 'published',
    startsAt: '2025-07-17T18:00:00+00:00',
    endsAt: '2025-07-17T22:00:00+00:00',
    venueName: 'Hôtel Noom, Kaloum',
    venueAddress: 'Kaloum, Conakry',
    locationId: 'loc-2',
    entryPrice: 150000,
    currency: 'GNF',
    coverImageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
    speakers: [
      { id: 'sp-1', name: 'Mamadou Baldé', title: 'Directeur Général', company: 'Vista Bank Guinée', photoUrl: null },
      { id: 'sp-2', name: 'Aïssatou Diallo', title: 'Économiste Principale', company: 'BCRG', photoUrl: null },
    ],
    partnerId: null,
    clickCount: 1204,
    infoUrl: 'https://example.com/forum-leaders-finance',
    createdAt: '2026-01-10T00:00:00+00:00',
    updatedAt: '2026-01-10T00:00:00+00:00',
  },
  {
    id: 'evt-5',
    title: 'Nuit Étoilée — Fally Ipupa',
    slug: 'nuit-etoilee-fally-ipupa',
    description: 'La plus grande soirée nightlife de l\'été à Conakry.',
    program: null,
    category: 'nightlife',
    visibility: 'public',
    status: 'published',
    startsAt: '2026-08-15T22:00:00+00:00',
    endsAt: '2026-08-16T04:00:00+00:00',
    venueName: 'Stade Général Lansana Conté',
    venueAddress: 'Conakry',
    locationId: null,
    entryPrice: 200000,
    currency: 'GNF',
    coverImageUrl: 'https://images.unsplash.com/photo-1571266028243-d220c702dbed?w=800&q=80',
    speakers: [],
    partnerId: null,
    clickCount: 987,
    createdAt: '2026-02-01T00:00:00+00:00',
    updatedAt: '2026-02-01T00:00:00+00:00',
  },
  {
    id: 'evt-3',
    title: 'Vernissage — Regards Croisés sur Conakry',
    slug: 'vernissage-regards-croises',
    description: 'Une exposition photo célébrant la lumière et les visages de Conakry.',
    program: 'Ouverture 18h · Performance live 20h',
    category: 'art_culture',
    visibility: 'public',
    status: 'published',
    startsAt: '2026-07-20T18:00:00+00:00',
    endsAt: '2026-07-20T23:00:00+00:00',
    venueName: 'Centre Culturel Franco-Guinéen',
    venueAddress: 'Dixinn, Conakry',
    locationId: null,
    entryPrice: 50000,
    currency: 'GNF',
    coverImageUrl: 'https://images.unsplash.com/photo-1460661419015-442b140a9a91?w=800&q=80',
    speakers: [],
    partnerId: null,
    clickCount: 612,
    createdAt: '2026-03-15T00:00:00+00:00',
    updatedAt: '2026-03-15T00:00:00+00:00',
  },
  {
    id: 'evt-4',
    title: 'Brunch d\'Affaires Dominical — L\'Avenue',
    slug: 'brunch-affaires-lavenue',
    description: 'Brunch networking dominical pour entrepreneurs et cadres dirigeants.',
    program: '11h00 — 14h00',
    category: 'gastronomie',
    visibility: 'public',
    status: 'published',
    startsAt: '2026-08-03T11:00:00+00:00',
    endsAt: '2026-08-03T14:00:00+00:00',
    venueName: 'L\'Avenue',
    venueAddress: 'Kaloum, Conakry',
    locationId: 'loc-1',
    entryPrice: 85000,
    currency: 'GNF',
    coverImageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    speakers: [],
    partnerId: null,
    clickCount: 488,
    createdAt: '2026-04-01T00:00:00+00:00',
    updatedAt: '2026-04-01T00:00:00+00:00',
  },
  {
    id: 'evt-bl-1',
    title: 'Founders Dinner — Édition Privée',
    slug: 'founders-dinner-prive',
    description: 'Dîner exclusif réservé aux membres Loop Prime. Lieu révélé 24h avant.',
    program: '19h30 — Accueil\n20h00 — Dîner\n22h00 — Discussions privées',
    category: 'gastronomie',
    visibility: 'prime',
    status: 'published',
    startsAt: '2026-09-05T19:30:00+00:00',
    endsAt: null,
    venueName: 'Lieu secret',
    venueAddress: null,
    locationId: null,
    entryPrice: null,
    currency: 'GNF',
    coverImageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
    speakers: [],
    partnerId: null,
    clickCount: 45,
    infoUrl: 'mailto:concierge@theloop.gn?subject=Founders%20Dinner',
    createdAt: '2026-04-01T00:00:00+00:00',
    updatedAt: '2026-04-01T00:00:00+00:00',
  },
];

export const DEMO_EVENTS: Event[] = withCountryCode(_DEMO_EVENTS) as Event[];

const _DEMO_HOME_LOCATIONS = [
  {
    id: 'loc-1',
    name: 'L\'Avenue',
    slug: 'lavenue',
    description:
      'L\'adresse incontournable de la scène business conakryenne. Cuisine franco-africaine raffinée, cave à vins sélectionnée, et salons privés pour vos déjeuners d\'affaires et dîners prestigieux.',
    subCategory: 'fine_dining',
    address: 'Kaloum, Conakry',
    phone: '+224 622 00 00 00',
    website: null,
    coverImageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=80',
    isVip: true,
    clickCount: 256,
    createdAt: '2026-01-01T00:00:00+00:00',
    updatedAt: '2026-01-01T00:00:00+00:00',
    district: 'KALOUM',
    rating: 4.9,
    subtitle: 'Fine Dining & Business Meetings',
    tags: [
      { emoji: '🍽️', label: 'Gastronomie' },
      { emoji: '💼', label: 'Corporate' },
      { emoji: '✨', label: 'Prestige' },
    ],
    galleryImages: [
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=80',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=900&q=80',
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=900&q=80',
      'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=900&q=80',
    ],
    openingHours: 'Lun–Sam · 12h00 – 00h00',
    priceLabel: 'Dès 80 000 GNF / pers.',
    favoriteCount: 342,
    ctaUrl: '/spots/lavenue',
    ctaLabel: 'Voir la fiche du lieu',
  },
  {
    id: 'loc-2',
    name: 'Hôtel Noom',
    slug: 'hotel-noom',
    description: 'Hôtel 5 étoiles emblématique, conférences et séjours exécutifs.',
    subCategory: 'hotels',
    address: 'Kaloum, Conakry',
    phone: '+224 620 00 00 02',
    website: 'https://example.com',
    coverImageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&q=80',
    isVip: true,
    clickCount: 743,
    createdAt: '2026-01-01T00:00:00+00:00',
    updatedAt: '2026-01-01T00:00:00+00:00',
    district: 'KALOUM',
    rating: 4.8,
    subtitle: 'Conférences & Séjours Exécutifs',
    tags: [
      { emoji: '🏨', label: '5 étoiles' },
      { emoji: '💼', label: 'Corporate' },
    ],
    galleryImages: [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&q=80',
      'https://images.unsplash.com/photo-1542314831-068cd1dbcd26?w=900&q=80',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=900&q=80',
    ],
    openingHours: '24h / 24 · 7j / 7',
    priceLabel: 'Dès 450 000 GNF / nuit',
    favoriteCount: 518,
    ctaUrl: 'https://example.com',
    ctaLabel: 'Réserver sur le site',
  },
  {
    id: 'loc-3',
    name: 'Sky Lounge Kaloum',
    slug: 'sky-lounge-kaloum',
    description: 'Bar lounge rooftop avec cocktails premium.',
    subCategory: 'bars_lounges',
    address: 'Kaloum, Conakry',
    phone: '+224 620 00 00 03',
    website: null,
    coverImageUrl: 'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=900&q=80',
    isVip: true,
    clickCount: 178,
    createdAt: '2026-01-01T00:00:00+00:00',
    updatedAt: '2026-01-01T00:00:00+00:00',
    district: 'KALOUM',
    rating: 4.7,
    subtitle: 'Rooftop & Cocktails Signature',
    tags: [
      { emoji: '🌙', label: 'Nightlife' },
      { emoji: '✨', label: 'Prestige' },
    ],
    galleryImages: [
      'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=900&q=80',
      'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=900&q=80',
      'https://images.unsplash.com/photo-1571266028243-d220c702dbed?w=900&q=80',
    ],
    openingHours: 'Mer–Dim · 20h00 – 04h00',
    priceLabel: 'Cocktails dès 45 000 GNF',
    favoriteCount: 189,
  },
  {
    id: 'loc-4',
    name: 'Le Petit Bateau',
    slug: 'le-petit-bateau',
    description: 'Restaurant gastronomique vue océan, cuisine fusion.',
    subCategory: 'fine_dining',
    address: 'Corniche, Conakry',
    phone: '+224 620 00 00 04',
    website: null,
    coverImageUrl: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=900&q=80',
    isVip: true,
    clickCount: 312,
    createdAt: '2026-01-01T00:00:00+00:00',
    updatedAt: '2026-01-01T00:00:00+00:00',
    district: 'CORNICHE',
    rating: 4.8,
    subtitle: 'Vue Océan & Gastronomie',
    tags: [
      { emoji: '🍽️', label: 'Gastronomie' },
      { emoji: '🌊', label: 'Vue mer' },
    ],
    galleryImages: [
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=900&q=80',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=80',
      'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=900&q=80',
    ],
    openingHours: 'Mar–Dim · 12h30 – 23h00',
    priceLabel: 'Dès 95 000 GNF / pers.',
    favoriteCount: 276,
  },
  {
    id: 'loc-5',
    name: 'Palm Camayenne',
    slug: 'palm-camayenne',
    description: 'Institution hôtelière de la Corniche Nord.',
    subCategory: 'hotels',
    address: 'Corniche Nord, Conakry',
    phone: '+224 620 00 00 05',
    website: null,
    coverImageUrl: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=900&q=80',
    isVip: true,
    clickCount: 412,
    createdAt: '2026-01-01T00:00:00+00:00',
    updatedAt: '2026-01-01T00:00:00+00:00',
    district: 'CORNICHE',
    rating: 4.6,
    subtitle: 'Hôtel Légendaire de Conakry',
    tags: [
      { emoji: '🏨', label: '5 étoiles' },
      { emoji: '💼', label: 'Corporate' },
    ],
    galleryImages: [
      'https://images.unsplash.com/photo-1582719508461-905c673771fd?w=900&q=80',
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=900&q=80',
      'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=900&q=80',
    ],
    openingHours: '24h / 24 · 7j / 7',
    priceLabel: 'Dès 380 000 GNF / nuit',
    favoriteCount: 401,
  },
  {
    id: 'loc-6',
    name: 'The Roof',
    slug: 'the-roof',
    description: 'Lounge nocturne et cocktails premium.',
    subCategory: 'bars_lounges',
    address: 'Dixinn, Conakry',
    phone: '+224 620 00 00 06',
    website: null,
    coverImageUrl: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=900&q=80',
    isVip: true,
    clickCount: 145,
    createdAt: '2026-01-01T00:00:00+00:00',
    updatedAt: '2026-01-01T00:00:00+00:00',
    district: 'DIXINN',
    rating: 4.5,
    subtitle: 'Bars & Lounges Premium',
    tags: [
      { emoji: '🌙', label: 'Nightlife' },
      { emoji: '🍸', label: 'Cocktails' },
    ],
    galleryImages: [
      'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=900&q=80',
      'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=900&q=80',
      'https://images.unsplash.com/photo-1571266028243-d220c702dbed?w=900&q=80',
    ],
    openingHours: 'Jeu–Sam · 21h00 – 05h00',
    priceLabel: 'Entrée · cocktails dès 35 000 GNF',
    favoriteCount: 124,
    instagramUrl: 'https://instagram.com',
    ctaLabel: 'Instagram',
  },
  {
    id: 'loc-bl-1',
    name: 'Salon Privé — Villa Corniche',
    slug: 'salon-prive-villa-corniche',
    description: 'Adresse ultra-privée réservée aux membres Loop Prime. Accès sur invitation uniquement.',
    subCategory: 'bars_lounges',
    address: 'Corniche Nord, Conakry',
    phone: null,
    website: null,
    coverImageUrl: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=900&q=80',
    isVip: true,
    visibility: 'prime',
    clickCount: 28,
    createdAt: '2026-01-01T00:00:00+00:00',
    updatedAt: '2026-01-01T00:00:00+00:00',
    district: 'CORNICHE',
    rating: 5,
    subtitle: 'Loop Prime Exclusive',
    tags: [{ emoji: '◆', label: 'Loop Prime' }],
    galleryImages: ['https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=900&q=80'],
    openingHours: 'Sur invitation',
    priceLabel: 'Privé',
    favoriteCount: 12,
    ctaUrl: '/spots/salon-prive-villa-corniche',
    ctaLabel: 'Accéder à la fiche privée',
  },
];

export const DEMO_HOME_LOCATIONS: HomeLocation[] = withCountryCode(_DEMO_HOME_LOCATIONS) as HomeLocation[];

/** @deprecated Utiliser DEMO_HOME_LOCATIONS pour l'accueil */
export const DEMO_LOCATIONS: Location[] = DEMO_HOME_LOCATIONS;

const _DEMO_MEMBERS = [
  {
    id: 'mem-1',
    email: 'a.diallo@example.com',
    firstName: 'Amadou',
    lastName: 'Diallo',
    fullName: 'Amadou Diallo',
    phoneNumber: null,
    userRole: 'prime',
    qrCodeToken: 'mem-1-qr',
    avatarUrl: null,
    role: 'USER_PRIME',
    company: 'Guinée Invest',
    jobTitle: 'CEO',
    sector: 'Finance & Investissement',
    isDirectoryOptIn: true,
    createdAt: '2026-01-01T00:00:00+00:00',
    updatedAt: '2026-01-01T00:00:00+00:00',
  },
  {
    id: 'mem-2',
    email: 'f.bah@example.com',
    firstName: 'Fatoumata',
    lastName: 'Bah',
    fullName: 'Fatoumata Bah',
    phoneNumber: null,
    userRole: 'prime',
    qrCodeToken: 'mem-2-qr',
    avatarUrl: null,
    role: 'USER_PRIME',
    company: 'Ecobank Guinée',
    jobTitle: 'Directrice Générale',
    sector: 'Banque',
    isDirectoryOptIn: true,
    createdAt: '2026-01-01T00:00:00+00:00',
    updatedAt: '2026-01-01T00:00:00+00:00',
  },
];

export const DEMO_MEMBERS: User[] = withCountryCode(_DEMO_MEMBERS) as User[];

export function getPublicEvents() {
  const approved = getApprovedPublicEvents();
  const demo = DEMO_EVENTS.filter((e) => e.visibility === 'public' && e.status === 'published');
  return [...approved, ...demo];
}

export function getPrimeEvents() {
  return DEMO_EVENTS.filter((e) => e.visibility === 'prime' && e.status === 'published');
}

export function getPrimeLocations() {
  return DEMO_HOME_LOCATIONS.filter((l) => l.visibility === 'prime');
}

export function getAgendaFeed(includeExclusive: boolean) {
  const publicEvents = getPublicEvents();
  if (!includeExclusive) {
    return { publicEvents, exclusiveEvents: getPrimeEvents() };
  }
  return { publicEvents, exclusiveEvents: [] as typeof publicEvents, allEvents: [...publicEvents, ...getPrimeEvents()] };
}

export function getGuideFeed(includeExclusive: boolean) {
  const publicLocations = getHomeLocations().filter((l) => l.visibility !== 'prime');
  const exclusiveLocations = getPrimeLocations();
  if (!includeExclusive) {
    return { publicLocations, exclusiveLocations };
  }
  return { publicLocations, exclusiveLocations: [] as typeof publicLocations, allLocations: [...publicLocations, ...exclusiveLocations] };
}

export function getEventBySlug(slug: string) {
  return getPublicEvents().find((e) => e.slug === slug) ?? DEMO_EVENTS.find((e) => e.slug === slug);
}

export function getLocationBySlug(slug: string) {
  const approved = getApprovedPublicLocations().find((l) => l.slug === slug);
  return approved ?? DEMO_HOME_LOCATIONS.find((l) => l.slug === slug);
}

export function getHomeLocations(subCategory?: import('@/types').LocationSubCategory) {
  const approved = getApprovedPublicLocations();
  const demo = subCategory
    ? DEMO_HOME_LOCATIONS.filter((l) => l.subCategory === subCategory)
    : DEMO_HOME_LOCATIONS;
  const approvedFiltered = subCategory
    ? approved.filter((l) => l.subCategory === subCategory)
    : approved;
  return [...approvedFiltered, ...demo];
}

/** Résout une bannière « À la une » vers le contenu public existant. */
export function resolveHeroBanner(banner: HeroBanner): ResolvedHeroBanner | null {
  if (banner.targetType === 'event') {
    const event = getPublicEvents().find((item) => item.id === banner.targetId);
    if (!event) return null;
    return {
      id: banner.id,
      targetType: 'event',
      targetId: event.id,
      title: event.title,
      subtitle: event.venueName,
      imageUrl: event.coverImageUrl,
      linkUrl: `/agenda/${event.slug}`,
      sortOrder: banner.sortOrder,
      isActive: banner.isActive,
    };
  }

  const location = getHomeLocations().find((item) => item.id === banner.targetId);
  if (!location) return null;
  return {
    id: banner.id,
    targetType: 'location',
    targetId: location.id,
    title: location.name,
    subtitle: location.subtitle,
    imageUrl: location.coverImageUrl,
    linkUrl: `/spots/${location.slug}`,
    sortOrder: banner.sortOrder,
    isActive: banner.isActive,
  };
}

export function resolveHeroBanners(banners: HeroBanner[]): ResolvedHeroBanner[] {
  return banners
    .map(resolveHeroBanner)
    .filter((item): item is ResolvedHeroBanner => item !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getHighlightableEvents() {
  return getPublicEvents().filter((event) => event.status === 'published' && event.visibility === 'public');
}

export function getHighlightableLocations() {
  return getHomeLocations();
}
