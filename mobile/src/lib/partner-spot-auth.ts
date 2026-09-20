import {
  clearPartnerSpotSession,
  loadPartnerSpotSession,
  savePartnerSpotSession,
} from '@/lib/partner-session-store';
import { resolveEffectivePartnerUserId } from '@/lib/partner-session-user-id';
import { loadPartnerUserFromDatabase } from '@/lib/partner-user-resolve';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { User } from '@/types';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

const DEFAULT_PARTNER_DEMO_PASSWORD = 'Loop1234!';

/** Jetons démo → e-mail auth Supabase. */
const DEMO_SPOT_TOKEN_EMAILS: Record<string, string> = {
  'SPOT-DEMO-2026': 'contact@lavenue.gn',
};

export type PartnerSpotAuthBootstrapResult = {
  ok: boolean;
  userId?: string | null;
  reason?: string;
};

function partnerDemoPassword(): string {
  return process.env.EXPO_PUBLIC_PARTNER_DEMO_PASSWORD?.trim() || DEFAULT_PARTNER_DEMO_PASSWORD;
}

async function resolveEmailFromSpotToken(
  tokenCode: string,
  emailHint?: string | null,
  linkedUserIdHint?: string | null,
): Promise<{ email: string | null; userId: string | null }> {
  const hinted = emailHint?.trim();
  if (hinted) {
    return {
      email: hinted,
      userId: linkedUserIdHint && isUuid(linkedUserIdHint) ? linkedUserIdHint : null,
    };
  }

  const upper = tokenCode.trim().toUpperCase();
  if (!upper) {
    return { email: null, userId: linkedUserIdHint && isUuid(linkedUserIdHint) ? linkedUserIdHint : null };
  }
  const demoEmail = DEMO_SPOT_TOKEN_EMAILS[upper];
  if (demoEmail) {
    return {
      email: demoEmail,
      userId: linkedUserIdHint && isUuid(linkedUserIdHint) ? linkedUserIdHint : null,
    };
  }

  if (!isSupabaseConfigured() || !supabase) {
    return { email: null, userId: null };
  }

  const { data: tokenRows } = await supabase.rpc('validate_partner_spot_token', {
    p_code: upper,
  });
  const tokenRow = Array.isArray(tokenRows) ? tokenRows[0] : tokenRows;

  const userId = tokenRow?.user_id ? String(tokenRow.user_id) : linkedUserIdHint && isUuid(linkedUserIdHint) ? linkedUserIdHint : null;

  if (userId && isUuid(userId)) {
    const emailFromRpc = tokenRow?.linked_email ? String(tokenRow.linked_email).trim() : null;
    if (emailFromRpc) return { email: emailFromRpc, userId };
    const { data: userRow } = await supabase.from('users').select('email').eq('id', userId).maybeSingle();
    const email = userRow?.email ? String(userRow.email).trim() : null;
    if (email) return { email, userId };
  }

  const partnerName = tokenRow?.partner_name ? String(tokenRow.partner_name) : '';
  if (partnerName) {
    const dbPartner = await loadPartnerUserFromDatabase(partnerName);
    if (dbPartner?.email) {
      return {
        email: dbPartner.email,
        userId: dbPartner.id && isUuid(dbPartner.id) ? dbPartner.id : userId,
      };
    }
  }

  return { email: null, userId };
}

/** Connexion Supabase directe (HTTPS) — chemin principal jeton SPOT, sans backend LAN. */
async function signInPartnerWithEmailPassword(
  tokenCode: string,
  emailHint?: string | null,
  linkedUserIdHint?: string | null,
): Promise<{ ok: boolean; userId?: string }> {
  if (!supabase) return { ok: false };

  const resolved = await resolveEmailFromSpotToken(tokenCode, emailHint, linkedUserIdHint);
  if (!resolved.email) return { ok: false };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: resolved.email,
    password: partnerDemoPassword(),
  });

  if (error || !data.session?.user?.id) {
    if (__DEV__) {
      console.warn('[PartnerSpotAuth] signInWithPassword:', error?.message ?? 'no_session');
    }
    return { ok: false };
  }

  const authUserId = data.session.user.id;
  const expectedId = resolved.userId ?? linkedUserIdHint ?? null;

  if (expectedId && isUuid(expectedId) && authUserId !== expectedId && __DEV__) {
    console.warn(
      '[PartnerSpotAuth] auth.uid() ≠ user_id jeton — utilisation auth.uid()',
      { authUserId, expectedId },
    );
  }

  return { ok: true, userId: authUserId };
}

/**
 * Établit la session Supabase pour un partenaire SPOT (notifications, avantages, stats).
 * Uniquement Supabase — pas de backend paiement.
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

  const signedIn = await signInPartnerWithEmailPassword(
    tokenCode,
    options.email,
    linkedUserId || null,
  );
  if (signedIn.ok && signedIn.userId) {
    return { ok: true, userId: signedIn.userId };
  }

  return { ok: false, reason: 'session_bootstrap_failed' };
}

/** Rétablit la session Supabase si une session SPOT est en cache (sans backend). */
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

  const email = partnerSession?.user?.email?.trim();
  if (email) {
    const signedIn = await signInPartnerWithEmailPassword(
      partnerSession?.tokenCode ?? '',
      email,
      partnerSession?.user?.id && isUuid(partnerSession.user.id) ? partnerSession.user.id : null,
    );
    if (signedIn.ok) return true;
  }

  if (isSupabaseConfigured() && supabase) {
    const { data: sessionData } = await supabase.auth.getSession();
    const sessionEmail = sessionData.session?.user?.email?.trim();
    if (sessionEmail && sessionEmail !== email) {
      const signedIn = await signInPartnerWithEmailPassword('', sessionEmail, null);
      if (signedIn.ok) return true;
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

  const email = user.email?.trim();
  if (email) {
    const signedIn = await signInPartnerWithEmailPassword('', email, user.id);
    if (signedIn.ok) return;
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
