import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@/types';

import { DEFAULT_COUNTRY_CODE, inferCountryCodeFromPhone } from '@/lib/countries';

export const DEMO_SESSION_KEY = 'loop_demo_session';
export const DEMO_FAVORITES_KEY = 'loop_demo_favorites';

export interface DemoFavorites {
  events: string[];
  locations: string[];
}

export async function loadDemoSession(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(DEMO_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export async function saveDemoSession(user: User): Promise<void> {
  await AsyncStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(user));
}

export async function clearDemoSession(): Promise<void> {
  await AsyncStorage.removeItem(DEMO_SESSION_KEY);
}

export async function loadDemoFavorites(userId: string): Promise<DemoFavorites> {
  try {
    const raw = await AsyncStorage.getItem(`${DEMO_FAVORITES_KEY}_${userId}`);
    if (!raw) return { events: [], locations: [] };
    return JSON.parse(raw) as DemoFavorites;
  } catch {
    return { events: [], locations: [] };
  }
}

export async function saveDemoFavorites(userId: string, favorites: DemoFavorites): Promise<void> {
  await AsyncStorage.setItem(`${DEMO_FAVORITES_KEY}_${userId}`, JSON.stringify(favorites));
}

/** Session locale hors-ligne — membre gratuit uniquement, sans profil preset. */
export function createDemoUser(
  email: string,
  firstName: string,
  lastName: string,
  phoneNumber: string,
  birthDate?: string | null,
): User {
  const first = firstName.trim();
  const last = lastName.trim();
  const now = new Date().toISOString();
  return {
    id: `demo-${Date.now()}`,
    email,
    firstName: first || null,
    lastName: last || null,
    fullName: `${first} ${last}`.trim() || email.split('@')[0],
    phoneNumber: phoneNumber.trim() || null,
    birthDate: birthDate?.trim() || null,
    userRole: 'member',
    qrCodeToken: `demo-qr-${Date.now()}`,
    avatarUrl: null,
    role: 'USER_FREE',
    company: null,
    jobTitle: null,
    sector: null,
    isDirectoryOptIn: false,
    countryCode: inferCountryCodeFromPhone(phoneNumber) ?? DEFAULT_COUNTRY_CODE,
    createdAt: now,
    updatedAt: now,
  };
}
