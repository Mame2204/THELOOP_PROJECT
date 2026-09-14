import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@/types';

const KEY = 'loop_partner_spot_session_v1';

export interface PartnerSpotSession {
  user: User;
  tokenCode: string;
  expiresAt: string;
}

export async function savePartnerSpotSession(session: PartnerSpotSession): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(session));
}

export async function loadPartnerSpotSession(): Promise<PartnerSpotSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PartnerSpotSession;
    if (!parsed?.user?.id || !parsed.expiresAt) return null;
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      await clearPartnerSpotSession();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPartnerSpotSession(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
