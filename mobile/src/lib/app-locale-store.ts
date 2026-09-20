import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppLocale = 'fr' | 'en';

const STORAGE_KEY = 'loop_app_locale_v1';

export async function getAppLocale(): Promise<AppLocale> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === 'en' ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

export async function saveAppLocale(locale: AppLocale): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, locale);
}
