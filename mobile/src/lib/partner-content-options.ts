import { matchesAdminCountry } from '@/lib/admin-country';
import { isTeamContentOrigin } from '@/lib/content-origin';
import { loadContentSnapshot, peekContentSnapshot, type ContentSnapshot } from '@/lib/content-store';
import { isToolLocation } from '@/lib/location-kind-utils';
import type { PartnerDirectoryEntry } from '@/lib/partner-directory-store';
import { partnerAccountDisplayName } from '@/lib/partner-directory-store';
import { resolvePartnerQueryUserId } from '@/lib/partner-catalog-ids';
import { getPartnerAuthUserIdFromSession } from '@/lib/partner-spot-auth';
import {
  establishmentTypeLabel,
  type PartnerEstablishmentType,
} from '@/lib/partner-establishments';
import { isNetworkOnline } from '@/lib/offline-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const PARTNER_WIDE_CONTENT_KEY = '__partner_wide__';

export interface PartnerContentOption {
  key: string;
  contentId: string | null;
  contentType: PartnerEstablishmentType | null;
  title: string;
  subtitle: string;
}

export interface ListPartnerContentOptionsParams {
  countryCode?: string;
  partnerAccount?: PartnerDirectoryEntry | null;
}

const contentOptionsCache = new Map<string, { at: number; data: PartnerContentOption[] }>();
const contentOptionsInflight = new Map<string, Promise<PartnerContentOption[]>>();
const CONTENT_OPTIONS_CACHE_MS = 90_000;

function contentKey(type: PartnerEstablishmentType | 'partner', id: string | null): string {
  if (type === 'partner') return PARTNER_WIDE_CONTENT_KEY;
  return `${type}:${id}`;
}

const PARTNER_WIDE_OPTION: PartnerContentOption = {
  key: PARTNER_WIDE_CONTENT_KEY,
  contentId: null,
  contentType: null,
  title: 'Tous les établissements',
  subtitle: 'Valable chez ce partenaire (sans lieu précis)',
};

/** Compte super admin / équipe THE LOOP (offrant des avantages sur contenu équipe). */
export function isTheLoopOfferingAccount(account: PartnerDirectoryEntry | null | undefined): boolean {
  if (!account) return false;
  const company = account.company?.trim().toUpperCase();
  if (company === 'THE LOOP') return true;
  // Entrées répertoire super admin : « THE LOOP · Prénom Nom »
  return /^THE LOOP\s*·/i.test(account.name.trim());
}

export function invalidatePartnerContentOptionsCache(): void {
  contentOptionsCache.clear();
  contentOptionsInflight.clear();
}

export function defaultPartnerWideContentOption(): PartnerContentOption {
  return { ...PARTNER_WIDE_OPTION };
}

export function getCachedPartnerContentOptions(
  partnerUserId: string,
  params?: ListPartnerContentOptionsParams,
): PartnerContentOption[] | null {
  const isLoop = isTheLoopOfferingAccount(params?.partnerAccount);
  const cacheKey = isLoop
    ? `loop:${params?.countryCode ?? 'all'}`
    : `partner:${partnerUserId}`;
  const cached = contentOptionsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CONTENT_OPTIONS_CACHE_MS) {
    return cached.data;
  }
  return null;
}

function buildTheLoopTeamContentOptions(snapshot: ContentSnapshot, countryCode?: string): PartnerContentOption[] {
  const options: PartnerContentOption[] = [];
  const seen = new Set<string>();

  for (const event of snapshot.events) {
    if (!isTeamContentOrigin(event.contentOrigin)) continue;
    if (event.status !== 'published' || event.isActive === false) continue;
    if (countryCode && !matchesAdminCountry(event.countryCode, countryCode)) continue;
    const key = contentKey('event', event.id);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      key,
      contentId: event.id,
      contentType: 'event',
      title: event.title,
      subtitle: establishmentTypeLabel('event'),
    });
  }

  for (const location of snapshot.locations) {
    if (!isTeamContentOrigin(location.contentOrigin)) continue;
    if (location.isActive === false || location.hidden) continue;
    if (countryCode && !matchesAdminCountry(location.countryCode, countryCode)) continue;
    const isTool = isToolLocation(location);
    const type: PartnerEstablishmentType = isTool ? 'tool' : 'spot';
    const key = contentKey(type, location.id);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      key,
      contentId: location.id,
      contentType: type,
      title: location.name,
      subtitle: establishmentTypeLabel(type),
    });
  }

  return options.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
}

async function listTheLoopTeamContentOptions(countryCode?: string): Promise<PartnerContentOption[]> {
  const cacheKey = `loop:${countryCode ?? 'all'}`;
  let snapshot = await peekContentSnapshot();
  if (!snapshot.events.length && !snapshot.locations.length) {
    snapshot = await loadContentSnapshot();
  }
  const options = buildTheLoopTeamContentOptions(snapshot, countryCode);
  if (options.length) {
    contentOptionsCache.set(cacheKey, { at: Date.now(), data: options });
  }
  return options;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function fetchPartnerPublishedContentIds(queryUserId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!isSupabaseConfigured() || !supabase || !isUuid(queryUserId) || !(await isNetworkOnline())) {
    return ids;
  }

  const authUserId = await getPartnerAuthUserIdFromSession();
  if (authUserId && authUserId === queryUserId) {
    try {
      const { data, error } = await supabase.rpc('list_my_partner_published_content_ids');
      if (!error && data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            const id = typeof entry === 'string' ? entry : String(entry ?? '').trim();
            if (id) ids.add(id);
          }
        }
      }
    } catch {
      /* RPC indisponible */
    }
  }

  const [spotSubs, eventSubs] = await Promise.all([
    supabase
      .from('partner_spot_submissions')
      .select('published_establishment_id, published_tool_id')
      .eq('partner_user_id', queryUserId)
      .in('status', ['approved', 'pending'])
      .limit(15),
    supabase
      .from('partner_event_submissions')
      .select('published_event_id')
      .eq('partner_user_id', queryUserId)
      .in('status', ['approved', 'pending'])
      .limit(15),
  ]);

  if (spotSubs.error) {
    console.warn('[PartnerContentOptions] spot submissions:', spotSubs.error.message);
  }
  if (eventSubs.error) {
    console.warn('[PartnerContentOptions] event submissions:', eventSubs.error.message);
  }

  for (const row of spotSubs.data ?? []) {
    if (row.published_establishment_id) ids.add(String(row.published_establishment_id));
    if (row.published_tool_id) ids.add(String(row.published_tool_id));
  }
  for (const row of eventSubs.data ?? []) {
    if (row.published_event_id) ids.add(String(row.published_event_id));
  }
  return ids;
}

async function appendPartnerOptionsFromSubmissions(
  partnerUserId: string,
  partnerName: string | undefined,
  addOption: (option: PartnerContentOption) => void,
): Promise<void> {
  const queryUserId = (await resolvePartnerQueryUserId(partnerUserId, partnerName)) ?? partnerUserId;
  if (!isUuid(queryUserId) || !isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return;

  const [spotSubs, eventSubs] = await Promise.all([
    supabase
      .from('partner_spot_submissions')
      .select('name, sub_category, published_establishment_id, published_tool_id')
      .eq('partner_user_id', queryUserId)
      .eq('status', 'approved')
      .limit(15),
    supabase
      .from('partner_event_submissions')
      .select('title, published_event_id')
      .eq('partner_user_id', queryUserId)
      .eq('status', 'approved')
      .limit(15),
  ]);

  if (spotSubs.error) {
    console.warn('[PartnerContentOptions] spot submissions:', spotSubs.error.message);
  }
  if (eventSubs.error) {
    console.warn('[PartnerContentOptions] event submissions:', eventSubs.error.message);
  }

  for (const row of spotSubs.data ?? []) {
    const isTool = String(row.sub_category ?? '') === 'tools';
    const publishedId = (isTool ? row.published_tool_id : row.published_establishment_id)?.trim();
    if (!publishedId) continue;
    const type: PartnerEstablishmentType = isTool ? 'tool' : 'spot';
    addOption({
      key: contentKey(type, publishedId),
      contentId: publishedId,
      contentType: type,
      title: String(row.name),
      subtitle: establishmentTypeLabel(type),
    });
  }

  for (const row of eventSubs.data ?? []) {
    const publishedId = row.published_event_id?.trim();
    if (!publishedId) continue;
    addOption({
      key: contentKey('event', publishedId),
      contentId: publishedId,
      contentType: 'event',
      title: String(row.title),
      subtitle: establishmentTypeLabel('event'),
    });
  }
}

async function appendPartnerOptionsFromSnapshot(
  partnerUserId: string,
  partnerName: string | undefined,
  countryCode: string | undefined,
  addOption: (option: PartnerContentOption) => void,
): Promise<void> {
  const queryUserId = (await resolvePartnerQueryUserId(partnerUserId, partnerName)) ?? partnerUserId;
  const publishedIds = isUuid(queryUserId) ? await fetchPartnerPublishedContentIds(queryUserId) : new Set<string>();

  let staffIds = new Set<string>();
  if (isSupabaseConfigured() && supabase && isUuid(queryUserId)) {
    try {
      const { data: staffId } = await supabase.rpc('ensure_partner_staff', { p_user_id: queryUserId });
      if (staffId) staffIds.add(String(staffId));
    } catch {
      /* ignore */
    }
    const { data: staffRows } = await supabase.from('partner_staff').select('id').eq('user_id', queryUserId).limit(15);
    for (const row of staffRows ?? []) staffIds.add(String(row.id));
    staffIds.add(queryUserId);
  }

  let snapshot = await peekContentSnapshot();
  if (!snapshot.events.length && !snapshot.locations.length && publishedIds.size > 0) {
    try {
      snapshot = await loadContentSnapshot();
    } catch {
      /* peek vide : les soumissions suffisent */
    }
  }

  for (const event of snapshot.events) {
    if (event.status !== 'published') continue;
    if (countryCode && !matchesAdminCountry(event.countryCode, countryCode)) continue;
    const owned =
      publishedIds.has(event.id)
      || event.partnerId === queryUserId
      || (event.masterId != null && staffIds.has(String(event.masterId)));
    if (!owned) continue;
    addOption({
      key: contentKey('event', event.id),
      contentId: event.id,
      contentType: 'event',
      title: event.title,
      subtitle: establishmentTypeLabel('event'),
    });
  }

  for (const location of snapshot.locations) {
    if (location.isActive === false || location.hidden) continue;
    if (countryCode && !matchesAdminCountry(location.countryCode, countryCode)) continue;
    const loc = location as { partnerId?: string | null; masterId?: string | null };
    const owned =
      publishedIds.has(location.id)
      || (loc.partnerId != null && staffIds.has(String(loc.partnerId)))
      || (loc.masterId != null && staffIds.has(String(loc.masterId)));
    if (!owned) continue;
    const isTool = isToolLocation(location);
    const type: PartnerEstablishmentType = isTool ? 'tool' : 'spot';
    addOption({
      key: contentKey(type, location.id),
      contentId: location.id,
      contentType: type,
      title: location.name,
      subtitle: establishmentTypeLabel(type),
    });
  }
}

function pushUniqueOption(
  options: PartnerContentOption[],
  seen: Set<string>,
  option: PartnerContentOption,
): void {
  if (seen.has(option.key)) return;
  seen.add(option.key);
  options.push(option);
}

async function listRegularPartnerContentOptions(
  partnerUserId: string,
  partnerAccount?: PartnerDirectoryEntry | null,
  countryCode?: string,
): Promise<PartnerContentOption[]> {
  const options: PartnerContentOption[] = [{ ...PARTNER_WIDE_OPTION }];
  const seen = new Set<string>([PARTNER_WIDE_CONTENT_KEY]);
  const partnerName = partnerAccount ? partnerAccountDisplayName(partnerAccount) : undefined;

  const addOption = (option: PartnerContentOption) => pushUniqueOption(options, seen, option);

  await appendPartnerOptionsFromSubmissions(partnerUserId, partnerName, addOption);

  try {
    await appendPartnerOptionsFromSnapshot(partnerUserId, partnerName, countryCode, addOption);
  } catch (error) {
    console.warn('[PartnerContentOptions] snapshot partenaire:', error);
  }

  return options.sort((a, b) => {
    if (a.key === PARTNER_WIDE_CONTENT_KEY) return -1;
    if (b.key === PARTNER_WIDE_CONTENT_KEY) return 1;
    return a.title.localeCompare(b.title, 'fr');
  });
}

/** Lieux où un avantage peut s'appliquer : événement, spot, outil ou tout le partenaire. */
export async function listPartnerContentOptions(
  partnerUserId: string,
  params?: ListPartnerContentOptionsParams,
): Promise<PartnerContentOption[]> {
  const isLoop = isTheLoopOfferingAccount(params?.partnerAccount);
  const cacheKey = isLoop
    ? `loop:${params?.countryCode ?? 'all'}`
    : `partner:${partnerUserId}`;

  const cached = contentOptionsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CONTENT_OPTIONS_CACHE_MS) {
    return cached.data;
  }

  const inflight = contentOptionsInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = (async () => {
    const result = isLoop
      ? await listTheLoopTeamContentOptions(params?.countryCode)
      : await listRegularPartnerContentOptions(partnerUserId, params?.partnerAccount, params?.countryCode);

    if (result.length > 0) {
      contentOptionsCache.set(cacheKey, { at: Date.now(), data: result });
    }
    return result;
  })().finally(() => {
    contentOptionsInflight.delete(cacheKey);
  });

  contentOptionsInflight.set(cacheKey, promise);
  return promise;
}

export function formatOfferingScopeLabel(contentType?: string | null, contentTitle?: string | null): string {
  if (!contentType || !contentTitle?.trim()) return 'Tous lieux';
  return `${establishmentTypeLabel(contentType as PartnerEstablishmentType)} · ${contentTitle.trim()}`;
}
