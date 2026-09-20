import AsyncStorage from '@react-native-async-storage/async-storage';

export type PushNotificationCategory = 'agenda' | 'privileges' | 'community' | 'account';

export interface NotificationPreferences {
  pushEnabled: boolean;
  categories: Record<PushNotificationCategory, boolean>;
}

const STORAGE_KEY = 'loop_notification_preferences_v1';

export const PUSH_CATEGORY_LABELS: Record<PushNotificationCategory, { fr: string; en: string; hint: { fr: string; en: string } }> = {
  agenda: {
    fr: 'Agenda & favoris',
    en: 'Agenda & favorites',
    hint: {
      fr: 'Rappels événements, mises à jour de vos favoris.',
      en: 'Event reminders and updates to your favorites.',
    },
  },
  privileges: {
    fr: 'Privilèges & tirages',
    en: 'Perks & draws',
    hint: {
      fr: 'Nouveaux privilèges, gains de tirage, validations partenaire.',
      en: 'New perks, draw wins, partner validations.',
    },
  },
  community: {
    fr: 'Communauté THE LOOP',
    en: 'THE LOOP community',
    hint: {
      fr: 'Annonces, invitations et actualités de la communauté.',
      en: 'Announcements, invitations, and community news.',
    },
  },
  account: {
    fr: 'Compte & sécurité',
    en: 'Account & security',
    hint: {
      fr: 'Alertes liées à votre compte ou à votre abonnement.',
      en: 'Alerts about your account or subscription.',
    },
  },
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
  pushEnabled: true,
  categories: {
    agenda: true,
    privileges: true,
    community: true,
    account: true,
  },
};

function normalizePreferences(raw: unknown): NotificationPreferences {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PREFERENCES, categories: { ...DEFAULT_PREFERENCES.categories } };
  const input = raw as Partial<NotificationPreferences>;
  return {
    pushEnabled: input.pushEnabled !== false,
    categories: {
      agenda: input.categories?.agenda !== false,
      privileges: input.categories?.privileges !== false,
      community: input.categories?.community !== false,
      account: input.categories?.account !== false,
    },
  };
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_PREFERENCES, categories: { ...DEFAULT_PREFERENCES.categories } };
    }
    return normalizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES, categories: { ...DEFAULT_PREFERENCES.categories } };
  }
}

export async function saveNotificationPreferences(prefs: NotificationPreferences): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalizePreferences(prefs)));
}

export function isPushCategoryEnabled(
  prefs: NotificationPreferences,
  category: PushNotificationCategory,
): boolean {
  return prefs.pushEnabled && prefs.categories[category] !== false;
}
