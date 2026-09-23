import Constants from 'expo-constants';
import * as Linking from 'expo-linking';

export const THELOOP_AUTH_CALLBACK = 'theloop://auth/callback';

/** Évite Storage Supabase (text/plain → balises visibles). Même hôte que paiement /payment/success. */
const DEFAULT_MEMBER_AUTH_CALLBACK_URL = 'https://api.theloop-app.com/auth/callback';

const SUPABASE_EDGE_AUTH_CALLBACK_URL =
  'https://eeyhtulpixvftvhppinz.supabase.co/functions/v1/auth-callback';

function getSupabaseHttpsAuthCallbackUrl(): string | null {
  return DEFAULT_MEMBER_AUTH_CALLBACK_URL || SUPABASE_EDGE_AUTH_CALLBACK_URL;
}

/** Expo Go ou client store (environnement de test sans build natif). */
export function isExpoGoTestEnvironment(): boolean {
  return (
    Constants.appOwnership === 'expo'
    || Constants.executionEnvironment === 'storeClient'
  );
}

function readHostUri(): string | null {
  const fromConfig = Constants.expoConfig?.hostUri?.trim();
  if (fromConfig) return fromConfig;
  const legacy = (Constants.manifest as { hostUri?: string } | null)?.hostUri?.trim();
  return legacy || null;
}

/**
 * URL exp://…/auth/callback — seule URL valide pour la confirmation e-mail en Expo Go.
 * Tunnel : hostUri Metro (ex. xxx.exp.direct). LAN : EXPO_PUBLIC_DEV_AUTH_REDIRECT_URL.
 */
export function getExpoGoAuthRedirectUrl(): string | null {
  if (!isExpoGoTestEnvironment()) return null;

  try {
    const fromLinking = Linking.createURL('auth/callback');
    if (fromLinking?.startsWith('exp://') && !fromLinking.includes('127.0.0.1')) {
      return fromLinking;
    }
  } catch (err) {
    console.warn('[Auth] Linking.createURL:', err);
  }

  const hostUri = readHostUri();
  if (hostUri) {
    return `exp://${hostUri}/--/auth/callback`;
  }

  const devLan = process.env.EXPO_PUBLIC_DEV_AUTH_REDIRECT_URL?.trim();
  if (devLan?.startsWith('exp://')) return devLan;

  return null;
}

/**
 * URL Supabase redirect_to après confirmation e-mail.
 * - Test (Expo Go) : exp:// uniquement — jamais theloop://
 * - Preview / prod (EAS) : theloop://auth/callback (eas.json)
 * - Option prod web : EXPO_PUBLIC_AUTH_CALLBACK_HTTPS_URL
 */
export function getAuthEmailRedirectUrl(): string {
  const httpsOverride = process.env.EXPO_PUBLIC_AUTH_CALLBACK_HTTPS_URL?.trim();
  if (httpsOverride) return httpsOverride;

  if (isExpoGoTestEnvironment()) {
    const expoUrl = getExpoGoAuthRedirectUrl();
    if (expoUrl) return expoUrl;
    throw new Error(
      'Expo Go : Metro non prêt. Relancez .\\mobile-token-login.cmd, rechargez l’app (Reload), puis renvoyez l’e-mail.',
    );
  }

  const prodOverride = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.trim();
  if (prodOverride) return prodOverride;

  return THELOOP_AUTH_CALLBACK;
}

/**
 * Redirect pour e-mails envoyés à un membre (invite admin, reset admin).
 * Toujours l’URL app / HTTPS — jamais l’exp:// de l’admin en Expo Go.
 */
export function getAuthMemberFacingRedirectUrl(): string {
  const httpsOverride = process.env.EXPO_PUBLIC_AUTH_CALLBACK_HTTPS_URL?.trim();
  if (httpsOverride) return httpsOverride;
  const derivedHttps = getSupabaseHttpsAuthCallbackUrl();
  if (derivedHttps) return derivedHttps;
  const prodOverride = process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL?.trim();
  if (prodOverride) return prodOverride;
  return THELOOP_AUTH_CALLBACK;
}

/** Vérifie que l’URL de redirection est utilisable avant signUp / renvoi e-mail. */
export function assertAuthRedirectReadyForSignUp(): void {
  if (!isExpoGoTestEnvironment()) return;
  const url = getAuthEmailRedirectUrl();
  if (!url.startsWith('exp://')) {
    throw new Error(
      'Environnement de test : l’URL de redirection doit être exp://. Rechargez l’app avec Metro (tunnel) actif.',
    );
  }
}

export function getAuthEmailRedirectUrlHint(): string {
  try {
    return getAuthEmailRedirectUrl();
  } catch {
    return '(Metro requis — exp:// indisponible)';
  }
}

export function isUsingExpoGoAuthRedirect(): boolean {
  try {
    return getAuthEmailRedirectUrl().startsWith('exp://');
  } catch {
    return false;
  }
}

/** URLs à autoriser dans Supabase → Authentication → Redirect URLs (test + prod). */
export function getSupabaseRedirectUrlChecklist(): string[] {
  const urls = new Set<string>([
    THELOOP_AUTH_CALLBACK,
    'theloop://**',
    'exp://**',
  ]);
  try {
    urls.add(getAuthEmailRedirectUrl());
  } catch {
    /* Metro pas prêt */
  }
  const expoUrl = getExpoGoAuthRedirectUrl();
  if (expoUrl) urls.add(expoUrl);
  const devLan = process.env.EXPO_PUBLIC_DEV_AUTH_REDIRECT_URL?.trim();
  if (devLan) urls.add(devLan);
  const https = process.env.EXPO_PUBLIC_AUTH_CALLBACK_HTTPS_URL?.trim();
  if (https) urls.add(https);
  const derivedHttps = getSupabaseHttpsAuthCallbackUrl();
  if (derivedHttps) urls.add(derivedHttps);
  return [...urls];
}

/** Log dev — appel au démarrage / retour au premier plan. */
export function logAuthRedirectConfig(): void {
  if (!__DEV__) return;
  if (!isExpoGoTestEnvironment()) {
    console.log('[Auth] redirect (build natif):', getAuthEmailRedirectUrlHint());
    return;
  }
  try {
    const url = getAuthEmailRedirectUrl();
    console.log('[Auth] redirect TEST (Expo Go):', url);
    console.log('[Auth] Supabase Redirect URLs : exp://** (+ this URL si tunnel change)');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Auth] redirect TEST indisponible:', msg);
  }
}
