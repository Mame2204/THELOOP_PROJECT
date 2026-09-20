import AsyncStorage from '@react-native-async-storage/async-storage';
import { THE_LOOP_ORGANIZER_LABEL, isTeamContentOrigin, type ContentOrigin } from '@/lib/content-origin';
import { normalizePartnerName } from '@/lib/partner-name-utils';
import { isNetworkOnline, readLocalCache, writeLocalCache } from '@/lib/offline-store';
import { listPartnerDirectory } from '@/lib/partner-directory-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { undefinedIfNull } from '@/lib/supabase-types';

const KEY = 'loop_partner_validation_codes_v1';

/** Clé stable partagée — super admin + admins délégués (contenus équipe THE LOOP). */
export const THE_LOOP_TEAM_PARTNER_KEY = 'theloop-team';
export const THE_LOOP_TEAM_PARTNER_NAME = THE_LOOP_ORGANIZER_LABEL;

export interface PartnerValidationCode {
  partnerId: string;
  partnerName: string;
  code: string;
  createdAt: string;
}

type PartnerCodeRow = {
  partner_key: string;
  partner_name: string;
  validation_code: string;
};

function generateCodeSuffix(length = 5): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function formatPartnerValidationCode(suffix: string): string {
  return `CODE-${suffix.toUpperCase()}`;
}

export function normalizePartnerValidationCode(input: string): string {
  const raw = input.trim().toUpperCase().replace(/\s/g, '');
  if (raw.startsWith('CODE-')) return raw;
  if (raw.startsWith('CODE')) return formatPartnerValidationCode(raw.slice(4));
  return formatPartnerValidationCode(raw);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isTheLoopTeamPartnerKey(partnerKey: string | null | undefined): boolean {
  return partnerKey?.trim() === THE_LOOP_TEAM_PARTNER_KEY;
}

export function isTheLoopTeamPartnerName(partnerName: string | null | undefined): boolean {
  const norm = partnerName?.trim() ? normalizePartnerName(partnerName) : '';
  if (!norm) return false;
  return norm === normalizePartnerName(THE_LOOP_TEAM_PARTNER_NAME);
}

function parsePartnerUserId(partnerId: string): string | null {
  const userPrefix = /^user:([0-9a-f-]{36})$/i.exec(partnerId.trim());
  if (userPrefix) return userPrefix[1];
  return isUuid(partnerId) ? partnerId : null;
}

async function isEstablishmentId(id: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { data } = await supabase.from('establishments').select('id').eq('id', id).maybeSingle();
  return Boolean(data?.id);
}

async function isUserId(id: string): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const { data } = await supabase.from('users').select('id').eq('id', id).maybeSingle();
  return Boolean(data?.id);
}

/** Sépare user_id et establishment_id — un UUID compte ≠ un UUID établissement. */
async function resolveCodeRemoteLinks(
  partnerId: string,
  partnerName: string,
): Promise<{ stableKey: string; establishmentId: string | null; userId: string | null }> {
  if (isTheLoopTeamPartnerKey(partnerId) || isTheLoopTeamPartnerName(partnerName)) {
    return { stableKey: THE_LOOP_TEAM_PARTNER_KEY, establishmentId: null, userId: null };
  }

  const stableKey = await resolveStablePartnerKey(partnerId, partnerName);
  const candidateUserId = parsePartnerUserId(partnerId);

  if (!(await isNetworkOnline()) || !isSupabaseConfigured() || !supabase) {
    const userId = candidateUserId && stableKey === candidateUserId ? candidateUserId : null;
    const establishmentId =
      isUuid(stableKey) && stableKey !== candidateUserId ? stableKey : null;
    return { stableKey, establishmentId, userId };
  }

  let establishmentId: string | null = null;
  let userId: string | null = null;

  if (isUuid(stableKey) && (await isEstablishmentId(stableKey))) {
    establishmentId = stableKey;
  }

  if (candidateUserId && (await isUserId(candidateUserId))) {
    userId = candidateUserId;
  }

  return { stableKey, establishmentId, userId };
}

/** Identifiant stable partagé entre appareils (UUID établissement si possible). */
export async function resolveStablePartnerKey(
  userId: string,
  partnerName: string | null | undefined,
): Promise<string> {
  if (isTheLoopTeamPartnerKey(userId) || isTheLoopTeamPartnerName(partnerName)) {
    return THE_LOOP_TEAM_PARTNER_KEY;
  }
  if (isUuid(userId)) return userId;

  if (isSupabaseConfigured() && supabase) {
    const name = partnerName?.trim() ?? '';
    if (name) {
      const { data } = await supabase
        .from('establishments')
        .select('id')
        .eq('is_active', true)
        .ilike('name', name)
        .maybeSingle();
      if (data?.id) return String(data.id);
    }
  }

  return userId;
}

async function loadAll(): Promise<PartnerValidationCode[]> {
  const cached = await readLocalCache<PartnerValidationCode[]>(KEY);
  if (cached?.length) return cached;

  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PartnerValidationCode[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveAll(items: PartnerValidationCode[]): Promise<void> {
  await writeLocalCache(KEY, items);
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

function toEntry(row: PartnerCodeRow): PartnerValidationCode {
  return {
    partnerId: row.partner_key,
    partnerName: row.partner_name,
    code: normalizePartnerValidationCode(row.validation_code),
    createdAt: new Date().toISOString(),
  };
}

function canUseRemotePartnerCodes(): boolean {
  return isSupabaseConfigured() && Boolean(supabase);
}

async function fetchRemoteByPartnerKey(partnerKey: string): Promise<PartnerValidationCode | null> {
  if (!canUseRemotePartnerCodes() || !supabase) return null;
  const { data, error } = await supabase
    .from('partner_validation_codes')
    .select('partner_key, partner_name, validation_code')
    .eq('partner_key', partnerKey)
    .maybeSingle();
  if (error || !data) return null;
  return toEntry(data as PartnerCodeRow);
}

/** Recherche Supabase par code — RPC puis lecture directe (secours si RPC indisponible). */
async function fetchRemoteByCode(code: string): Promise<PartnerValidationCode | null> {
  if (!canUseRemotePartnerCodes() || !supabase) return null;
  const normalized = normalizePartnerValidationCode(code);

  const { data: rpcData, error: rpcError } = await supabase.rpc('find_partner_by_validation_code', {
    p_code: normalized,
  });
  if (!rpcError && rpcData) {
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    if (row) return toEntry(row as PartnerCodeRow);
  } else if (rpcError) {
    console.warn('[PartnerCode] RPC find:', rpcError.message);
  }

  const { data, error } = await supabase
    .from('partner_validation_codes')
    .select('partner_key, partner_name, validation_code')
    .eq('validation_code', normalized)
    .maybeSingle();

  if (error) {
    console.warn('[PartnerCode] select by code:', error.message);
    return null;
  }
  if (!data) return null;
  return toEntry(data as PartnerCodeRow);
}

async function ensureRemoteCode(
  partnerKey: string,
  partnerName: string,
  establishmentId?: string | null,
  userId?: string | null,
): Promise<PartnerValidationCode | null> {
  if (!canUseRemotePartnerCodes() || !supabase) return null;
  if (!(await isNetworkOnline())) return null;

  const existing = await fetchRemoteByPartnerKey(partnerKey);
  if (existing) return existing;

  const { data, error } = await supabase.rpc('ensure_partner_validation_code', {
    p_partner_key: partnerKey,
    p_partner_name: partnerName,
    p_establishment_id: undefinedIfNull(establishmentId ?? null),
    p_user_id: undefinedIfNull(userId && isUuid(userId) ? userId : null),
  });
  if (!error && data) {
    const row = Array.isArray(data) ? data[0] : data;
    if (row) return toEntry(row as PartnerCodeRow);
  }
  if (error) {
    console.warn('[PartnerCode] ensure RPC:', error.message);
  }

  const code = formatPartnerValidationCode(generateCodeSuffix());
  const { data: inserted, error: insertError } = await supabase
    .from('partner_validation_codes')
    .insert({
      partner_key: partnerKey,
      partner_name: partnerName,
      validation_code: code,
      establishment_id: establishmentId ?? null,
      user_id: userId && isUuid(userId) ? userId : null,
    })
    .select('partner_key, partner_name, validation_code')
    .maybeSingle();

  if (insertError) {
    console.warn('[PartnerCode] ensure insert:', insertError.message);
    return fetchRemoteByPartnerKey(partnerKey);
  }
  if (!inserted) return null;
  return toEntry(inserted as PartnerCodeRow);
}

async function cacheEntry(entry: PartnerValidationCode): Promise<void> {
  const all = await loadAll();
  const normalizedCode = normalizePartnerValidationCode(entry.code);
  const idx = all.findIndex(
    (e) =>
      e.partnerId === entry.partnerId ||
      e.code === normalizedCode ||
      normalizePartnerNameKey(e.partnerName) === normalizePartnerNameKey(entry.partnerName),
  );
  const next = { ...entry, code: normalizedCode };
  if (idx >= 0) all[idx] = next;
  else all.push(next);
  await saveAll(all);
}

function normalizePartnerNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Tente de récupérer le code Supabase pour tous les identifiants possibles du partenaire. */
async function resolveRemotePartnerCode(
  partnerId: string,
  partnerName: string,
): Promise<PartnerValidationCode | null> {
  const { stableKey, establishmentId, userId } = await resolveCodeRemoteLinks(partnerId, partnerName);
  const keys = new Set<string>([stableKey, partnerId]);
  if (userId) keys.add(userId);
  if (establishmentId) keys.add(establishmentId);

  for (const key of keys) {
    const byKey = await fetchRemoteByPartnerKey(key);
    if (byKey) return byKey;
  }

  return ensureRemoteCode(stableKey, partnerName, establishmentId, userId);
}

export async function ensurePartnerValidationCodes(countryCode?: string): Promise<PartnerValidationCode[]> {
  const directory = await listPartnerDirectory(countryCode);
  const existing = await loadAll();
  const byPartner = new Map(existing.map((e) => [e.partnerId, e]));
  let changed = false;

  for (const partner of directory) {
    const stableKey = await resolveStablePartnerKey(partner.id, partner.name);
    if (byPartner.has(stableKey) || byPartner.has(partner.id)) continue;

    const establishmentId = partner.source === 'establishment' ? partner.id : null;
    const userId = partner.source === 'partner_user' ? parsePartnerUserId(partner.id) : null;
    const remote = await ensureRemoteCode(stableKey, partner.name, establishmentId, userId);

    if (remote) {
      byPartner.set(stableKey, remote);
      changed = true;
      continue;
    }

    if (!canUseRemotePartnerCodes() || !(await isNetworkOnline())) {
      const entry: PartnerValidationCode = {
        partnerId: stableKey,
        partnerName: partner.name,
        code: formatPartnerValidationCode(generateCodeSuffix()),
        createdAt: new Date().toISOString(),
      };
      byPartner.set(stableKey, entry);
      changed = true;
    }
  }

  if (changed) await saveAll(Array.from(byPartner.values()));
  return Array.from(byPartner.values());
}

/** Code partenaire unique pour toute l'équipe THE LOOP (admins + super admin). */
export async function getOrCreateTheLoopTeamValidationCode(): Promise<PartnerValidationCode> {
  const remote = await resolveRemotePartnerCode(THE_LOOP_TEAM_PARTNER_KEY, THE_LOOP_TEAM_PARTNER_NAME);
  if (remote) {
    await cacheEntry(remote);
    return remote;
  }

  const all = await loadAll();
  const found = all.find((e) => isTheLoopTeamPartnerKey(e.partnerId));
  if (found) return found;

  const entry: PartnerValidationCode = {
    partnerId: THE_LOOP_TEAM_PARTNER_KEY,
    partnerName: THE_LOOP_TEAM_PARTNER_NAME,
    code: formatPartnerValidationCode(generateCodeSuffix()),
    createdAt: new Date().toISOString(),
  };
  all.push(entry);
  await saveAll(all);
  return entry;
}

export async function getOrCreatePartnerValidationCode(
  partnerId: string,
  partnerName: string,
): Promise<PartnerValidationCode> {
  if (isTheLoopTeamPartnerKey(partnerId) || isTheLoopTeamPartnerName(partnerName)) {
    return getOrCreateTheLoopTeamValidationCode();
  }

  const links = await resolveCodeRemoteLinks(partnerId, partnerName);
  const remote = await resolveRemotePartnerCode(partnerId, partnerName);
  if (remote) {
    await cacheEntry(remote);
    return remote;
  }

  const { stableKey } = links;
  const all = await loadAll();
  const found =
    all.find((e) => e.partnerId === stableKey || e.partnerId === partnerId) ??
    all.find((e) => normalizePartnerNameKey(e.partnerName) === normalizePartnerNameKey(partnerName));

  if (found) {
    if (canUseRemotePartnerCodes() && (await isNetworkOnline())) {
      const synced = await resolveRemotePartnerCode(partnerId, partnerName);
      if (synced) {
        await cacheEntry(synced);
        return synced;
      }
    }
    return found;
  }

  if (canUseRemotePartnerCodes() && (await isNetworkOnline())) {
    const created = await ensureRemoteCode(
      stableKey,
      partnerName,
      links.establishmentId,
      links.userId,
    );
    if (created) {
      await cacheEntry(created);
      return created;
    }
  }

  const entry: PartnerValidationCode = {
    partnerId: stableKey,
    partnerName,
    code: formatPartnerValidationCode(generateCodeSuffix()),
    createdAt: new Date().toISOString(),
  };
  all.push(entry);
  await saveAll(all);
  return entry;
}

async function fetchPublishedContentOrigins(contentId: string): Promise<ContentOrigin[]> {
  if (!canUseRemotePartnerCodes() || !supabase || !(await isNetworkOnline())) return [];

  const [est, evt, spotSub, eventSub] = await Promise.all([
    supabase.from('establishments').select('content_origin').eq('id', contentId).maybeSingle(),
    supabase.from('events').select('content_origin').eq('id', contentId).maybeSingle(),
    supabase
      .from('partner_spot_submissions')
      .select('content_origin')
      .or(`published_establishment_id.eq.${contentId},published_tool_id.eq.${contentId}`)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('partner_event_submissions')
      .select('content_origin')
      .eq('published_event_id', contentId)
      .limit(1)
      .maybeSingle(),
  ]);

  return [
    est.data?.content_origin as ContentOrigin | null | undefined,
    evt.data?.content_origin as ContentOrigin | null | undefined,
    spotSub.data?.content_origin as ContentOrigin | null | undefined,
    eventSub.data?.content_origin as ContentOrigin | null | undefined,
  ].filter((origin): origin is ContentOrigin => Boolean(origin));
}

async function fetchPublishedContentOrigin(contentId: string): Promise<ContentOrigin | null> {
  const origins = await fetchPublishedContentOrigins(contentId);
  for (const origin of origins) {
    if (isTeamContentOrigin(origin)) return origin;
  }
  return null;
}

async function isPublishedPartnerOwnedContent(contentId: string): Promise<boolean> {
  const origins = await fetchPublishedContentOrigins(contentId);
  return origins.some((origin) => origin === 'partner');
}

/**
 * Résout le CODE partenaire pour une utilisation depuis une fiche contenu.
 * Priorité : contenu équipe THE LOOP → establishment_id → partner_key → propriétaire partenaire.
 */
export async function resolvePartnerValidationCodeForContent(
  partnerId: string,
  partnerName: string,
  contentId?: string | null,
): Promise<PartnerValidationCode> {
  const cid = contentId?.trim();
  if (cid) {
    const teamOrigin = await fetchPublishedContentOrigin(cid);
    if (teamOrigin) {
      return getOrCreateTheLoopTeamValidationCode();
    }
  }

  if (isTheLoopTeamPartnerName(partnerName) && !isUuid(partnerId)) {
    return getOrCreateTheLoopTeamValidationCode();
  }

  if (cid && canUseRemotePartnerCodes() && supabase && (await isNetworkOnline())) {
    const partnerOwned = await isPublishedPartnerOwnedContent(cid);

    if (!partnerOwned) {
      const { data: byEst } = await supabase
        .from('partner_validation_codes')
        .select('partner_key, partner_name, validation_code')
        .eq('establishment_id', cid)
        .maybeSingle();
      if (byEst) {
        const entry = toEntry(byEst as PartnerCodeRow);
        await cacheEntry(entry);
        return entry;
      }
    }

    const { data: byKey } = await supabase
      .from('partner_validation_codes')
      .select('partner_key, partner_name, validation_code')
      .eq('partner_key', cid)
      .maybeSingle();
    if (byKey) {
      const entry = toEntry(byKey as PartnerCodeRow);
      await cacheEntry(entry);
      return entry;
    }

    // Soumission spot/event publiée → propriétaire du code
    const [spotSub, eventSub] = await Promise.all([
      supabase
        .from('partner_spot_submissions')
        .select('partner_user_id, name, content_origin')
        .or(`published_establishment_id.eq.${cid},published_tool_id.eq.${cid}`)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('partner_event_submissions')
        .select('partner_user_id, title, content_origin')
        .eq('published_event_id', cid)
        .limit(1)
        .maybeSingle(),
    ]);

    const submissionOrigin =
      (spotSub.data?.content_origin as ContentOrigin | null | undefined) ??
      (eventSub.data?.content_origin as ContentOrigin | null | undefined);
    if (submissionOrigin && isTeamContentOrigin(submissionOrigin)) {
      return getOrCreateTheLoopTeamValidationCode();
    }

    const ownerId =
      (spotSub.data?.partner_user_id ? String(spotSub.data.partner_user_id) : null) ??
      (eventSub.data?.partner_user_id ? String(eventSub.data.partner_user_id) : null);
    const label =
      (typeof spotSub.data?.name === 'string' && spotSub.data.name) ||
      (typeof eventSub.data?.title === 'string' && eventSub.data.title) ||
      partnerName;
    if (ownerId) {
      const byOwner = await fetchRemoteByPartnerKey(ownerId);
      if (byOwner) {
        await cacheEntry(byOwner);
        return byOwner;
      }
      return getOrCreatePartnerValidationCode(ownerId, label);
    }
  }

  if (isTheLoopTeamPartnerName(partnerName)) {
    return getOrCreateTheLoopTeamValidationCode();
  }

  return getOrCreatePartnerValidationCode(partnerId, partnerName);
}

export async function findPartnerByValidationCode(code: string): Promise<PartnerValidationCode | null> {
  const normalized = normalizePartnerValidationCode(code);
  if (!/^CODE-[A-Z0-9]{5}$/.test(normalized)) return null;

  const all = await loadAll();
  const local = all.find((e) => normalizePartnerValidationCode(e.code) === normalized) ?? null;

  if (await isNetworkOnline()) {
    const remote = await fetchRemoteByCode(normalized);
    if (remote) {
      await cacheEntry(remote);
      return remote;
    }
  }

  return local;
}

export async function listPartnerValidationCodes(): Promise<PartnerValidationCode[]> {
  return ensurePartnerValidationCodes();
}
