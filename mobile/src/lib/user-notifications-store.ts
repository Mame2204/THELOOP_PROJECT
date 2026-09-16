import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NotificationAudience } from '@/lib/notification-audience';
import { formatDateFr } from '@/lib/date-utils';
import { loadContentSnapshot } from '@/lib/content-store';
import { resolveCountryCode } from '@/lib/admin-country';
import { locationsMatch } from '@/lib/guinea-locations';
import { loadUserFavorites } from '@/lib/favorites-store';
import type { HomeLocation } from '@/lib/demo-data';
import { isToolLocation } from '@/lib/location-kind-utils';
import { listRegistryUsers, type RegistryUser } from '@/lib/user-registry-store';
import { normalizePhone } from '@/lib/otp-auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { resolveAuthUserPhone } from '@/lib/partner-auth-profile';
import type { Event, EventCategory, LocationSubCategory, UserRole } from '@/types';

export interface UserNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  audience: NotificationAudience;
  sentAt: string;
  readAt: string | null;
  recipientPhone?: string | null;
}

const KEY = 'loop_user_notifications_v1';
const DELETED_IDS_KEY = 'loop_deleted_notification_ids_v1';

function notificationBelongsToUser(
  notification: UserNotification,
  userId: string,
  phoneKey?: string | null,
): boolean {
  return (
    notification.userId === userId
    || Boolean(phoneKey && (notification.userId === `phone:${phoneKey}` || notification.recipientPhone === phoneKey))
  );
}

async function loadDeletedNotificationIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DELETED_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

async function markNotificationsDeleted(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const tombstone = await loadDeletedNotificationIds();
  for (const id of ids) tombstone.add(id);
  const capped = [...tombstone].slice(-500);
  await AsyncStorage.setItem(DELETED_IDS_KEY, JSON.stringify(capped));
}

function excludeDeletedNotifications(
  notifications: UserNotification[],
  deletedIds: Set<string>,
): UserNotification[] {
  if (!deletedIds.size) return notifications;
  return notifications.filter((n) => !deletedIds.has(n.id));
}
const NOTIFICATION_SELECT_FULL =
  'id, user_id, title, message, audience, sent_at, read_at, recipient_phone';
const NOTIFICATION_SELECT_LEGACY = 'id, user_id, title, message, sent_at, read_at';

/** Désactive la sync cloud si le schéma Supabase est incomplet (évite le spam de warnings). */
let remoteNotificationsEnabled: boolean | null = null;

function isNotificationsSchemaError(message: string): boolean {
  return /schema cache|does not exist|could not find the/i.test(message);
}

function isCampaignIdConstraintError(message: string): boolean {
  return /campaign_id/i.test(message);
}

function isRlsOrPermissionError(message: string): boolean {
  return /permission denied|row-level security|42501|policy|not authorized|non autoris/i.test(message);
}

function disableRemoteNotifications(reason: string): void {
  if (remoteNotificationsEnabled !== false) {
    console.warn('[Notifications] Sync cloud désactivée —', reason);
  }
  remoteNotificationsEnabled = false;
}

async function canUseRemoteNotifications(): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  if (remoteNotificationsEnabled === false) return false;
  if (remoteNotificationsEnabled === true) return true;

  const probe = await supabase.from('user_notifications').select('id, title, message').limit(1);
  if (probe.error && isNotificationsSchemaError(probe.error.message)) {
    disableRemoteNotifications(
      'exécutez supabase/migrations/20260818_user_notifications_schema_repair.sql',
    );
    return false;
  }
  remoteNotificationsEnabled = true;
  return true;
}

type NotificationInsertRow = {
  user_id: string | null;
  recipient_phone?: string | null;
  title: string;
  message: string;
  audience?: NotificationAudience;
  sent_at: string;
  campaign_id?: string | null;
};

function resolveCampaignIdForInsert(campaignId?: string | null): string | null {
  const trimmed = campaignId?.trim();
  return trimmed && /^[0-9a-f-]{36}$/i.test(trimmed) ? trimmed : null;
}

async function ensureNotificationAuthSession(): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const { ensurePartnerSupabaseSession } = await import('@/lib/partner-spot-auth');
  await ensurePartnerSupabaseSession();
}

async function insertNotificationsViaRpc(rows: NotificationInsertRow[]): Promise<boolean> {
  if (!supabase || rows.length === 0) return false;
  await ensureNotificationAuthSession();
  const { error } = await supabase.rpc('insert_user_notifications', { p_rows: rows });
  if (!error) return true;
  if (isNotificationsSchemaError(error.message)) {
    disableRemoteNotifications(
      'exécutez supabase/migrations/20260819_partner_catalog_active_notifications_campaign.sql',
    );
    return false;
  }
  console.warn('[Notifications] insert RPC:', error.message);
  return false;
}

async function notifyUserViaRpc(
  userId: string,
  input: { title: string; message: string; audience: NotificationAudience },
  recipientPhone?: string | null,
): Promise<string | null> {
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(userId)) return null;
  await ensureNotificationAuthSession();
  const { data, error } = await supabase.rpc('notify_user', {
    p_user_id: userId,
    p_title: input.title,
    p_message: input.message,
    p_audience: input.audience,
    p_recipient_phone: recipientPhone ?? null,
  });
  if (error) {
    if (isNotificationsSchemaError(error.message)) {
      disableRemoteNotifications(
        'exécutez supabase/migrations/20260838_notify_user_rpc.sql',
      );
    } else if (!isRlsOrPermissionError(error.message)) {
      console.warn('[Notifications] notify_user RPC:', error.message);
    }
    return null;
  }
  remoteNotificationsEnabled = true;
  return data ? String(data) : null;
}

async function resolveRemoteNotificationId(
  userId: string,
  input: { title: string; message: string },
  sentAt: string,
): Promise<string | null> {
  const remote = await selectUserNotificationsRemote(userId);
  const sentMs = new Date(sentAt).getTime();
  const match = remote.find(
    (n) =>
      n.title === input.title &&
      Math.abs(new Date(n.sentAt).getTime() - sentMs) < 10_000,
  );
  return match?.id ?? null;
}

async function resolveRecipientPhone(userId: string, phone?: string | null): Promise<string | null> {
  if (phone?.trim()) return normalizePhone(phone);
  if (/^[0-9a-f-]{36}$/i.test(userId)) {
    if (!isSupabaseConfigured() || !supabase) return null;
    const { data: authData } = await supabase.auth.getUser();
    if (authData.user?.id === userId) {
      const ownPhone = await resolveAuthUserPhone();
      if (ownPhone) return normalizePhone(ownPhone);
    }
    const { data } = await supabase
      .from('users')
      .select('phone_number')
      .eq('id', userId)
      .maybeSingle();
    const remotePhone = data?.phone_number ? String(data.phone_number).trim() : '';
    if (remotePhone) return normalizePhone(remotePhone);
  }
  return null;
}

async function persistNotificationRemote(
  userId: string,
  input: { title: string; message: string; audience: NotificationAudience },
  sentAt: string,
  recipientPhone?: string | null,
): Promise<string | null> {
  if (!(await canUseRemoteNotifications()) || !supabase) return null;

  if (/^[0-9a-f-]{36}$/i.test(userId)) {
    const viaNotify = await notifyUserViaRpc(userId, input, recipientPhone);
    if (viaNotify) return viaNotify;
  }

  const row: NotificationInsertRow = {
    user_id: /^[0-9a-f-]{36}$/i.test(userId) ? userId : null,
    recipient_phone: recipientPhone ?? null,
    title: input.title,
    message: input.message,
    audience: input.audience,
    sent_at: sentAt,
  };

  const { data, error } = await supabase
    .from('user_notifications')
    .insert({
      user_id: row.user_id,
      recipient_phone: row.recipient_phone,
      title: row.title,
      message: row.message,
      audience: row.audience,
      sent_at: row.sent_at,
    })
    .select('id')
    .single();

  if (!error && data?.id) return String(data.id);

  if (error) {
    if (isNotificationsSchemaError(error.message)) {
      disableRemoteNotifications(error.message);
      return null;
    }

    if (/audience|recipient_phone/i.test(error.message)) {
      const { data: legacyData, error: legacyError } = await supabase
        .from('user_notifications')
        .insert({
          user_id: row.user_id,
          title: row.title,
          message: row.message,
          sent_at: row.sent_at,
        })
        .select('id')
        .single();
      if (!legacyError && legacyData?.id) return String(legacyData.id);
      if (legacyError && isCampaignIdConstraintError(legacyError.message)) {
        const rpcOk = await insertNotificationsViaRpc([row]);
        if (rpcOk) return resolveRemoteNotificationId(userId, input, sentAt);
      }
    } else if (isCampaignIdConstraintError(error.message)) {
      const rpcOk = await insertNotificationsViaRpc([row]);
      if (rpcOk) return resolveRemoteNotificationId(userId, input, sentAt);
    }

    if (isRlsOrPermissionError(error.message)) {
      const viaNotify = await notifyUserViaRpc(userId, input, recipientPhone);
      if (viaNotify) return viaNotify;
      const rpcOk = await insertNotificationsViaRpc([row]);
      if (rpcOk) return resolveRemoteNotificationId(userId, input, sentAt);
    } else {
      console.warn('[Notifications] insert DB:', error.message);
    }
  }

  return null;
}

async function insertNotificationsRemote(rows: NotificationInsertRow[]): Promise<void> {
  if (rows.length === 0 || !(await canUseRemoteNotifications()) || !supabase) return;

  await ensureNotificationAuthSession();
  const { error } = await supabase.from('user_notifications').insert(rows);
  if (!error) return;

  if (isNotificationsSchemaError(error.message)) {
    disableRemoteNotifications(error.message);
    return;
  }

  if (/audience|recipient_phone/i.test(error.message)) {
    const legacy = rows.map((row) => ({
      user_id: row.user_id,
      title: row.title,
      message: row.message,
      sent_at: row.sent_at,
    }));
    const { error: legacyError } = await supabase.from('user_notifications').insert(legacy);
    if (!legacyError) return;
    if (isNotificationsSchemaError(legacyError.message)) {
      disableRemoteNotifications(legacyError.message);
      return;
    }
    if (isCampaignIdConstraintError(legacyError.message)) {
      await insertNotificationsViaRpc(rows);
      return;
    }
    console.warn('[Notifications] insert DB (legacy):', legacyError.message);
    return;
  }

  if (isCampaignIdConstraintError(error.message)) {
    await insertNotificationsViaRpc(rows);
    return;
  }

  if (isRlsOrPermissionError(error.message)) {
    await insertNotificationsViaRpc(rows);
    return;
  }

  console.warn('[Notifications] insert DB:', error.message);
}

function mapNotificationRow(
  row: Record<string, unknown>,
  fallbackUserId: string,
  fallbackPhone?: string | null,
): UserNotification {
  return {
    id: String(row.id),
    userId: row.user_id ? String(row.user_id) : fallbackUserId,
    title: String(row.title),
    message: String(row.message),
    audience: (row.audience as NotificationAudience) ?? 'individual',
    sentAt: String(row.sent_at),
    readAt: row.read_at ? String(row.read_at) : null,
    recipientPhone: row.recipient_phone
      ? String(row.recipient_phone)
      : fallbackPhone ?? null,
  };
}

async function selectUserNotificationsRemote(
  userId: string,
): Promise<UserNotification[]> {
  if (!(await canUseRemoteNotifications()) || !supabase) return [];

  const { ensurePartnerSupabaseSession } = await import('@/lib/partner-spot-auth');
  await ensurePartnerSupabaseSession();
  const { data: authData } = await supabase.auth.getUser();
  const queryUserId = authData.user?.id && /^[0-9a-f-]{36}$/i.test(authData.user.id)
    ? authData.user.id
    : userId;

  if (!/^[0-9a-f-]{36}$/i.test(queryUserId)) return [];

  const full = await supabase
    .from('user_notifications')
    .select(NOTIFICATION_SELECT_FULL)
    .eq('user_id', queryUserId)
    .order('sent_at', { ascending: false })
    .limit(100);

  if (!full.error && full.data) {
    return full.data.map((row) => mapNotificationRow(row as Record<string, unknown>, queryUserId));
  }

  if (full.error) {
    if (isNotificationsSchemaError(full.error.message)) {
      disableRemoteNotifications(full.error.message);
      return [];
    }
    if (/audience|recipient_phone/i.test(full.error.message)) {
      const legacy = await supabase
        .from('user_notifications')
        .select(NOTIFICATION_SELECT_LEGACY)
        .eq('user_id', queryUserId)
        .order('sent_at', { ascending: false })
        .limit(100);
      if (!legacy.error && legacy.data) {
        return legacy.data.map((row) => mapNotificationRow(row as Record<string, unknown>, queryUserId));
      }
      if (legacy.error && isNotificationsSchemaError(legacy.error.message)) {
        disableRemoteNotifications(legacy.error.message);
      }
      return [];
    }
    console.warn('[Notifications] select DB:', full.error.message);
  }
  return [];
}

async function loadAll(): Promise<UserNotification[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as UserNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAll(notifications: UserNotification[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(notifications));
  if (notifListMemory) {
    const sep = notifListMemory.key.indexOf('|');
    const userId = sep >= 0 ? notifListMemory.key.slice(0, sep) : notifListMemory.key;
    const phoneRaw = sep >= 0 ? notifListMemory.key.slice(sep + 1) : '';
    const phoneKey = phoneRaw || null;
    notifListMemory = {
      key: notifListMemory.key,
      at: Date.now(),
      items: notifications
        .filter((n) => notificationBelongsToUser(n, userId, phoneKey))
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    };
  }
  emitUserNotificationsChanged();
}

type NotificationListener = () => void;
const notificationListeners = new Set<NotificationListener>();

export function subscribeUserNotifications(listener: NotificationListener): () => void {
  notificationListeners.add(listener);
  return () => notificationListeners.delete(listener);
}

function emitUserNotificationsChanged(): void {
  for (const listener of notificationListeners) listener();
}

function notificationFingerprint(n: UserNotification): string {
  const phone = n.recipientPhone ? normalizePhone(n.recipientPhone) : '';
  return `${n.userId}|${phone}|${n.title}|${n.message}|${n.sentAt.slice(0, 19)}`;
}

function mergeNotifications(local: UserNotification[], remote: UserNotification[]): UserNotification[] {
  const byId = new Map<string, UserNotification>();
  const byFingerprint = new Map<string, UserNotification>();

  for (const n of remote) {
    byId.set(n.id, n);
    byFingerprint.set(notificationFingerprint(n), n);
  }
  for (const n of local) {
    const fingerprint = notificationFingerprint(n);
    if (byFingerprint.has(fingerprint)) continue;
    if (!byId.has(n.id)) {
      byId.set(n.id, n);
      byFingerprint.set(fingerprint, n);
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

/** Évite de re-télécharger la boîte à chaque focus / badge (egress). */
const NOTIF_LIST_TTL_MS = 90_000;
let notifListMemory: { key: string; at: number; items: UserNotification[] } | null = null;

function notifListCacheKey(userId: string, phoneKey: string | null): string {
  return `${userId}|${phoneKey ?? ''}`;
}

export async function listUserNotifications(
  userId: string,
  phone?: string | null,
  options?: { force?: boolean },
): Promise<UserNotification[]> {
  const phoneKey = phone
    ? normalizePhone(phone)
    : await resolveRecipientPhone(userId, null);
  const cacheKey = notifListCacheKey(userId, phoneKey);
  if (
    !options?.force &&
    notifListMemory &&
    notifListMemory.key === cacheKey &&
    Date.now() - notifListMemory.at < NOTIF_LIST_TTL_MS
  ) {
    return notifListMemory.items;
  }

  const deletedIds = await loadDeletedNotificationIds();

  if (isSupabaseConfigured() && supabase && (await canUseRemoteNotifications())) {
    let remote: UserNotification[] = excludeDeletedNotifications(
      await selectUserNotificationsRemote(userId),
      deletedIds,
    );
    if (phoneKey && remoteNotificationsEnabled !== false) {
      const { data: byPhone, error } = await supabase.rpc('list_notifications_for_phone', {
        p_phone: phoneKey,
      });
      if (!error && Array.isArray(byPhone)) {
        const phoneRows = byPhone.map((row: Record<string, unknown>) =>
          mapNotificationRow(row, row.user_id ? String(row.user_id) : `phone:${phoneKey}`, phoneKey),
        );
        remote = mergeNotifications(remote, phoneRows);
      } else {
        const { data, error: phoneError } = await supabase
          .from('user_notifications')
          .select(NOTIFICATION_SELECT_FULL)
          .eq('recipient_phone', phoneKey)
          .order('sent_at', { ascending: false })
          .limit(100);
        if (!phoneError && data) {
          const phoneRows = data.map((row) =>
            mapNotificationRow(row as Record<string, unknown>, `phone:${phoneKey}`, phoneKey),
          );
          remote = mergeNotifications(remote, phoneRows);
        }
      }
    }

    const all = await loadAll();
    const others = all.filter(
      (n) =>
        n.userId !== userId &&
        !(phoneKey && (n.userId === `phone:${phoneKey}` || n.recipientPhone === phoneKey)),
    );
    const localForUser = all.filter(
      (n) =>
        n.userId === userId ||
        (phoneKey && (n.userId === `phone:${phoneKey}` || n.recipientPhone === phoneKey)),
    );
    const merged = excludeDeletedNotifications(mergeNotifications(localForUser, remote), deletedIds);
    const sorted = merged.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
    // Persist sans emit : évite une boucle badge → list → emit → refresh force.
    await AsyncStorage.setItem(KEY, JSON.stringify([...others, ...merged]));
    notifListMemory = { key: cacheKey, at: Date.now(), items: sorted };
    return sorted;
  }

  const local = excludeDeletedNotifications(
    (await loadAll()).filter((n) => notificationBelongsToUser(n, userId, phoneKey)),
    deletedIds,
  );

  const sortedLocal = local.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  notifListMemory = { key: cacheKey, at: Date.now(), items: sortedLocal };
  return sortedLocal;
}

export async function countUnreadNotifications(
  userId: string,
  options?: { force?: boolean },
): Promise<number> {
  const list = await listUserNotifications(userId, undefined, options);
  return list.filter((n) => !n.readAt).length;
}

export async function markNotificationRead(
  notificationId: string,
  userId: string,
  phone?: string | null,
): Promise<void> {
  const readAt = new Date().toISOString();
  const phoneKey = phone ? normalizePhone(phone) : null;

  if (isSupabaseConfigured() && supabase && isRemoteNotificationId(notificationId)) {
    const { ensurePartnerSupabaseSession } = await import('@/lib/partner-spot-auth');
    await ensurePartnerSupabaseSession();
    const { data: authData } = await supabase.auth.getUser();
    const authUserId = authData.user?.id ?? userId;
    await supabase
      .from('user_notifications')
      .update({ read_at: readAt })
      .eq('id', notificationId)
      .eq('user_id', authUserId);
  }

  const all = await loadAll();
  const idx = all.findIndex(
    (n) => n.id === notificationId && notificationBelongsToUser(n, userId, phoneKey),
  );
  if (idx < 0) return;
  all[idx] = { ...all[idx], readAt };
  await saveAll(all);
}

function isRemoteNotificationId(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

async function deleteRemoteNotifications(
  userId: string,
  ids: string[],
  phone?: string | null,
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return true;
  const remoteIds = ids.filter(isRemoteNotificationId);
  if (!remoteIds.length) return true;

  const { ensurePartnerSupabaseSession } = await import('@/lib/partner-spot-auth');
  await ensurePartnerSupabaseSession();

  const { data: authData } = await supabase.auth.getUser();
  const authUserId = authData.user?.id ?? userId;

  const { error } = await supabase
    .from('user_notifications')
    .delete()
    .in('id', remoteIds)
    .eq('user_id', authUserId);

  if (!error) return true;

  const phoneKey = phone ? normalizePhone(phone) : null;
  if (phoneKey) {
    const { error: phoneError } = await supabase
      .from('user_notifications')
      .delete()
      .in('id', remoteIds)
      .eq('recipient_phone', phoneKey);
    if (!phoneError) return true;
  }

  if (isRlsOrPermissionError(error.message)) {
    console.warn('[Notifications] suppression distante refusée (RLS/session):', error.message);
  } else {
    console.warn('[Notifications] suppression distante:', error.message);
  }
  return false;
}

export async function deleteUserNotification(
  notificationId: string,
  userId: string,
  phone?: string | null,
): Promise<void> {
  await markNotificationsDeleted([notificationId]);
  await deleteRemoteNotifications(userId, [notificationId], phone);
  const phoneKey = phone ? normalizePhone(phone) : null;
  const all = await loadAll();
  await saveAll(all.filter((n) => !(n.id === notificationId && notificationBelongsToUser(n, userId, phoneKey))));
}

export async function deleteUserNotifications(
  notificationIds: string[],
  userId: string,
  phone?: string | null,
): Promise<void> {
  if (!notificationIds.length) return;
  await markNotificationsDeleted(notificationIds);
  await deleteRemoteNotifications(userId, notificationIds, phone);
  const phoneKey = phone ? normalizePhone(phone) : null;
  const idSet = new Set(notificationIds);
  const all = await loadAll();
  await saveAll(
    all.filter((n) => !(notificationBelongsToUser(n, userId, phoneKey) && idSet.has(n.id))),
  );
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const now = new Date().toISOString();

  if (isSupabaseConfigured() && supabase) {
    await supabase
      .from('user_notifications')
      .update({ read_at: now })
      .eq('user_id', userId)
      .is('read_at', null);
  }

  const all = await loadAll();
  const updated = all.map((n) =>
    n.userId === userId && !n.readAt ? { ...n, readAt: now } : n,
  );
  await saveAll(updated);
}

/** Supprime toutes les notifications reçues par un utilisateur (boîte de réception). */
export async function clearUserNotifications(userId: string, phone?: string | null): Promise<void> {
  const phoneKey = phone ? normalizePhone(phone) : null;
  const all = await loadAll();
  const mine = all.filter((n) => notificationBelongsToUser(n, userId, phoneKey));
  await markNotificationsDeleted(mine.map((n) => n.id));
  await deleteRemoteNotifications(userId, mine.map((n) => n.id), phone);
  await saveAll(all.filter((n) => !notificationBelongsToUser(n, userId, phoneKey)));
}

export async function appendUserNotification(
  userId: string,
  input: { title: string; message: string; audience: NotificationAudience },
  options?: { recipientPhone?: string | null },
): Promise<UserNotification> {
  const sentAt = new Date().toISOString();
  let id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const recipientPhone = await resolveRecipientPhone(userId, options?.recipientPhone);

  const remoteId = await persistNotificationRemote(
    userId,
    input,
    sentAt,
    recipientPhone,
  );
  if (remoteId) id = remoteId;

  const all = await loadAll();
  const entry: UserNotification = {
    id,
    userId,
    title: input.title,
    message: input.message,
    audience: input.audience,
    sentAt,
    readAt: null,
    recipientPhone,
  };
  const withoutDup = all.filter((n) => n.id !== id);
  withoutDup.unshift(entry);
  await saveAll(withoutDup);

  // Alerte OS (arrière-plan / app fermée) — en plus de l’inbox.
  if (/^[0-9a-f-]{36}$/i.test(userId)) {
    void import('@/lib/push-notifications').then(async (m) => {
      await m.requestExpoPushDelivery({
        userIds: [userId],
        title: input.title,
        body: input.message,
        data: { notificationId: id, audience: input.audience },
      });
      // Si c’est le compte connecté sur cet appareil : bannière OS aussi en premier plan.
      try {
        if (isSupabaseConfigured() && supabase) {
          const { data } = await supabase.auth.getUser();
          if (data.user?.id === userId) {
            await m.presentLocalOsNotification({
              title: input.title,
              body: input.message,
              data: { notificationId: id, audience: input.audience },
            });
          }
        }
      } catch {
        /* ignore */
      }
    });
  }

  return entry;
}

/** Notifie tous les comptes admin (RPC Supabase si dispo, sinon registre local). */
export async function notifyAdminUsers(input: {
  title: string;
  message: string;
  countryCode?: string;
}): Promise<void> {
  if (isSupabaseConfigured() && supabase) {
    const country = input.countryCode?.trim().toUpperCase().slice(0, 2) || null;
    const { error } = await supabase.rpc('admin_distribute_notifications', {
      p_title: input.title.trim(),
      p_message: input.message.trim(),
      p_audience: 'admin',
      p_country_code: country,
      p_campaign_id: null,
    });
    if (!error) return;
  }

  const users = await listRegistryUsers();
  const adminIds = new Set<string>(['admin-demo']);
  for (const u of users) {
    if (u.role === 'ADMIN' || u.userRole === 'admin' || u.userRole === 'super_admin') adminIds.add(u.id);
  }
  for (const id of adminIds) {
    await appendUserNotification(id, { title: input.title, message: input.message, audience: 'admin' });
  }
}

export async function sendWelcomeNotification(user: {
  id: string;
  firstName?: string | null;
  countryCode?: string | null;
}): Promise<void> {
  const name = user.firstName?.trim() || 'Membre';
  await appendUserNotification(user.id, {
    title: `Bienvenue ${name} !`,
    message:
      'Ton compte THE LOOP est actif. Découvre les événements, spots et outils près de toi. ' +
      'Tu peux à tout moment mettre à jour ton profil en cliquant sur le petit bonhomme en bas à droite.',
    audience: 'individual',
  });
}

/** Achat PASS (immédiat ou file d'attente). */
export async function sendPassPurchaseNotification(input: {
  userId: string;
  passLabel: string;
  firstName?: string | null;
  kind: 'activated' | 'queued';
  expiresAt?: string | null;
  scheduledStartAt?: string | null;
}): Promise<void> {
  const name = input.firstName?.trim() || 'Membre';
  const label = input.passLabel.trim() || 'PASS Loop Prime';
  if (input.kind === 'activated') {
    const validity = input.expiresAt
      ? `Valable jusqu'au ${formatDateFr(input.expiresAt)}.`
      : 'Sans expiration.';
    await appendUserNotification(input.userId, {
      title: `Achat confirmé — ${label}`,
      message: `Bonjour ${name}, votre ${label} est actif. ${validity}`,
      audience: 'individual',
    });
    return;
  }
  const start = input.scheduledStartAt
    ? `Il démarrera le ${formatDateFr(input.scheduledStartAt)}.`
    : 'Il démarrera à la fin de votre PASS actuel.';
  await appendUserNotification(input.userId, {
    title: `Achat confirmé — ${label}`,
    message: `Bonjour ${name}, votre ${label} est en file d'attente. ${start}`,
    audience: 'individual',
  });
}

/** Octroi PASS admin (héritage, invitation, etc.) — complète le template d'activation. */
export async function sendPassGrantNotification(input: {
  userId: string;
  passLabel: string;
  firstName?: string | null;
  grantNote?: string | null;
}): Promise<void> {
  const name = input.firstName?.trim() || 'Membre';
  const label = input.passLabel.trim() || 'PASS Loop Prime';
  const note = input.grantNote?.trim();
  await appendUserNotification(input.userId, {
    title: `PASS octroyé — ${label}`,
    message: note
      ? `Bonjour ${name}, ${label} vous a été accordé. ${note}`
      : `Bonjour ${name}, ${label} vous a été accordé. Profitez de tous les privilèges Loop Prime.`,
    audience: 'individual',
  });
}

/** Libellé lieu pour notification octroi — spot / événement / outil + localisation + enseigne. */
export function formatBenefitGrantPlaceLabel(input: {
  contentType?: 'event' | 'spot' | 'tool' | null;
  contentTitle?: string | null;
  displayContext?: string | null;
}): string | null {
  const context = input.displayContext?.trim();
  if (context) return context;
  const title = input.contentTitle?.trim();
  if (!title) return null;
  const kind =
    input.contentType === 'event'
      ? 'Événement'
      : input.contentType === 'tool'
        ? 'Outil'
        : input.contentType === 'spot'
          ? 'Spot'
          : null;
  return kind ? `${kind} · ${title}` : title;
}

/** Message notification octroi privilège catalogue. */
export function formatBenefitGrantMessage(input: {
  benefitTitle?: string | null;
  contentType?: 'event' | 'spot' | 'tool' | null;
  contentTitle?: string | null;
  displayContext?: string | null;
}): string {
  const title = input.benefitTitle?.trim() || 'Privilège';
  const place = formatBenefitGrantPlaceLabel(input);
  if (place) return `« ${title} » — ${place}.`;
  return `Vous avez reçu le privilège « ${title} ».`;
}

/** Octroi de privilège catalogue. */
export async function sendBenefitGrantNotification(input: {
  userId: string;
  benefitTitle: string;
  partnerName?: string | null;
  placeLabel?: string | null;
  displayContext?: string | null;
  contentType?: 'event' | 'spot' | 'tool' | null;
  contentTitle?: string | null;
}): Promise<void> {
  const message = formatBenefitGrantMessage({
    benefitTitle: input.benefitTitle,
    contentType: input.contentType,
    contentTitle: input.contentTitle ?? null,
    displayContext: input.displayContext ?? input.placeLabel ?? null,
  });
  await appendUserNotification(input.userId, {
    title: 'Nouveau privilège',
    message,
    audience: 'individual',
  });
}

/** Code parrainage utilisé par un nouveau membre. */
export async function sendReferralCodeUsedNotification(input: {
  referrerUserId: string;
  referredName?: string | null;
}): Promise<void> {
  const who = input.referredName?.trim() || 'Un nouveau membre';
  await appendUserNotification(input.referrerUserId, {
    title: 'Parrainage — nouveau filleul',
    message: `${who} s'est inscrit avec votre code parrainage. Merci de faire grandir THE LOOP !`,
    audience: 'individual',
  });
}

/** Récompense parrainage (mois Prime en attente ou appliqués). */
export async function sendReferralRewardNotification(input: {
  userId: string;
  months: number;
}): Promise<void> {
  const monthsLabel = input.months === 1 ? '1 mois' : `${input.months} mois`;
  await appendUserNotification(input.userId, {
    title: 'Récompense parrainage',
    message: `Bravo ! Vous avez gagné ${monthsLabel} de Loop Prime grâce à vos filleuls.`,
    audience: 'individual',
  });
}

/** Validation de privilège par un partenaire (scan / confirmation). */
export async function sendPartnerBenefitValidatedNotification(input: {
  memberUserId: string;
  benefitTitle: string;
  partnerName: string;
  placeLabel?: string | null;
  displayContext?: string | null;
}): Promise<void> {
  const place =
    input.displayContext?.trim() || input.placeLabel?.trim() || input.partnerName.trim() || 'le lieu concerné';
  await appendUserNotification(input.memberUserId, {
    title: 'Privilège validé',
    message: `Votre privilège « ${input.benefitTitle.trim()} » a été validé — ${place}.`,
    audience: 'individual',
  });
}

/** Annulation de validation par le partenaire — le privilège redevient utilisable. */
export async function sendPartnerBenefitCancelledNotification(input: {
  memberUserId: string;
  benefitTitle: string;
  partnerName: string;
  displayContext?: string | null;
}): Promise<void> {
  const place = input.displayContext?.trim() || input.partnerName.trim() || 'le partenaire';
  await appendUserNotification(input.memberUserId, {
    title: 'Validation annulée',
    message: `La validation de « ${input.benefitTitle.trim()} » chez ${place} a été annulée. Vous pouvez réutiliser le privilège.`,
    audience: 'individual',
  });
}

/** Demande de validation envoyée au partenaire (QR en attente). */
export async function sendBenefitValidationPendingNotification(input: {
  memberUserId: string;
  benefitTitle: string;
  partnerName: string;
  displayContext?: string | null;
  timeoutMinutes: number;
}): Promise<void> {
  const place = input.displayContext?.trim() || input.partnerName.trim() || 'le partenaire';
  await appendUserNotification(input.memberUserId, {
    title: 'En attente chez le partenaire',
    message: `Présentez votre QR à ${place} pour « ${input.benefitTitle.trim()} » (${input.timeoutMinutes} min max).`,
    audience: 'individual',
  });
}

function parseBirthMonthDay(birthDate: string): { month: number } | null {
  const iso = birthDate.trim().slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match) return { month: Number(match[2]) - 1 };
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;
  return { month: d.getMonth() };
}

function isBirthdayThisMonth(birthDate: string | null, date = new Date()): boolean {
  if (!birthDate) return false;
  const parts = parseBirthMonthDay(birthDate);
  if (!parts) return false;
  return parts.month === date.getMonth();
}

function isStaffAccount(user: RegistryUser): boolean {
  return (
    user.role === 'ADMIN' ||
    user.role === 'PARTNER' ||
    user.userRole === 'admin' ||
    user.userRole === 'super_admin' ||
    user.userRole === 'partner'
  );
}

function eventMatchesCategories(event: Event, categories: string[]): boolean {
  if (!categories.length) return false;
  const slugs = new Set([event.category, ...(event.categories ?? [])]);
  return categories.some((cat) => slugs.has(cat));
}

function spotMatchesCategories(location: HomeLocation, categories: string[]): boolean {
  if (!categories.length || isToolLocation(location)) return false;
  const slugs = new Set([location.subCategory, ...(location.categories ?? [])]);
  return categories.some((cat) => slugs.has(cat));
}

function toolMatchesCategories(location: HomeLocation, categories: string[]): boolean {
  if (!categories.length || !isToolLocation(location)) return false;
  const slugs = new Set(
    [...(location.categories ?? []), location.toolCategory].filter(Boolean) as string[],
  );
  return categories.some((cat) => slugs.has(cat));
}

function userFavoritesMatchCategories(
  fav: { events: string[]; locations: string[] },
  snapshot: Awaited<ReturnType<typeof loadContentSnapshot>>,
  eventCategories: string[],
  spotCategories: string[],
  toolCategories: string[],
): boolean {
  if (eventCategories.length) {
    const hasEvent = fav.events.some((id) => {
      const event = snapshot.events.find((e) => e.id === id);
      return event != null && eventMatchesCategories(event, eventCategories);
    });
    if (hasEvent) return true;
  }
  if (spotCategories.length) {
    const hasSpot = fav.locations.some((id) => {
      const location = snapshot.locations.find((l) => l.id === id);
      return location != null && spotMatchesCategories(location, spotCategories);
    });
    if (hasSpot) return true;
  }
  if (toolCategories.length) {
    const hasTool = fav.locations.some((id) => {
      const location = snapshot.locations.find((l) => l.id === id);
      return location != null && toolMatchesCategories(location, toolCategories);
    });
    if (hasTool) return true;
  }
  return false;
}

function parsePhones(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => normalizePhone(p))
    .filter(Boolean);
}

function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return normalizePhone(a) === normalizePhone(b);
}

function matchesAudience(
  role: UserRole,
  userRole: string | null,
  subscriptionStatus: string | undefined,
  birthDate: string | null,
  audience: NotificationAudience,
): boolean {
  switch (audience) {
    case 'all':
    case 'everyone':
      return role !== 'USER_ANONYMOUS';
    case 'guests_phone':
      return false;
    case 'members':
      return role === 'USER_FREE' || userRole === 'member';
    case 'prime':
      return role === 'USER_PRIME' || subscriptionStatus === 'active' || userRole === 'prime';
    case 'prime_members':
      return (
        role === 'USER_FREE' ||
        role === 'USER_PRIME' ||
        userRole === 'member' ||
        userRole === 'prime' ||
        subscriptionStatus === 'active'
      );
    case 'partner':
      return role === 'PARTNER' || userRole === 'partner';
    case 'admin':
      return role === 'ADMIN' || userRole === 'admin' || userRole === 'super_admin';
    case 'birthday':
      return isBirthdayThisMonth(birthDate);
    case 'favorites':
    case 'individual':
      return true;
    default:
      return false;
  }
}

async function usersWhoFavoritedCategories(
  eventCategories: EventCategory[],
  spotCategories: LocationSubCategory[],
  toolCategories: string[] = [],
): Promise<string[]> {
  const eventCategorySlugs = eventCategories.map(String);
  const spotCategorySlugs = spotCategories.map(String);
  const toolCategorySlugs = toolCategories.map(String);

  if (!eventCategorySlugs.length && !spotCategorySlugs.length && !toolCategorySlugs.length) {
    return [];
  }

  if (isSupabaseConfigured() && supabase) {
    await ensureNotificationAuthSession();
    const { data, error } = await supabase.rpc('admin_users_with_favorite_categories', {
      p_event_categories: eventCategorySlugs,
      p_spot_categories: spotCategorySlugs,
      p_tool_categories: toolCategorySlugs,
    });
    if (!error && Array.isArray(data)) {
      const ids = data
        .map((row) => {
          if (typeof row === 'string') return row;
          const record = row as Record<string, unknown>;
          return record.user_id ? String(record.user_id) : null;
        })
        .filter((id): id is string => Boolean(id));
      if (ids.length > 0) return ids;
    }
    if (error) {
      if (/function.*does not exist|schema cache/i.test(error.message)) {
        console.warn(
          '[Notifications] RPC admin_users_with_favorite_categories absente — exécutez supabase/migrations/20260854_admin_favorite_audience_rpc.sql',
        );
      } else {
        console.warn('[Notifications] admin_users_with_favorite_categories:', error.message);
      }
    }
  }

  const snapshot = await loadContentSnapshot();
  const userIds = new Set<string>();
  const users = await listRegistryUsers(true);

  for (const user of users) {
    if (isStaffAccount(user)) continue;
    const fav = await loadUserFavorites(user.id);
    if (
      userFavoritesMatchCategories(
        fav,
        snapshot,
        eventCategorySlugs,
        spotCategorySlugs,
        toolCategorySlugs,
      )
    ) {
      userIds.add(user.id);
    }
  }

  return Array.from(userIds).filter((id) => {
    const user = users.find((u) => u.id === id);
    return user != null && !isStaffAccount(user);
  });
}

/** Filtre une liste de membres selon leurs favoris par catégorie. */
export async function filterUsersMatchingFavoriteCategories(
  users: RegistryUser[],
  eventCategories: string[],
  spotCategories: string[],
  toolCategories: string[],
): Promise<RegistryUser[]> {
  if (!eventCategories.length && !spotCategories.length && !toolCategories.length) {
    return users;
  }
  const matchingIds = new Set(
    await usersWhoFavoritedCategories(
      eventCategories as EventCategory[],
      spotCategories as LocationSubCategory[],
      toolCategories,
    ),
  );
  return users.filter((u) => matchingIds.has(u.id));
}

export async function distributeNotification(input: {
  title: string;
  message: string;
  audience: NotificationAudience;
  targetPhone?: string | null;
  favoriteEventCategories?: EventCategory[];
  favoriteSpotCategories?: LocationSubCategory[];
  favoriteToolCategories?: string[];
  countryCode?: string;
  city?: string | null;
  /** UUID campagne admin_push_campaigns — renseigné lors d’un envoi campagne. */
  campaignId?: string | null;
}): Promise<number> {
  const title = input.title.trim();
  const message = input.message.trim();
  const campaignId = resolveCampaignIdForInsert(input.campaignId);

  // Diffusion serveur (tous types de campagnes rôle) — pas de limite registre client.
  const serverAudiences: NotificationAudience[] = [
    'all',
    'everyone',
    'members',
    'prime',
    'prime_members',
    'partner',
    'admin',
  ];
  if (
    serverAudiences.includes(input.audience) &&
    isSupabaseConfigured() &&
    supabase &&
    (await canUseRemoteNotifications())
  ) {
    await ensureNotificationAuthSession();
    const { data, error } = await supabase.rpc('admin_distribute_notifications', {
      p_title: title,
      p_message: message,
      p_audience: input.audience === 'all' ? 'everyone' : input.audience,
      p_country_code: input.countryCode ?? null,
      p_campaign_id: campaignId,
    });
    if (!error && Array.isArray(data)) {
      const pushUserIds = data
        .map((id) => String(id))
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      if (pushUserIds.length && title && message) {
        const { requestExpoPushDelivery } = await import('@/lib/push-notifications');
        const CHUNK = 200;
        for (let i = 0; i < pushUserIds.length; i += CHUNK) {
          void requestExpoPushDelivery({
            userIds: pushUserIds.slice(i, i + CHUNK),
            title,
            body: message,
            data: { audience: input.audience, ...(campaignId ? { campaignId } : {}) },
          });
        }
      }
      return pushUserIds.length;
    }
    if (error) {
      console.warn(
        '[Notifications] admin_distribute_notifications:',
        error.message,
        '— exécutez supabase/migrations/20260885_admin_distribute_notifications.sql',
      );
    }
  }

  const users = await listRegistryUsers(true);
  const countryCode = input.countryCode;
  const cityFilter = input.city?.trim() ? input.city.trim() : null;
  const inCountry = (u: (typeof users)[number]) => {
    if (!countryCode) return true;
    const resolved = resolveCountryCode(u.countryCode, u.phoneNumber);
    // Pas de pays connu → inclure quand même (évite d’exclure les membres mal renseignés).
    if (!resolved && !u.countryCode) return true;
    return resolved === countryCode;
  };
  const inCity = (u: (typeof users)[number]) => {
    if (!cityFilter) return true;
    return locationsMatch(u.city, cityFilter);
  };
  const sentAt = new Date().toISOString();
  const all = await loadAll();
  let recipients: typeof users = [];
  const guestPhones: string[] = [];

  if (input.audience === 'individual') {
    const phones = parsePhones(input.targetPhone);
    recipients = users.filter(
      (u) => u.phoneNumber && phones.some((p) => phonesMatch(u.phoneNumber, p)) && inCountry(u) && inCity(u),
    );
    // Pas d’envoi aux sans-compte en ciblage individuel manuel (uniquement comptes connus)
  } else if (input.audience === 'guests_phone') {
    const phones = parsePhones(input.targetPhone);
    if (phones.length) {
      guestPhones.push(...phones);
    } else {
      // Téléphones du registre sans rôle membre (identifiants seuls)
      for (const u of users) {
        if (!u.phoneNumber || !inCountry(u) || !inCity(u)) continue;
        if (u.role === 'USER_ANONYMOUS' || !u.email) guestPhones.push(u.phoneNumber);
      }
    }
  } else if (input.audience === 'favorites') {
    const favUserIds = await usersWhoFavoritedCategories(
      input.favoriteEventCategories ?? [],
      input.favoriteSpotCategories ?? [],
      input.favoriteToolCategories ?? [],
    );
    recipients = users.filter(
      (u) => favUserIds.includes(u.id) && inCountry(u) && inCity(u) && !isStaffAccount(u),
    );
  } else if (input.audience === 'birthday') {
    recipients = users.filter(
      (u) => isBirthdayThisMonth(u.birthDate) && inCountry(u) && inCity(u) && !isStaffAccount(u),
    );
  } else if (input.audience === 'everyone') {
    recipients = users.filter((u) => inCountry(u) && inCity(u) && u.role !== 'USER_ANONYMOUS');
  } else {
    recipients = users.filter((u) =>
      inCountry(u) &&
      inCity(u) &&
      matchesAudience(u.role, u.userRole, u.subscriptionStatus, u.birthDate, input.audience),
    );
  }

  recipients = [...new Map(recipients.map((u) => [u.id, u])).values()];

  const rowsToInsert: NotificationInsertRow[] = [];

  for (const user of recipients) {
    const id = `un-${user.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const phone = user.phoneNumber ? normalizePhone(user.phoneNumber) : null;
    all.unshift({
      id,
      userId: user.id,
      title,
      message,
      audience: input.audience,
      sentAt,
      readAt: null,
      recipientPhone: phone,
    });
    rowsToInsert.push({
      user_id: /^[0-9a-f-]{36}$/i.test(user.id) ? user.id : null,
      recipient_phone: phone,
      title,
      message,
      audience: input.audience,
      sent_at: sentAt,
      ...(campaignId ? { campaign_id: campaignId } : {}),
    });
  }

  for (const phone of [...new Set(guestPhones)]) {
    const syntheticId = `phone:${phone}`;
    const id = `un-${syntheticId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    all.unshift({
      id,
      userId: syntheticId,
      title,
      message,
      audience: input.audience,
      sentAt,
      readAt: null,
      recipientPhone: phone,
    });
    rowsToInsert.push({
      user_id: null,
      recipient_phone: phone,
      title,
      message,
      audience: input.audience,
      sent_at: sentAt,
      ...(campaignId ? { campaign_id: campaignId } : {}),
    });
  }

  await saveAll(all);

  if (rowsToInsert.length) {
    await insertNotificationsRemote(rowsToInsert);
  }

  const pushUserIds = recipients
    .map((u) => u.id)
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (pushUserIds.length && title && message) {
    void import('@/lib/push-notifications').then((m) =>
      m.requestExpoPushDelivery({
        userIds: pushUserIds,
        title,
        body: message,
        data: { audience: input.audience, ...(campaignId ? { campaignId } : {}) },
      }),
    );
  }

  return recipients.length + new Set(guestPhones).size;
}
