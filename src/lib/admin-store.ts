import type { Event, HeroBanner, PartnerToken, UserRole } from '@/types';
import { DEMO_EVENTS, DEMO_HOME_LOCATIONS, type HomeLocation } from '@/lib/demo-data';
import type {
  AdminDirectPartnerInput,
  AdminPartnershipApplication,
  ManagedUser,
  PlatformCategory,
  StagingEventItem,
  StagingLocationItem,
} from '@/types/admin';
import type { PrimeInvitation } from '@/types/prime';

const ADMIN_STORE_KEY = 'loop_admin_store';

export function generatePartnerTokenCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SPOT-${code}-${new Date().getFullYear()}`;
}

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface AdminStore {
  heroBanners: HeroBanner[];
  partnerTokens: PartnerToken[];
  applications: AdminPartnershipApplication[];
  stagingEvents: StagingEventItem[];
  stagingLocations: StagingLocationItem[];
  publishedEvents: Event[];
  publishedLocations: HomeLocation[];
  primeInvitations: PrimeInvitation[];
  platformCategories: PlatformCategory[];
  managedUsers: ManagedUser[];
}

function defaultStore(): AdminStore {
  const now = new Date().toISOString();
  return {
    heroBanners: [
      { id: 'hb-1', targetType: 'event', targetId: 'evt-1', sortOrder: 0, isActive: true, createdAt: now, updatedAt: now },
      { id: 'hb-2', targetType: 'location', targetId: 'loc-1', sortOrder: 1, isActive: true, createdAt: now, updatedAt: now },
      { id: 'hb-3', targetType: 'event', targetId: 'evt-5', sortOrder: 2, isActive: true, createdAt: now, updatedAt: now },
    ],
    partnerTokens: [
      {
        id: 'tok-demo',
        partnerName: 'L\'Avenue',
        tokenCode: 'SPOT-DEMO-2026',
        expiresAt: '2026-12-31T23:59:59+00:00',
        status: 'active',
        createdBy: 'admin-demo',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-1',
        partnerName: 'Vista Bank Events',
        tokenCode: 'SPOT-VSTB-2025',
        expiresAt: '2025-12-31T23:59:59+00:00',
        status: 'expired',
        createdBy: 'admin-demo',
        createdAt: now,
        updatedAt: now,
      },
    ],
    applications: [
      {
        id: 'app-1',
        companyName: 'Le Bistro de Paris',
        contactName: 'Jean Dupont',
        email: 'contact@bistroparis.gn',
        phone: '+224 622 11 22 33',
        activityType: 'restaurant',
        message: 'Nous organisons des dégustations mensuelles et souhaitons promouvoir nos soirées gastronomiques.',
        status: 'pending',
        submittedAt: '2026-06-29T10:00:00+00:00',
        reviewedAt: null,
        generatedTokenCode: null,
        rejectionReason: null,
      },
    ],
    stagingEvents: [],
    stagingLocations: [],
    publishedEvents: [],
    publishedLocations: [],
    primeInvitations: [
      {
        id: 'prime-demo',
        tokenCode: 'INVIT-DEMO-2026',
        memberName: 'Invité Loop Prime Démo',
        email: null,
        status: 'pending',
        subscriptionStatus: 'none',
        subscriptionExpiresAt: null,
        activatedAt: null,
        activatedUserId: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    platformCategories: [
      { id: 'pcat-1', label: 'Corporate & Finance', emoji: '💼', eventCategory: 'corporate', updatedAt: now },
      { id: 'pcat-2', label: 'Nightlife', emoji: '🌙', eventCategory: 'nightlife', updatedAt: now },
      { id: 'pcat-3', label: 'Art & Culture', emoji: '🎭', eventCategory: 'art_culture', updatedAt: now },
      { id: 'pcat-4', label: 'Gastronomie', emoji: '🍽️', eventCategory: 'gastronomie', updatedAt: now },
      { id: 'pcat-5', label: 'Brunch & Détente', emoji: '☕', eventCategory: 'gastronomie', updatedAt: now },
      { id: 'pcat-6', label: 'Concerts & Live', emoji: '🎤', eventCategory: 'nightlife', updatedAt: now },
    ],
    managedUsers: [
      { id: 'demo-free-user', fullName: 'Aïssata Camara', email: 'membre@theloop.gn', role: 'USER_FREE', status: 'active', company: null, updatedAt: now },
      { id: 'prime-demo', fullName: 'Fatoumata Bah', email: 'prime@theloop.gn', role: 'USER_PRIME', status: 'active', company: 'Ecobank Guinée', updatedAt: now },
      { id: 'partner-demo', fullName: 'L\'Avenue — Direction', email: 'contact@lavenue.gn', role: 'PARTNER', status: 'active', company: 'L\'Avenue', updatedAt: now },
      { id: 'admin-demo', fullName: 'Admin THE LOOP', email: 'admin@theloop.gn', role: 'ADMIN', status: 'active', company: 'THE LOOP', updatedAt: now },
    ],
  };
}

function migrateHeroBanner(raw: Record<string, unknown>, index: number, now: string): HeroBanner {
  if (raw.targetType && raw.targetId) {
    return raw as unknown as HeroBanner;
  }

  const linkUrl = typeof raw.linkUrl === 'string' ? raw.linkUrl : '';
  if (linkUrl.includes('/agenda/')) {
    const slug = linkUrl.split('/agenda/')[1];
    const event = DEMO_EVENTS.find((item) => item.slug === slug);
    if (event) {
      return {
        id: String(raw.id ?? `hb-${index}`),
        targetType: 'event',
        targetId: event.id,
        sortOrder: Number(raw.sortOrder ?? index),
        isActive: raw.isActive !== false,
        createdAt: String(raw.createdAt ?? now),
        updatedAt: String(raw.updatedAt ?? now),
      };
    }
  }

  if (linkUrl.includes('/spots/')) {
    const slug = linkUrl.split('/spots/')[1];
    const location = DEMO_HOME_LOCATIONS.find((item) => item.slug === slug);
    if (location) {
      return {
        id: String(raw.id ?? `hb-${index}`),
        targetType: 'location',
        targetId: location.id,
        sortOrder: Number(raw.sortOrder ?? index),
        isActive: raw.isActive !== false,
        createdAt: String(raw.createdAt ?? now),
        updatedAt: String(raw.updatedAt ?? now),
      };
    }
  }

  const defaults = defaultStore().heroBanners;
  return defaults[index] ?? defaults[0];
}

function normalizeStore(parsed: Partial<AdminStore>): AdminStore {
  const base = defaultStore();
  const now = new Date().toISOString();
  const heroSource = Array.isArray(parsed.heroBanners) ? parsed.heroBanners : base.heroBanners;

  return {
    ...base,
    ...parsed,
    heroBanners: heroSource.map((banner, index) =>
      migrateHeroBanner(banner as unknown as Record<string, unknown>, index, now),
    ),
    applications: (Array.isArray(parsed.applications) ? parsed.applications : base.applications).map((app) => ({
      ...app,
      rejectionReason: app.rejectionReason ?? null,
    })),
    stagingEvents: (Array.isArray(parsed.stagingEvents) ? parsed.stagingEvents : []).map((item) => ({
      ...item,
      workspaceRefId: item.workspaceRefId ?? null,
      rejectionReason: item.rejectionReason ?? null,
      updatedAt: item.updatedAt ?? item.createdAt,
    })),
    stagingLocations: (Array.isArray(parsed.stagingLocations) ? parsed.stagingLocations : []).map((item) => ({
      ...item,
      workspaceRefId: item.workspaceRefId ?? null,
      rejectionReason: item.rejectionReason ?? null,
      updatedAt: item.updatedAt ?? item.createdAt,
    })),
    partnerTokens: Array.isArray(parsed.partnerTokens) ? parsed.partnerTokens : base.partnerTokens,
    publishedEvents: (Array.isArray(parsed.publishedEvents) ? parsed.publishedEvents : []).map((e) => ({
      ...e,
      visibility: (e.visibility as string) === 'black_loop' ? 'prime' : e.visibility,
    })),
    publishedLocations: (Array.isArray(parsed.publishedLocations) ? parsed.publishedLocations : []).map((l) => ({
      ...l,
      visibility: (l.visibility as string | undefined) === 'black_loop' ? 'prime' : l.visibility,
    })),
    primeInvitations: (Array.isArray(parsed.primeInvitations)
      ? parsed.primeInvitations
      : Array.isArray((parsed as { vipInvitations?: PrimeInvitation[] }).vipInvitations)
        ? (parsed as { vipInvitations: PrimeInvitation[] }).vipInvitations
        : base.primeInvitations).map((inv) => ({
      ...inv,
      subscriptionStatus: inv.subscriptionStatus ?? 'none',
      subscriptionExpiresAt: inv.subscriptionExpiresAt ?? null,
      activatedAt: inv.activatedAt ?? null,
      activatedUserId: inv.activatedUserId ?? null,
    })),
    platformCategories: Array.isArray(parsed.platformCategories) && parsed.platformCategories.length > 0
      ? parsed.platformCategories
      : base.platformCategories,
    managedUsers: (Array.isArray(parsed.managedUsers) && parsed.managedUsers.length > 0
      ? parsed.managedUsers
      : base.managedUsers).map((u) => ({
      ...u,
      role: u.role === 'BLACK_LOOP' as UserRole ? 'USER_PRIME' : u.role,
    })),
  };
}

export function loadAdminStore(): AdminStore {
  try {
    const raw = localStorage.getItem(ADMIN_STORE_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw) as Partial<AdminStore>;
    return normalizeStore(parsed);
  } catch {
    return defaultStore();
  }
}

export function saveAdminStore(store: AdminStore): void {
  localStorage.setItem(ADMIN_STORE_KEY, JSON.stringify(store));
  window.dispatchEvent(new Event('loop-admin-store-changed'));
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function getActiveHeroBanners(store: AdminStore = loadAdminStore()): HeroBanner[] {
  return store.heroBanners.filter((b) => b.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getApprovedPublicEvents(store: AdminStore = loadAdminStore()): Event[] {
  return store.publishedEvents.filter((e) => e.status === 'published' && e.visibility === 'public');
}

export function getApprovedPublicLocations(store: AdminStore = loadAdminStore()): HomeLocation[] {
  return store.publishedLocations;
}

export function findActiveToken(code: string, store: AdminStore = loadAdminStore()): PartnerToken | undefined {
  const normalized = code.trim().toUpperCase();
  return store.partnerTokens.find(
    (t) => t.tokenCode === normalized && t.status === 'active' && new Date(t.expiresAt) > new Date(),
  );
}

export function submitPartnershipApplication(
  data: Omit<AdminPartnershipApplication, 'id' | 'status' | 'submittedAt' | 'reviewedAt' | 'generatedTokenCode' | 'rejectionReason'>,
): AdminPartnershipApplication {
  const store = loadAdminStore();
  const application: AdminPartnershipApplication = {
    ...data,
    id: createId('app'),
    status: 'pending',
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    generatedTokenCode: null,
    rejectionReason: null,
  };
  store.applications = [application, ...store.applications];
  saveAdminStore(store);
  return application;
}

export function enqueueStagingEvent(
  data: Omit<StagingEventItem, 'id' | 'status' | 'rejectionReason' | 'createdAt' | 'updatedAt'>,
): StagingEventItem {
  const store = loadAdminStore();
  const now = new Date().toISOString();
  const item: StagingEventItem = {
    ...data,
    id: createId('stg-evt'),
    status: 'pending',
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
  };
  store.stagingEvents = [item, ...store.stagingEvents];
  saveAdminStore(store);
  return item;
}

export function enqueueStagingLocation(
  data: Omit<StagingLocationItem, 'id' | 'status' | 'rejectionReason' | 'createdAt' | 'updatedAt'>,
): StagingLocationItem {
  const store = loadAdminStore();
  const now = new Date().toISOString();
  const item: StagingLocationItem = {
    ...data,
    id: createId('stg-loc'),
    status: 'pending',
    rejectionReason: null,
    createdAt: now,
    updatedAt: now,
  };
  store.stagingLocations = [item, ...store.stagingLocations];
  saveAdminStore(store);
  return item;
}

export function approveStagingEvent(id: string): Event | null {
  const store = loadAdminStore();
  const item = store.stagingEvents.find((e) => e.id === id && e.status === 'pending');
  if (!item) return null;

  const event: Event = {
    id: createId('pub-evt'),
    title: item.title,
    slug: `${slugify(item.title)}-${Date.now().toString(36)}`,
    description: item.description,
    program: item.program,
    category: item.category,
    visibility: 'public',
    status: 'published',
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    venueName: item.venueName,
    venueAddress: item.venueAddress,
    locationId: null,
    entryPrice: item.entryPrice,
    currency: item.currency,
    coverImageUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80',
    speakers: item.speakers
      ? item.speakers.split(',').map((name, index) => ({
          id: `sp-${index}`,
          name: name.trim(),
          title: null,
          company: null,
          photoUrl: null,
        }))
      : [],
    partnerId: item.partnerId,
    clickCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.stagingEvents = store.stagingEvents.map((e) =>
    e.id === id ? { ...e, status: 'approved' as const } : e,
  );
  store.publishedEvents = [event, ...store.publishedEvents];
  saveAdminStore(store);
  return event;
}

export function rejectStagingEvent(id: string, reason: string): void {
  const store = loadAdminStore();
  const now = new Date().toISOString();
  store.stagingEvents = store.stagingEvents.map((e) =>
    e.id === id ? { ...e, status: 'rejected' as const, rejectionReason: reason.trim(), updatedAt: now } : e,
  );
  saveAdminStore(store);
}

export function approveStagingLocation(id: string): HomeLocation | null {
  const store = loadAdminStore();
  const item = store.stagingLocations.find((l) => l.id === id && l.status === 'pending');
  if (!item) return null;

  const location: HomeLocation = {
    id: createId('pub-loc'),
    name: item.name,
    slug: `${slugify(item.name)}-${Date.now().toString(36)}`,
    description: `Adresse partenaire validée — ${item.partnerName}.`,
    subCategory: 'fine_dining',
    address: `${item.address}, ${item.city}`,
    phone: null,
    website: null,
    coverImageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=80',
    isVip: true,
    clickCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    district: item.city.toUpperCase(),
    rating: 4.5,
    subtitle: item.partnerName,
    tags: [{ emoji: '✨', label: 'Nouveau' }],
    galleryImages: ['https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&q=80'],
    openingHours: 'Sur réservation',
    priceLabel: 'Sur devis',
    favoriteCount: 0,
  };

  store.stagingLocations = store.stagingLocations.map((l) =>
    l.id === id ? { ...l, status: 'approved' as const } : l,
  );
  store.publishedLocations = [location, ...store.publishedLocations];
  saveAdminStore(store);
  return location;
}

export function rejectStagingLocation(id: string, reason: string): void {
  const store = loadAdminStore();
  const now = new Date().toISOString();
  store.stagingLocations = store.stagingLocations.map((l) =>
    l.id === id ? { ...l, status: 'rejected' as const, rejectionReason: reason.trim(), updatedAt: now } : l,
  );
  saveAdminStore(store);
}

export function approvePartnershipApplication(id: string, tokenCode: string, expiresAt: string): PartnerToken | null {
  const store = loadAdminStore();
  const app = store.applications.find((a) => a.id === id && a.status === 'pending');
  if (!app) return null;

  const token: PartnerToken = {
    id: createId('tok'),
    partnerName: app.companyName,
    tokenCode: tokenCode.toUpperCase(),
    expiresAt,
    status: 'active',
    createdBy: 'admin-demo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  store.partnerTokens = [token, ...store.partnerTokens];
  store.applications = store.applications.map((a) =>
    a.id === id
      ? {
          ...a,
          status: 'approved' as const,
          reviewedAt: new Date().toISOString(),
          generatedTokenCode: token.tokenCode,
        }
      : a,
  );
  saveAdminStore(store);
  return token;
}

export function rejectPartnershipApplication(id: string, reason: string): void {
  const store = loadAdminStore();
  store.applications = store.applications.map((a) =>
    a.id === id
      ? {
          ...a,
          status: 'rejected' as const,
          reviewedAt: new Date().toISOString(),
          rejectionReason: reason.trim(),
        }
      : a,
  );
  saveAdminStore(store);
}

export function createPartnerToken(partnerName: string, expiresAt: string): PartnerToken {
  const store = loadAdminStore();
  const token: PartnerToken = {
    id: createId('tok'),
    partnerName,
    tokenCode: generatePartnerTokenCode(),
    expiresAt,
    status: 'active',
    createdBy: 'admin-demo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.partnerTokens = [token, ...store.partnerTokens];
  saveAdminStore(store);
  return token;
}

export function createDirectPartner(input: AdminDirectPartnerInput): PartnerToken {
  const token = createPartnerToken(input.companyName, new Date(new Date().getFullYear(), 11, 31).toISOString());
  const store = loadAdminStore();
  store.applications = [
    {
      id: createId('app'),
      companyName: input.companyName,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      activityType: input.activityType,
      message: 'Création directe par administrateur.',
      status: 'approved',
      submittedAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      generatedTokenCode: token.tokenCode,
      rejectionReason: null,
    },
    ...store.applications,
  ];
  saveAdminStore(store);
  return token;
}

export function updateStagingEvent(
  id: string,
  data: Partial<Omit<StagingEventItem, 'id' | 'partnerId' | 'partnerName' | 'createdAt'>>,
): StagingEventItem | null {
  const store = loadAdminStore();
  let updated: StagingEventItem | null = null;
  store.stagingEvents = store.stagingEvents.map((item) => {
    if (item.id !== id || item.status === 'approved') return item;
    updated = { ...item, ...data, updatedAt: new Date().toISOString() };
    return updated;
  });
  if (!updated) return null;
  saveAdminStore(store);
  return updated;
}

export function updateStagingLocation(
  id: string,
  data: Partial<Omit<StagingLocationItem, 'id' | 'partnerId' | 'partnerName' | 'createdAt'>>,
): StagingLocationItem | null {
  const store = loadAdminStore();
  let updated: StagingLocationItem | null = null;
  store.stagingLocations = store.stagingLocations.map((item) => {
    if (item.id !== id || item.status === 'approved') return item;
    updated = { ...item, ...data, updatedAt: new Date().toISOString() };
    return updated;
  });
  if (!updated) return null;
  saveAdminStore(store);
  return updated;
}

export function resubmitStagingEvent(
  id: string,
  data: Partial<Omit<StagingEventItem, 'id' | 'partnerId' | 'partnerName' | 'createdAt'>>,
): StagingEventItem | null {
  return updateStagingEvent(id, { ...data, status: 'pending', rejectionReason: null });
}

export function resubmitStagingLocation(
  id: string,
  data: Partial<Omit<StagingLocationItem, 'id' | 'partnerId' | 'partnerName' | 'createdAt'>>,
): StagingLocationItem | null {
  return updateStagingLocation(id, { ...data, status: 'pending', rejectionReason: null });
}

export function getPartnerStagingItems(partnerId: string) {
  const store = loadAdminStore();
  return {
    events: store.stagingEvents.filter((item) => item.partnerId === partnerId),
    locations: store.stagingLocations.filter((item) => item.partnerId === partnerId),
  };
}

export function deleteStagingEvent(id: string): boolean {
  const store = loadAdminStore();
  const item = store.stagingEvents.find((e) => e.id === id);
  if (!item || item.status === 'approved') return false;
  store.stagingEvents = store.stagingEvents.filter((e) => e.id !== id);
  saveAdminStore(store);
  return true;
}

export function deleteStagingLocation(id: string): boolean {
  const store = loadAdminStore();
  const item = store.stagingLocations.find((l) => l.id === id);
  if (!item || item.status === 'approved') return false;
  store.stagingLocations = store.stagingLocations.filter((l) => l.id !== id);
  saveAdminStore(store);
  return true;
}

export function getPlatformCategories(): PlatformCategory[] {
  return loadAdminStore().platformCategories;
}

export function createPlatformCategory(
  data: Pick<PlatformCategory, 'label' | 'emoji' | 'eventCategory'>,
): PlatformCategory {
  const store = loadAdminStore();
  const now = new Date().toISOString();
  const category: PlatformCategory = {
    id: createId('pcat'),
    ...data,
    updatedAt: now,
  };
  store.platformCategories = [...store.platformCategories, category];
  saveAdminStore(store);
  return category;
}

export function updatePlatformCategory(
  id: string,
  data: Partial<Pick<PlatformCategory, 'label' | 'emoji' | 'eventCategory'>>,
): PlatformCategory | null {
  const store = loadAdminStore();
  let updated: PlatformCategory | null = null;
  store.platformCategories = store.platformCategories.map((cat) => {
    if (cat.id !== id) return cat;
    updated = { ...cat, ...data, updatedAt: new Date().toISOString() };
    return updated;
  });
  if (!updated) return null;
  saveAdminStore(store);
  return updated;
}

export function deletePlatformCategory(id: string): boolean {
  const store = loadAdminStore();
  if (store.platformCategories.length <= 1) return false;
  store.platformCategories = store.platformCategories.filter((c) => c.id !== id);
  saveAdminStore(store);
  return true;
}

export function updateManagedUser(
  id: string,
  data: Partial<Pick<ManagedUser, 'fullName' | 'email' | 'role' | 'status' | 'company'>>,
): ManagedUser | null {
  const store = loadAdminStore();
  let updated: ManagedUser | null = null;
  store.managedUsers = store.managedUsers.map((user) => {
    if (user.id !== id) return user;
    updated = { ...user, ...data, updatedAt: new Date().toISOString() };
    return updated;
  });
  if (!updated) return null;
  saveAdminStore(store);
  return updated;
}

export function addHeroBannerRef(targetType: HeroBanner['targetType'], targetId: string): HeroBanner | null {
  const store = loadAdminStore();
  if (store.heroBanners.some((banner) => banner.targetType === targetType && banner.targetId === targetId)) {
    return null;
  }
  const now = new Date().toISOString();
  const banner: HeroBanner = {
    id: createId('hb'),
    targetType,
    targetId,
    sortOrder: store.heroBanners.length,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  store.heroBanners = [...store.heroBanners, banner];
  saveAdminStore(store);
  return banner;
}

export function removeHeroBanner(id: string): void {
  const store = loadAdminStore();
  store.heroBanners = store.heroBanners.filter((banner) => banner.id !== id);
  saveAdminStore(store);
}

export function generatePrimeInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `INVIT-${code}-${new Date().getFullYear()}`;
}

export function findPrimeInvitation(token: string, store: AdminStore = loadAdminStore()): PrimeInvitation | undefined {
  const normalized = token.trim().toUpperCase();
  return store.primeInvitations.find((inv) => inv.tokenCode === normalized);
}

export function findPendingPrimeInvitation(token: string): PrimeInvitation | undefined {
  const inv = findPrimeInvitation(token);
  if (!inv || inv.status !== 'pending') return undefined;
  return inv;
}

export function createPrimeInvitation(
  memberName: string,
  email: string | null = null,
  initialMonths = 1,
): PrimeInvitation {
  const store = loadAdminStore();
  const now = new Date().toISOString();
  const plannedExpiry = new Date();
  plannedExpiry.setMonth(plannedExpiry.getMonth() + initialMonths);
  const invitation: PrimeInvitation = {
    id: createId('prime'),
    tokenCode: generatePrimeInviteCode(),
    memberName,
    email,
    status: 'pending',
    subscriptionStatus: 'none',
    subscriptionExpiresAt: plannedExpiry.toISOString(),
    activatedAt: null,
    activatedUserId: null,
    createdAt: now,
    updatedAt: now,
  };
  store.primeInvitations = [invitation, ...store.primeInvitations];
  saveAdminStore(store);
  return invitation;
}

export function activatePrimeInvitation(
  tokenCode: string,
  userId: string,
  expiresAt: string,
): PrimeInvitation | null {
  const store = loadAdminStore();
  const now = new Date().toISOString();
  let updated: PrimeInvitation | null = null;
  store.primeInvitations = store.primeInvitations.map((inv) => {
    if (inv.tokenCode !== tokenCode.toUpperCase()) return inv;
    updated = {
      ...inv,
      status: 'activated',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: expiresAt,
      activatedAt: now,
      activatedUserId: userId,
      updatedAt: now,
    };
    return updated;
  });
  if (!updated) return null;
  saveAdminStore(store);
  return updated;
}

export function extendPrimeSubscription(id: string, years = 1): PrimeInvitation | null {
  const store = loadAdminStore();
  let updated: PrimeInvitation | null = null;
  store.primeInvitations = store.primeInvitations.map((inv) => {
    if (inv.id !== id) return inv;
    const base = inv.subscriptionExpiresAt ? new Date(inv.subscriptionExpiresAt) : new Date();
    base.setFullYear(base.getFullYear() + years);
    updated = {
      ...inv,
      subscriptionStatus: 'active',
      status: 'activated',
      subscriptionExpiresAt: base.toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  if (!updated) return null;
  saveAdminStore(store);
  return updated;
}

export function suspendPrimeSubscription(id: string): PrimeInvitation | null {
  const store = loadAdminStore();
  let updated: PrimeInvitation | null = null;
  store.primeInvitations = store.primeInvitations.map((inv) => {
    if (inv.id !== id) return inv;
    updated = {
      ...inv,
      subscriptionStatus: 'suspended',
      status: 'suspended',
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  if (!updated) return null;
  saveAdminStore(store);
  return updated;
}

export function reactivatePrimeSubscription(id: string): PrimeInvitation | null {
  const store = loadAdminStore();
  let updated: PrimeInvitation | null = null;
  store.primeInvitations = store.primeInvitations.map((inv) => {
    if (inv.id !== id) return inv;
    updated = {
      ...inv,
      subscriptionStatus: 'active',
      status: inv.activatedAt ? 'activated' : 'pending',
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  if (!updated) return null;
  saveAdminStore(store);
  return updated;
}

export function updatePrimeInvitation(
  id: string,
  data: Pick<PrimeInvitation, 'memberName'> & Partial<Pick<PrimeInvitation, 'email'>>,
): PrimeInvitation | null {
  const store = loadAdminStore();
  let updated: PrimeInvitation | null = null;
  store.primeInvitations = store.primeInvitations.map((inv) => {
    if (inv.id !== id) return inv;
    updated = {
      ...inv,
      ...data,
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  if (!updated) return null;
  saveAdminStore(store);
  return updated;
}

export function setPrimeExpiration(id: string, expiresAt: string): PrimeInvitation | null {
  const store = loadAdminStore();
  let updated: PrimeInvitation | null = null;
  store.primeInvitations = store.primeInvitations.map((inv) => {
    if (inv.id !== id) return inv;
    updated = {
      ...inv,
      subscriptionExpiresAt: expiresAt,
      subscriptionStatus: 'active',
      status: inv.activatedAt ? 'activated' : inv.status,
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  if (!updated) return null;
  saveAdminStore(store);
  return updated;
}

export function extendPrimeSubscriptionMonths(id: string, months = 1): PrimeInvitation | null {
  const store = loadAdminStore();
  let updated: PrimeInvitation | null = null;
  store.primeInvitations = store.primeInvitations.map((inv) => {
    if (inv.id !== id) return inv;
    const base = inv.subscriptionExpiresAt ? new Date(inv.subscriptionExpiresAt) : new Date();
    base.setMonth(base.getMonth() + months);
    updated = {
      ...inv,
      subscriptionStatus: 'active',
      status: inv.activatedAt ? 'activated' : inv.status,
      subscriptionExpiresAt: base.toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return updated;
  });
  if (!updated) return null;
  saveAdminStore(store);
  return updated;
}

export function getPrimeActivationUrl(tokenCode: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/exclusif/activation?token=${tokenCode}`;
  }
  return `/exclusif/activation?token=${tokenCode}`;
}

export function getPrimeQrCodeUrl(tokenCode: string): string {
  const link = encodeURIComponent(getPrimeActivationUrl(tokenCode));
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${link}`;
}
