import { normalizePartnerName, partnerNamesMatch } from '@/lib/partner-name-utils';
import { resolvePartnerUserIdForSync } from '@/lib/partner-user-resolve';
import { resolveStablePartnerKey } from '@/lib/partner-validation-code-store';
import { listPartnerDirectory, EXTERNAL_PARTNER_ID } from '@/lib/partner-directory-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export { normalizePartnerName } from '@/lib/partner-name-utils';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export interface PartnerIdentity {
  userId: string | null;
  keys: Set<string>;
  names: Set<string>;
}

function addName(names: Set<string>, name: string | null | undefined): void {
  const norm = name?.trim() ? normalizePartnerName(name) : '';
  if (norm) names.add(norm);
}

export async function resolvePartnerIdentity(
  partnerId: string | null | undefined,
  partnerName: string | null | undefined,
): Promise<PartnerIdentity> {
  const keys = new Set<string>();
  const names = new Set<string>();

  const rawId = partnerId?.trim();
  if (rawId) keys.add(rawId);

  addName(names, partnerName);

  const stableKey = await resolveStablePartnerKey(rawId ?? '', partnerName);
  keys.add(stableKey);

  let resolvedUserId: string | null = null;
  try {
    resolvedUserId = await resolvePartnerUserIdForSync(partnerId, partnerName);
  } catch {
    /* import / réseau — repli UUID brut */
  }
  const userId = resolvedUserId ?? (rawId && isUuid(rawId) ? rawId : null);

  if (userId) {
    keys.add(userId);
    keys.add(`user:${userId}`);
  }

  const uidForContent = userId ?? (rawId && isUuid(rawId) ? rawId : null);
  if (uidForContent && isSupabaseConfigured() && supabase) {
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('company, first_name, last_name, email')
        .eq('id', uidForContent)
        .maybeSingle();
      if (profile) {
        addName(names, profile.company ? String(profile.company) : null);
        addName(names, `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim());
        addName(names, profile.email ? String(profile.email) : null);
      }
    } catch {
      /* réseau / RLS — identité locale conservée */
    }
  }

  if (uidForContent) {
    try {
      const { listPartnerEstablishments } = await import('@/lib/partner-establishments');
      for (const est of await listPartnerEstablishments(uidForContent)) {
        if (est.status === 'approved') {
          keys.add(est.id);
          addName(names, est.title);
        }
      }
    } catch {
      /* évite de bloquer auth / avantages si le catalogue partenaire échoue */
    }
  }

  const directory = await listPartnerDirectory();
  for (const entry of directory) {
    const matchesId = rawId === entry.id || keys.has(entry.id);
    const matchesName = Boolean(partnerName?.trim()) && partnerNamesMatch(entry.name, partnerName ?? '');
    if (!matchesId && !matchesName) continue;
    keys.add(entry.id);
    if (entry.id.startsWith('user:')) keys.add(entry.id.slice(5));
    addName(names, entry.name);
  }

  return { userId, keys, names };
}

export function partnerKeyMatches(identity: PartnerIdentity, partnerKey: string | null | undefined): boolean {
  const key = partnerKey?.trim() ?? '';
  if (!key) return false;
  return identity.keys.has(key);
}

export function partnerNameMatches(identity: PartnerIdentity, partnerName: string | null | undefined): boolean {
  const target = partnerName?.trim() ?? '';
  if (!target) return false;
  for (const known of identity.names) {
    if (partnerNamesMatch(known, target)) return true;
  }
  return false;
}

export function partnerIdentityMatchesRecord(
  identity: PartnerIdentity,
  partnerKey: string,
  partnerName: string,
): boolean {
  if (partnerKeyMatches(identity, partnerKey) || partnerNameMatches(identity, partnerName)) {
    return true;
  }
  const key = partnerKey?.trim() ?? '';
  const name = partnerName?.trim() ?? '';
  if (
    (key === EXTERNAL_PARTNER_ID || key === '__external__')
    && name
    && partnerNameMatches(identity, name)
  ) {
    return true;
  }
  return false;
}

/** Contexte spot/établissement/compte pour un partenaire catalogue ou octroi admin. */
export async function resolvePartnerOfferingContext(
  partnerId: string | null | undefined,
  displayName: string | null | undefined,
): Promise<{
  partnerUserId: string | null;
  establishmentId: string | null;
  contentId: string | null;
  contentType: 'event' | 'spot' | 'tool' | null;
  contentTitle: string | null;
}> {
  const identity = await resolvePartnerIdentity(partnerId, displayName);
  const partnerUserId = identity.userId;
  let establishmentId: string | null = null;

  for (const key of identity.keys) {
    if (!isUuid(key)) continue;
    if (key === partnerUserId) continue;
    establishmentId = key;
    break;
  }

  return {
    partnerUserId,
    establishmentId,
    contentId: establishmentId,
    contentType: establishmentId ? 'spot' : null,
    contentTitle: displayName?.trim() || null,
  };
}
