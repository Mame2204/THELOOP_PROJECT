import type { User } from '@/types';
import { DEFAULT_COUNTRY_CODE, inferCountryCodeFromPhone } from '@/lib/countries';

export const DEMO_SESSION_KEY = 'loop_demo_session';
export const DEMO_FAVORITES_KEY = 'loop_demo_favorites';

export const DEMO_FREE_USER: User = {
  id: 'demo-free-user',
  email: 'membre@theloop.gn',
  firstName: 'Aïssata',
  lastName: 'Camara',
  fullName: 'Aïssata Camara',
  phoneNumber: '+224 622 11 22 33',
  userRole: 'member',
  qrCodeToken: 'demo-qr-free-2026',
  avatarUrl: null,
  role: 'USER_FREE',
  company: null,
  jobTitle: null,
  sector: null,
  isDirectoryOptIn: false,
  countryCode: DEFAULT_COUNTRY_CODE,
  createdAt: '2026-01-15T00:00:00+00:00',
  updatedAt: '2026-01-15T00:00:00+00:00',
};

export const DEMO_PARTNER_USER: User = {
  id: 'partner-demo',
  email: 'contact@lavenue.gn',
  firstName: "L'Avenue",
  lastName: 'Direction',
  fullName: 'L\'Avenue — Direction',
  phoneNumber: '+224 622 44 55 66',
  userRole: 'partner',
  qrCodeToken: 'demo-qr-partner-2026',
  avatarUrl: null,
  role: 'PARTNER',
  company: 'L\'Avenue',
  jobTitle: 'Directrice',
  sector: 'Restauration',
  isDirectoryOptIn: false,
  countryCode: DEFAULT_COUNTRY_CODE,
  createdAt: '2026-01-01T00:00:00+00:00',
  updatedAt: '2026-01-01T00:00:00+00:00',
};

export const DEMO_ADMIN_USER: User = {
  id: 'admin-demo',
  email: 'admin@theloop.gn',
  firstName: 'Admin',
  lastName: 'THE LOOP',
  fullName: 'Admin THE LOOP',
  phoneNumber: '+224 622 00 00 00',
  userRole: 'admin',
  qrCodeToken: 'demo-qr-admin-2026',
  avatarUrl: null,
  role: 'ADMIN',
  company: 'THE LOOP',
  jobTitle: 'Administrateur',
  sector: 'Plateforme',
  isDirectoryOptIn: false,
  subscriptionStatus: 'active',
  subscriptionExpiresAt: '2026-12-31T23:59:59+00:00',
  countryCode: DEFAULT_COUNTRY_CODE,
  createdAt: '2026-01-01T00:00:00+00:00',
  updatedAt: '2026-01-01T00:00:00+00:00',
};

export const DEMO_PRIME_USER: User = {
  id: 'prime-demo',
  email: 'prime@theloop.gn',
  firstName: 'Fatoumata',
  lastName: 'Bah',
  fullName: 'Fatoumata Bah',
  phoneNumber: '+224 622 00 00 01',
  userRole: 'prime',
  qrCodeToken: 'demo-qr-prime-2026',
  avatarUrl: null,
  role: 'USER_PRIME',
  company: 'Ecobank Guinée',
  jobTitle: 'Directrice Générale',
  sector: 'Corporate & Finance',
  isDirectoryOptIn: true,
  subscriptionStatus: 'active',
  subscriptionExpiresAt: '2027-06-01T23:59:59+00:00',
  primeInviteToken: 'INVIT-DEMO-2026',
  countryCode: DEFAULT_COUNTRY_CODE,
  createdAt: '2026-01-01T00:00:00+00:00',
  updatedAt: '2026-01-01T00:00:00+00:00',
};

function migrateLegacyRole(user: User): User {
  let next = user;
  if ((user.role as string) === 'BLACK_LOOP') {
    next = {
      ...user,
      role: 'USER_PRIME',
      userRole: user.userRole ?? 'prime',
      primeInviteToken: user.primeInviteToken ?? (user as { vipInviteToken?: string }).vipInviteToken ?? null,
    };
  }
  if (!next.countryCode) {
    next = {
      ...next,
      countryCode: inferCountryCodeFromPhone(next.phoneNumber) ?? DEFAULT_COUNTRY_CODE,
    };
  }
  return next;
}

export function loadDemoSession(): User | null {
  try {
    const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
    if (!raw) return null;
    return migrateLegacyRole(JSON.parse(raw) as User);
  } catch {
    return null;
  }
}

export function saveDemoSession(user: User): void {
  sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(user));
}

export function clearDemoSession(): void {
  sessionStorage.removeItem(DEMO_SESSION_KEY);
}

export function createDemoUser(
  email: string,
  firstName: string,
  lastName: string,
  phoneNumber: string,
): User {
  const first = firstName.trim();
  const last = lastName.trim();
  return {
    ...DEMO_FREE_USER,
    id: `demo-${Date.now()}`,
    email,
    firstName: first || null,
    lastName: last || null,
    fullName: `${first} ${last}`.trim() || email.split('@')[0],
    phoneNumber: phoneNumber.trim() || null,
    countryCode: inferCountryCodeFromPhone(phoneNumber),
    qrCodeToken: `demo-qr-${Date.now()}`,
  };
}

export interface DemoFavorites {
  events: string[];
  locations: string[];
}

export function loadDemoFavorites(userId: string): DemoFavorites {
  try {
    const raw = localStorage.getItem(`${DEMO_FAVORITES_KEY}_${userId}`);
    if (!raw) return { events: ['evt-1', 'evt-5'], locations: ['loc-1'] };
    return JSON.parse(raw) as DemoFavorites;
  } catch {
    return { events: [], locations: [] };
  }
}

export function saveDemoFavorites(userId: string, favorites: DemoFavorites): void {
  localStorage.setItem(`${DEMO_FAVORITES_KEY}_${userId}`, JSON.stringify(favorites));
}
