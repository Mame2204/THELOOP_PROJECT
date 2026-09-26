import type { Session } from '@supabase/supabase-js';
import {
  completeAuthSessionFromUrl,
  extractAuthParams,
  type AuthDeepLinkResult,
} from '@/lib/auth-deep-link';

/** Clé stable pour éviter double verifyOtp (getInitialURL + event url). */
export function authCallbackDedupeKey(url: string): string {
  const params = extractAuthParams(url);
  if (params.token_hash) return `hash:${params.token_hash}`;
  if (params.code) return `code:${params.code}`;
  if (params.access_token) return `access:${params.access_token.slice(0, 16)}`;
  return url.replace(/#.*$/, '').replace(/\?$/, '');
}

type CachedAuthLink = {
  key: string;
  result: AuthDeepLinkResult;
  session: Session | null;
  atMs: number;
};

let inFlight: Promise<AuthDeepLinkResult> | null = null;
let inFlightKey: string | null = null;
let cached: CachedAuthLink | null = null;

const CACHE_TTL_MS = 15 * 60 * 1000;

function readCached(key: string): AuthDeepLinkResult | null {
  if (!cached || cached.key !== key) return null;
  if (Date.now() - cached.atMs > CACHE_TTL_MS) {
    cached = null;
    return null;
  }
  return cached.result.ok ? cached.result : null;
}

/** Session recovery conservée après verifyOtp (soumission MDP sans re-vérifier le lien). */
export function getCachedRecoverySession(): Session | null {
  if (!cached?.result.ok || !cached.session) return null;
  if (Date.now() - cached.atMs > CACHE_TTL_MS) return null;
  return cached.session;
}

export function rememberRecoverySession(session: Session | null): void {
  if (!session) return;
  const key = cached?.key ?? `session:${session.user.id}`;
  cached = {
    key,
    result: { ok: true, kind: 'recovery', session },
    session,
    atMs: Date.now(),
  };
}

export function clearAuthCallbackLinkCache(): void {
  cached = null;
  inFlight = null;
  inFlightKey = null;
}

/**
 * Traite auth/callback une seule fois par token (évite « lien expiré » après ouverture app).
 */
export async function completeAuthSessionFromUrlOnce(url: string): Promise<AuthDeepLinkResult> {
  const key = authCallbackDedupeKey(url);
  const hit = readCached(key);
  if (hit) return hit;

  if (inFlight && inFlightKey === key) {
    return inFlight;
  }

  inFlightKey = key;
  inFlight = completeAuthSessionFromUrl(url)
    .then((result) => {
      if (result.ok) {
        cached = {
          key,
          result,
          session: result.session,
          atMs: Date.now(),
        };
      }
      return result;
    })
    .finally(() => {
      if (inFlightKey === key) {
        inFlight = null;
        inFlightKey = null;
      }
    });

  return inFlight;
}

export function isRecoveryCallbackUrl(url: string): boolean {
  if (!url.includes('auth/callback')) return false;
  const type = (extractAuthParams(url).type ?? '').toLowerCase();
  return type === 'recovery';
}
