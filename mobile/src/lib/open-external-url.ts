import * as WebBrowser from 'expo-web-browser';
import { Alert, Linking, Platform } from 'react-native';

function humanLabel(url: string): string {
  if (url.startsWith('mailto:')) return url.replace(/^mailto:/i, '');
  if (url.startsWith('tel:')) return url.replace(/^tel:/i, '');
  return url;
}

function isWhatsAppUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'wa.me' || host.endsWith('.whatsapp.com');
  } catch {
    return false;
  }
}

/**
 * Ouvre une URL externe (mailto, tel, https…) avec repli si aucune app compatible.
 * Sur Android, les liens https passent par expo-web-browser (plus fiable que Linking seul).
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  const trimmed = url.trim();
  if (!trimmed) return false;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      if (isWhatsAppUrl(trimmed)) {
        await Linking.openURL(trimmed);
      } else {
        await WebBrowser.openBrowserAsync(trimmed, {
          enableBarCollapsing: true,
          showInRecents: true,
        });
      }
      return true;
    }

    await Linking.openURL(trimmed);
    return true;
  } catch {
    // canOpenURL peut échouer sur Android sans queries manifest — on retente l'ouverture directe.
    if (Platform.OS === 'android' && !/^https?:\/\//i.test(trimmed)) {
      try {
        await Linking.openURL(trimmed);
        return true;
      } catch {
        // fallthrough
      }
    }
  }

  Alert.alert(
    'Ouverture impossible',
    `Aucune application compatible n'a été trouvée.\n\n${humanLabel(trimmed)}`,
  );
  return false;
}

/** Laisse le temps à une modale de se fermer avant d'ouvrir une app externe (Android). */
export function openExternalUrlAfterModalClose(url: string, delayMs = Platform.OS === 'android' ? 320 : 0): void {
  const launch = () => {
    void openExternalUrl(url);
  };
  if (delayMs > 0) {
    setTimeout(launch, delayMs);
  } else {
    launch();
  }
}
