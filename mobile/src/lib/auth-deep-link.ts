import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type AuthDeepLinkResult =
  | { ok: false }
  | { ok: true; kind: 'session' | 'recovery' | 'invite'; session: Session };

/** Extrait hash + query (PKCE code ou tokens implicit). */
export function extractAuthParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');

  const parts: string[] = [];
  if (queryIndex >= 0) {
    const end = hashIndex >= 0 ? hashIndex : url.length;
    parts.push(url.slice(queryIndex + 1, end));
  }
  if (hashIndex >= 0) {
    parts.push(url.slice(hashIndex + 1));
  }

  for (const part of parts) {
    const params = new URLSearchParams(part);
    params.forEach((value, key) => {
      out[key] = value;
    });
  }
  return out;
}

/** Clés présentes dans le deep link (sans exposer les valeurs). */
export function describeAuthUrlParams(url: string): string {
  const keys = Object.keys(extractAuthParams(url));
  if (keys.length === 0) return 'aucun paramètre';
  return keys.join(', ');
}

function resolveLinkKind(params: Record<string, string>): 'session' | 'recovery' | 'invite' {
  const type = (params.type ?? '').toLowerCase();
  if (type === 'recovery') return 'recovery';
  if (type === 'invite') return 'invite';
  return 'session';
}

/** Ouvre une session depuis exp:// ou theloop:// auth/callback. */
export async function completeAuthSessionFromUrl(url: string): Promise<AuthDeepLinkResult> {
  if (!supabase || !url.includes('auth/callback')) return { ok: false };

  const params = extractAuthParams(url);

  if (params.error || params.error_description) {
    console.warn('[Auth] Erreur dans le lien:', params.error_description ?? params.error);
    return { ok: false };
  }

  const kind = resolveLinkKind(params);

  const tokenHash = params.token_hash;
  if (tokenHash) {
    const otpTypes: Array<'recovery' | 'signup' | 'invite' | 'email'> =
      kind === 'recovery'
        ? ['recovery']
        : kind === 'invite'
          ? ['invite', 'email']
          : ['signup', 'email'];

    for (const otpType of otpTypes) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      });
      if (error) {
        console.warn('[Auth] verifyOtp token_hash', otpType, error.message);
        if (kind === 'recovery') {
          return { ok: false };
        }
        continue;
      }
      if (data.session) {
        const resolvedKind = otpType === 'recovery' || kind === 'recovery' ? 'recovery' : kind;
        const { error: persistErr } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (persistErr) {
          console.warn('[Auth] setSession après verifyOtp:', persistErr.message);
        }
        if (__DEV__) {
          console.log('[Auth] verifyOtp OK —', data.session.user.email ?? data.session.user.id, resolvedKind);
        }
        return { ok: true, kind: resolvedKind, session: data.session };
      }
    }
    return { ok: false };
  }

  const code = params.code;
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn('[Auth] exchangeCodeForSession:', error.message);
      return { ok: false };
    }
    if (__DEV__ && data.session) {
      console.log('[Auth] session PKCE OK —', data.session.user.email ?? data.session.user.id, kind);
    }
    if (!data.session) return { ok: false };
    const { error: persistErr } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
    if (persistErr) {
      console.warn('[Auth] setSession après PKCE:', persistErr.message);
    }
    return { ok: true, kind, session: data.session };
  }

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  if (!accessToken || !refreshToken) {
    return { ok: false };
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) {
    console.warn('[Auth] setSession from URL:', error.message);
    return { ok: false };
  }

  if (__DEV__ && data.session) {
    console.log('[Auth] session implicit OK —', data.session.user.email ?? data.session.user.id, kind);
  }

  if (!data.session) return { ok: false };
  return { ok: true, kind, session: data.session };
}
