import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeEmail } from '@/lib/email-auth';
import { notifyAdminUsers } from '@/lib/user-notifications-store';

const KEY = 'loop_password_resets_v1';
const RESET_TTL_MS = 30 * 60 * 1000;

export interface PendingPasswordReset {
  email: string;
  requestedAt: string;
  requestedByAdminId: string | null;
  sentAt: string;
}

async function loadAll(): Promise<PendingPasswordReset[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingPasswordReset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAll(items: PendingPasswordReset[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

function isExpired(item: PendingPasswordReset): boolean {
  return Date.now() - new Date(item.sentAt).getTime() > RESET_TTL_MS;
}

export async function initiatePasswordReset(
  email: string,
  adminId: string | null,
): Promise<PendingPasswordReset> {
  const normalized = normalizeEmail(email);
  const now = new Date().toISOString();
  const item: PendingPasswordReset = {
    email: normalized,
    requestedAt: now,
    requestedByAdminId: adminId,
    sentAt: now,
  };
  const items = (await loadAll()).filter((r) => r.email !== normalized);
  items.unshift(item);
  await saveAll(items);

  const who = adminId ? 'un administrateur' : 'le membre';
  await notifyAdminUsers({
    title: 'Demande réinitialisation mot de passe',
    message: `${who} a demandé une réinitialisation pour ${normalized}.`,
  });

  return item;
}

export async function findPendingPasswordReset(email: string): Promise<PendingPasswordReset | null> {
  const normalized = normalizeEmail(email);
  const item = (await loadAll()).find((r) => r.email === normalized) ?? null;
  if (!item || isExpired(item)) return null;
  return item;
}

export async function consumePasswordReset(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const items = await loadAll();
  const next = items.filter((r) => r.email !== normalized);
  if (next.length === items.length) return false;
  await saveAll(next);
  return true;
}
