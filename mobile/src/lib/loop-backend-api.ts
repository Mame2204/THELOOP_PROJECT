/** API backend THE LOOP (validation partenaire, admin…) */
const BACKEND_API_URL = (
  process.env.EXPO_PUBLIC_BACKEND_API_URL ??
  process.env.EXPO_PUBLIC_PAYMENT_API_URL ??
  ''
).replace(/\/$/, '');

let backendUnreachableUntil = 0;

export function isLoopBackendConfigured(): boolean {
  return Boolean(BACKEND_API_URL && !BACKEND_API_URL.includes('your-payment-api'));
}

export function getLoopBackendApiUrl(): string {
  return BACKEND_API_URL;
}

/** Évite le spam réseau quand le backend LAN est injoignable (tunnel Expo). */
export function shouldSkipLoopBackendFetch(): boolean {
  return Date.now() < backendUnreachableUntil;
}

export function markLoopBackendUnreachable(cooldownMs = 90_000): void {
  backendUnreachableUntil = Date.now() + cooldownMs;
}
