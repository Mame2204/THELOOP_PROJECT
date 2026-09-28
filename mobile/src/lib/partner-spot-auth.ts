import {
  clearPartnerSpotSession,
  loadPartnerSpotSession,
  savePartnerSpotSession,
} from '@/lib/partner-session-store';
import { resolveEffectivePartnerUserId } from '@/lib/partner-session-user-id';
import {
  getLoopBackendApiUrl,
  isLoopBackendConfigured,
  markLoopBackendUnreachable,
  shouldSkipLoopBackendFetch,
} from '@/lib/loop-backend-api';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { User } from '@/types';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export type PartnerSpotAuthBootstrapResult = {
  ok: boolean;
  userId?: string | null;
  reason?: string;
};

/**
 * Échange un jeton SPOT actif contre une session Supabase via le serveur THE LOOP
 * (aucun mot de passe embarqué dans l'app).
 */
async function signInPartnerWithSpotToken(
  tokenCode: string,
  linkedUserIdHint?: string | null,
): Promise<{ ok: boolean; userId?: string }> {
  if (!supabase) return { ok: false };
  const code = tokenCode.trim().toUpperCase();
  if (!code || !isLoopBackendConfigured() || shouldSkipLoopBackendFetch()) return { ok: false };

  let body: { access_token?: string; refresh_token?: string } = {};
  try {
    const res = await fetch(`${getLoopBackendApiUrl()}/api/partner/spot-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenCode: code }),
    });
    if (!res.ok) return { ok: false };
    body = (await res.json()) as typeof body;
  } catch {
    markLoopBackendUnreachable();
    return { ok: false };
  }

  if (!body.access_token || !body.refresh_token) return { ok: false };
  const { data, error } = await supabase.auth.setSession({
    access_token: body.access_token,
    refresh_token: body.refresh_token,
  });
  const authUserId = data.session?.user?.id;
  if (error || !authUserId) {
    if (__DEV__) {
      console.warn('[PartnerSpotAuth] setSession:', error?.message ?? 'no_session');
    }
    return { ok: false };
  }

  if (linkedUserIdHint && isUuid(linkedUserIdHint) && authUserId !== linkedUserIdHint && __DEV__) {
    console.warn(
      '[PartnerSpotAuth] auth.uid() ≠ user_id jeton — utilisation auth.uid()',
      { authUserId, expectedId: linkedUserIdHint },
    );
  }

  return { ok: true, userId: authUserId };
}

/**
 * Établit la session Supabase pour un partenaire SPOT (notifications, avantages, stats).
 */
export async function bootstrapPartnerSupabaseAuth(options: {
  linkedUserId: string | null;
  tokenCode: string;
  email?: string | null;
}): Promise<PartnerSpotAuthBootstrapResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, reason: 'no_supabase' };
  }

  const linkedUserId = options.linkedUserId?.trim() ?? '';
  const tokenCode = options.tokenCode.trim().toUpperCase();
  if (!tokenCode) return { ok: false, reason: 'no_token' };

  const expectedUserId =
    linkedUserId && isUuid(linkedUserId) ? linkedUserId : null;

  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.id) {
    if (!expectedUserId || authData.user.id === expectedUserId) {
      return { ok: true, userId: authData.user.id };
    }
    await supabase.auth.signOut();
  }

  const signedIn = await signInPartnerWithSpotToken(tokenCode, linkedUserId || null);
  if (signedIn.ok && signedIn.userId) {
    return { ok: true, userId: signedIn.userId };
  }

  return { ok: false, reason: 'session_bootstrap_failed' };
}

/** Rétablit la session Supabase si une session SPOT est en cache. */
export async function restorePartnerSupabaseAuthFromSpotSession(): Promise<PartnerSpotAuthBootstrapResult> {
  const partnerSession = await loadPartnerSpotSession();
  if (!partnerSession?.tokenCode) {
    return { ok: false, reason: 'no_partner_session' };
  }

  const linkedUserId = isUuid(partnerSession.user.id) ? partnerSession.user.id : null;
  return bootstrapPartnerSupabaseAuth({
    linkedUserId,
    tokenCode: partnerSession.tokenCode,
    email: partnerSession.user.email ?? null,
  });
}

/** UUID auth Supabase courant (session locale puis validation serveur). */
export async function getPartnerAuthUserIdFromSession(): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const fromSession = sessionData.session?.user?.id?.trim();
  if (fromSession && isUuid(fromSession)) return fromSession;

  const { data: authData } = await supabase.auth.getUser();
  const fromUser = authData.user?.id?.trim();
  return fromUser && isUuid(fromUser) ? fromUser : null;
}

/** Attend que la session Supabase partenaire soit prête (évite KPI vides au 1er rendu). */
export async function requirePartnerAuthUserId(maxWaitMs = 4000): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const deadline = Date.now() + maxWaitMs;
  while (Date.now() <= deadline) {
    await ensurePartnerSupabaseSession();
    const id = await getPartnerAuthUserIdFromSession();
    if (id) return id;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return null;
}

export type EnsurePartnerSessionOptions = {
  /** false = ne jamais restaurer une session SPOT depuis le cache (cloche admin, modération). */
  allowRestore?: boolean;
};

/**
 * Avant tout fetch cloud partenaire : garantir une session Supabase valide.
 * Connexion e-mail / mot de passe : la session auth courante suffit (pas de jeton SPOT).
 */
export async function ensurePartnerSupabaseSession(
  options?: EnsurePartnerSessionOptions,
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const allowRestore = options?.allowRestore !== false;

  const authUserId = await getPartnerAuthUserIdFromSession();

  if (authUserId) {
    const partnerSession = await loadPartnerSpotSession();
    const spotUserId =
      partnerSession?.user?.id && isUuid(partnerSession.user.id)
        ? partnerSession.user.id
        : null;
    if (partnerSession?.tokenCode && spotUserId && spotUserId !== authUserId) {
      await clearPartnerSpotSession();
    }
    return true;
  }

  if (!allowRestore) return false;

  const partnerSession = await loadPartnerSpotSession();

  if (partnerSession?.tokenCode) {
    const boot = await restorePartnerSupabaseAuthFromSpotSession();
    if (boot.ok && boot.userId) {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user?.id) {
        await savePartnerSpotSession({
          ...partnerSession,
          user: {
            ...partnerSession.user,
            id: boot.userId,
            email: sessionData.session.user.email ?? partnerSession.user.email,
          },
        });
        return true;
      }
    }
  }

  return false;
}

export type PartnerWorkspaceContext = {
  authUserId: string | null;
  effectiveUserId: string;
  partnerLabel: string;
  phone: string | null;
};

export async function isAdminAuthUserId(authUserId: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase || !isUuid(authUserId)) return false;
  const { data } = await supabase.from('users').select('user_role').eq('id', authUserId).maybeSingle();
  const role = String(data?.user_role ?? '').toLowerCase();
  return role === 'admin' || role === 'super_admin';
}

/**
 * Lecture inbox (cloche) : ne jamais basculer vers une session partenaire en cache.
 * Retourne auth.uid() seulement s'il correspond au compte attendu (RLS user_notifications).
 */
export async function ensureInboxReadSession(expectedUserId: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase || !isUuid(expectedUserId)) return null;

  const expectedIsAdmin = await isAdminAuthUserId(expectedUserId);
  if (expectedIsAdmin) {
    await ensurePartnerSupabaseSession({ allowRestore: false });
  }

  let current = await getPartnerAuthUserIdFromSession();
  if (current === expectedUserId) return current;

  if (current && current !== expectedUserId && expectedIsAdmin) {
    await clearPartnerSpotSession();
    current = await getPartnerAuthUserIdFromSession();
    if (current === expectedUserId) return current;
  }

  if (current && current !== expectedUserId) {
    return expectedIsAdmin ? null : current;
  }

  return expectedUserId;
}

/** RPC soumission partenaire : auth.uid() doit être p_partner_user_id (assert_partner_submission_actor). */
export async function resolveSubmissionPartnerUserId(
  partnerId: string | null | undefined,
  partnerName: string | null | undefined,
): Promise<string | null> {
  await ensurePartnerSupabaseSession();
  const authUid = await getPartnerAuthUserIdFromSession();
  if (authUid) return authUid;

  const { resolvePartnerUserIdForSync } = await import('@/lib/partner-user-resolve');
  return resolvePartnerUserIdForSync(partnerId, partnerName);
}

/** Si un admin est encore en session Supabase, bascule vers le compte partenaire du profil. */
export async function ensurePartnerAuthForProfile(user: User): Promise<void> {
  if (user.role !== 'PARTNER' || !isSupabaseConfigured() || !supabase) return;
  if (!isUuid(user.id)) return;

  const authUserId = await getPartnerAuthUserIdFromSession();
  if (authUserId === user.id) return;

  const mustSwitch =
    !authUserId
    || authUserId !== user.id;

  if (!mustSwitch) return;

  if (authUserId && (await isAdminAuthUserId(authUserId))) {
    await supabase.auth.signOut();
  } else if (authUserId && authUserId !== user.id) {
    // Session d'un autre compte : ne pas déconnecter (évite rafales d'erreurs réseau).
    return;
  }

  const partnerSession = await loadPartnerSpotSession();
  if (partnerSession?.tokenCode) {
    await restorePartnerSupabaseAuthFromSpotSession();
  }
}

/** Résout identité partenaire + session Supabase (sans boucle d'attente si déjà connecté). */
export async function resolvePartnerWorkspaceContext(user: User): Promise<PartnerWorkspaceContext> {
  const partnerLabel = user.company ?? user.fullName ?? 'Partenaire';
  await ensurePartnerAuthForProfile(user);
  await ensurePartnerSupabaseSession();
  let authUserId = await getPartnerAuthUserIdFromSession();
  if (!authUserId) {
    authUserId = await requirePartnerAuthUserId(1500);
  }
  const effectiveUserId =
    authUserId
    ?? (await resolveEffectivePartnerUserId(user.id, partnerLabel))
    ?? user.id;

  return {
    authUserId,
    effectiveUserId,
    partnerLabel,
    phone: user.phoneNumber ?? null,
  };
}
