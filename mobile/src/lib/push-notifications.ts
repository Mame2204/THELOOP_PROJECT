import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import {
  getLoopBackendApiUrl,
  isLoopBackendConfigured,
  markLoopBackendUnreachable,
  shouldSkipLoopBackendFetch,
} from '@/lib/loop-backend-api';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type NotificationsModule = typeof import('expo-notifications');

let notificationsMod: NotificationsModule | null = null;
let handlerConfigured = false;

async function getNotifications(): Promise<NotificationsModule | null> {
  try {
    if (!notificationsMod) {
      notificationsMod = await import('expo-notifications');
    }
    if (!handlerConfigured) {
      handlerConfigured = true;
      notificationsMod.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    }
    return notificationsMod;
  } catch (err) {
    console.warn('[Push] module notifications indisponible', err);
    return null;
  }
}

function easProjectId(): string | null {
  const fromEas = Constants.easConfig?.projectId;
  if (typeof fromEas === 'string' && fromEas.trim()) return fromEas.trim();
  const fromExtra = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof fromExtra === 'string' && fromExtra.trim()) return fromExtra.trim();
  return null;
}

function platformLabel(): 'ios' | 'android' | 'web' | 'unknown' {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'web') return 'web';
  return 'unknown';
}

/** Canal Android obligatoire pour les push (API 26+). */
export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = await getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.setNotificationChannelAsync('theloop-default', {
      name: 'THE LOOP',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#12A8BC',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  } catch (err) {
    console.warn('[Push] canal Android', err);
  }
}

/**
 * Demande la permission OS + enregistre le token Expo Push pour l’utilisateur connecté.
 * Nécessaire pour recevoir des alertes app en arrière-plan / fermée.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  if (!userId || userId === 'anonymous') return null;
  if (!Device.isDevice) {
    console.warn('[Push] Simulateur / émulateur : pas de token push réel.');
    return null;
  }

  try {
    const Notifications = await getNotifications();
    if (!Notifications) return null;

    await ensureAndroidNotificationChannel();

    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }
    if (status !== 'granted') {
      console.warn('[Push] Permission notifications refusée.');
      return null;
    }

    const projectId = easProjectId();
    if (!projectId) {
      console.warn('[Push] projectId EAS manquant (app.json extra.eas.projectId).');
      return null;
    }

    let token: string;
    try {
      const result = await Notifications.getExpoPushTokenAsync({ projectId });
      token = result.data;
    } catch (err) {
      // Souvent FCM / google-services — ne doit jamais crasher l’app.
      console.warn('[Push] getExpoPushTokenAsync échoué', err);
      return null;
    }

    if (!isSupabaseConfigured() || !supabase) {
      return token;
    }

    const { error } = await supabase.from('user_push_tokens').upsert(
      {
        user_id: userId,
        expo_push_token: token,
        platform: platformLabel(),
        device_name: Device.modelName ?? Device.deviceName ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'expo_push_token' },
    );

    if (error) {
      console.warn('[Push] upsert token échoué', error.message);
    }

    return token;
  } catch (err) {
    console.warn('[Push] registerForPushNotifications', err);
    return null;
  }
}

/** Retire le token de cet appareil (déconnexion). */
export async function unregisterPushTokenForDevice(): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const projectId = easProjectId();
  if (!projectId) return;
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('user_push_tokens').delete().eq('expo_push_token', result.data);
  } catch {
    /* ignore */
  }
}

/**
 * Bannière OS locale (premier plan) — complète le push distant.
 */
export async function presentLocalOsNotification(input: {
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return;
    await ensureAndroidNotificationChannel();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: input.title,
        body: input.body,
        sound: true,
        data: input.data ?? {},
        ...(Platform.OS === 'android' ? { channelId: 'theloop-default' } : {}),
      },
      trigger: null,
    });
  } catch (err) {
    console.warn('[Push] presentLocalOsNotification', err);
  }
}

async function requestServerPushDelivery(input: {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<boolean> {
  if (!isLoopBackendConfigured() || shouldSkipLoopBackendFetch() || !supabase) return false;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return false;

  const base = getLoopBackendApiUrl();
  try {
    const res = await fetch(`${base}/api/admin/push/deliver`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userIds: input.userIds,
        title: input.title,
        body: input.body,
        data: input.data ?? {},
      }),
    });
    if (!res.ok) {
      console.warn('[Push] serveur push/deliver HTTP', res.status);
      return false;
    }
    const body = (await res.json()) as { sent?: number; failed?: number; reason?: string | null };
    if (body.reason === 'no_tokens') {
      console.warn('[Push] aucun token enregistré pour ces utilisateurs');
    } else {
      console.log('[Push] serveur OK', body.sent ?? 0, 'message(s)');
    }
    return true;
  } catch (err) {
    markLoopBackendUnreachable();
    console.warn('[Push] serveur push/deliver', err);
    return false;
  }
}

/**
 * Push OS unifié : serveur THE LOOP (prod) puis fallback Edge Function send-push.
 * Fire-and-forget : l’inbox in-app reste la source de vérité.
 */
export async function requestExpoPushDelivery(input: {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {
  const ids = [...new Set(input.userIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!ids.length) return;

  if (await requestServerPushDelivery({ ...input, userIds: ids })) return;

  if (!isSupabaseConfigured() || !supabase) {
    console.warn('[Push] send-push ignoré : Supabase non configuré');
    return;
  }

  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: {
        userIds: ids,
        title: input.title,
        body: input.body,
        data: input.data ?? {},
      },
    });
    if (error) {
      console.warn(
        '[Push] send-push échec — déployez la fonction (`supabase functions deploy send-push`) et vérifiez FCM/APNs sur Expo. ',
        error.message,
      );
      return;
    }
    const result = data as { sent?: number; reason?: string; error?: string } | null;
    if (result?.error) {
      console.warn('[Push] send-push:', result.error);
    } else if (result?.reason === 'no_tokens') {
      console.warn('[Push] aucun token enregistré pour ces utilisateurs (permission / rebuild EAS / table user_push_tokens)');
    } else {
      console.log('[Push] send-push OK', result?.sent ?? 0, 'message(s)');
    }
  } catch (err) {
    console.warn('[Push] send-push invoke', err);
  }
}

/** Abonnements listeners (import dynamique — évite crash natif au cold start). */
export async function addNotificationResponseListener(
  listener: () => void,
): Promise<{ remove: () => void } | null> {
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return null;
    return Notifications.addNotificationResponseReceivedListener(listener);
  } catch {
    return null;
  }
}

export async function addNotificationReceivedListener(
  listener: () => void,
): Promise<{ remove: () => void } | null> {
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return null;
    return Notifications.addNotificationReceivedListener(listener);
  } catch {
    return null;
  }
}
