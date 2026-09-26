import { supabase } from './supabase';
import type { BenefitOfferingPartner } from './privileges';

export interface PartnerAccountRow {
  id: string;
  userId: string;
  name: string;
  company: string | null;
  isTheLoop: boolean;
}

export interface PartnerContentOptionRow {
  key: string;
  contentId: string | null;
  contentType: 'event' | 'spot' | 'tool' | null;
  title: string;
  subtitle: string;
}

export const PARTNER_WIDE_CONTENT_KEY = '__partner_wide__';

const WIDE_OPTION: PartnerContentOptionRow = {
  key: PARTNER_WIDE_CONTENT_KEY,
  contentId: null,
  contentType: null,
  title: 'Tous les établissements',
  subtitle: 'Valable chez ce partenaire (sans lieu précis)',
};

export function isTheLoopOfferingAccount(account: Pick<PartnerAccountRow, 'name' | 'company'>): boolean {
  const company = account.company?.trim().toUpperCase();
  if (company === 'THE LOOP') return true;
  return /^THE LOOP\s*·/i.test(account.name.trim());
}

export async function listPartnerOfferingAccounts(
  countryCode: string,
): Promise<{ items: PartnerAccountRow[]; error?: string }> {
  const cc = countryCode.toUpperCase().slice(0, 2);
  const byUserId = new Map<string, PartnerAccountRow>();

  let partnersQ = supabase
    .from('users')
    .select('id, first_name, last_name, email, company, country_code, user_role')
    .in('user_role', ['partner', 'super_admin'])
    .eq('is_active', true)
    .order('email')
    .limit(200);
  if (cc) partnersQ = partnersQ.eq('country_code', cc);
  const { data: users, error } = await partnersQ;
  if (error) return { items: [], error: error.message };

  for (const row of users ?? []) {
    const userId = String(row.id);
    const role = String(row.user_role ?? '').toLowerCase();
    const personal = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || String(row.email ?? '');
    const company = row.company ? String(row.company).trim() : null;
    const name =
      role === 'super_admin'
        ? `THE LOOP · ${personal}`
        : company || personal;
    if (!name) continue;
    byUserId.set(userId, {
      id: `user:${userId}`,
      userId,
      name,
      company: role === 'super_admin' ? 'THE LOOP' : company,
      isTheLoop: role === 'super_admin' || company?.toUpperCase() === 'THE LOOP',
    });
  }

  const { data: tokenRows } = await supabase.rpc('list_partner_token_directory');
  for (const token of tokenRows ?? []) {
    if (!token.user_id) continue;
    const userId = String(token.user_id);
    const tokenName = String(token.partner_name ?? '').trim();
    if (!tokenName) continue;
    const prev = byUserId.get(userId);
    byUserId.set(userId, {
      id: `user:${userId}`,
      userId,
      name: tokenName,
      company: prev?.company ?? tokenName,
      isTheLoop: prev?.isTheLoop ?? false,
    });
  }

  return {
    items: [...byUserId.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  };
}

function teamOriginsFilter() {
  return ['admin', 'loop'];
}

/** IDs utilisés pour rattacher catalogue partenaire (user + lignes partner_staff). */
async function resolvePartnerOwnerIds(partnerUserId: string): Promise<string[]> {
  const ids = new Set<string>([partnerUserId]);
  const { data: staffRows } = await supabase.from('partner_staff').select('id').eq('user_id', partnerUserId);
  for (const row of staffRows ?? []) ids.add(String(row.id));
  const { data: rpcStaff } = await supabase.rpc('ensure_partner_staff', { p_user_id: partnerUserId });
  if (rpcStaff) ids.add(String(rpcStaff));
  return [...ids];
}

function pushUniqueOption(
  options: PartnerContentOptionRow[],
  seen: Set<string>,
  option: PartnerContentOptionRow,
): void {
  if (seen.has(option.key)) return;
  seen.add(option.key);
  options.push(option);
}

async function appendPartnerOptionsFromSubmissions(
  partnerUserId: string,
  cc: string,
  options: PartnerContentOptionRow[],
  seen: Set<string>,
): Promise<string | undefined> {
  const errors: string[] = [];
  let spotQ = supabase
    .from('partner_spot_submissions')
    .select('name, sub_category, published_establishment_id, published_tool_id, country_code')
    .eq('partner_user_id', partnerUserId)
    .eq('status', 'approved')
    .limit(50);
  if (cc) spotQ = spotQ.eq('country_code', cc);
  const spotSubs = await spotQ;

  let eventQ = supabase
    .from('partner_event_submissions')
    .select('title, published_event_id, country_code')
    .eq('partner_user_id', partnerUserId)
    .eq('status', 'approved')
    .limit(50);
  if (cc) eventQ = eventQ.eq('country_code', cc);
  const eventSubs = await eventQ;

  if (spotSubs.error) errors.push(spotSubs.error.message);
  if (eventSubs.error) errors.push(eventSubs.error.message);

  for (const row of spotSubs.data ?? []) {
    const isTool = String(row.sub_category ?? '') === 'tools';
    const publishedId = (isTool ? row.published_tool_id : row.published_establishment_id)?.trim();
    if (!publishedId) continue;
    const contentType = isTool ? 'tool' : 'spot';
    pushUniqueOption(options, seen, {
      key: `${contentType}:${publishedId}`,
      contentId: publishedId,
      contentType,
      title: String(row.name ?? ''),
      subtitle: isTool ? 'Outil' : 'Spot',
    });
  }
  for (const row of eventSubs.data ?? []) {
    const publishedId = row.published_event_id?.trim();
    if (!publishedId) continue;
    pushUniqueOption(options, seen, {
      key: `event:${publishedId}`,
      contentId: publishedId,
      contentType: 'event',
      title: String(row.title ?? ''),
      subtitle: 'Événement',
    });
  }
  return errors.length ? errors.join(' · ') : undefined;
}

async function appendPartnerOptionsFromCatalog(
  partnerUserId: string,
  ownerIds: string[],
  cc: string,
  options: PartnerContentOptionRow[],
  seen: Set<string>,
): Promise<string | undefined> {
  const errors: string[] = [];
  const masterFilter = ownerIds.length ? ownerIds : [partnerUserId];

  let eventsOrganizerQ = supabase
    .from('events')
    .select('id, title, country_code, content_status, is_active, organizer_id, master_id')
    .eq('content_status', 'published')
    .eq('is_active', true)
    .eq('organizer_id', partnerUserId);
  if (cc) eventsOrganizerQ = eventsOrganizerQ.eq('country_code', cc);
  const eventsByOrganizer = await eventsOrganizerQ.limit(100);

  let eventsMasterQ = supabase
    .from('events')
    .select('id, title, country_code, content_status, is_active, organizer_id, master_id')
    .eq('content_status', 'published')
    .eq('is_active', true)
    .in('master_id', masterFilter);
  if (cc) eventsMasterQ = eventsMasterQ.eq('country_code', cc);
  const eventsByMaster = await eventsMasterQ.limit(100);

  if (eventsByOrganizer.error) errors.push(eventsByOrganizer.error.message);
  if (eventsByMaster.error) errors.push(eventsByMaster.error.message);

  for (const row of [...(eventsByOrganizer.data ?? []), ...(eventsByMaster.data ?? [])]) {
    pushUniqueOption(options, seen, {
      key: `event:${row.id}`,
      contentId: String(row.id),
      contentType: 'event',
      title: String(row.title ?? ''),
      subtitle: 'Événement',
    });
  }

  let spotsQ = supabase
    .from('establishments')
    .select('id, name, country_code, content_status, is_active, category_slugs, master_id')
    .eq('content_status', 'published')
    .eq('is_active', true)
    .in('master_id', masterFilter);
  if (cc) spotsQ = spotsQ.eq('country_code', cc);
  const spotsRes = await spotsQ.limit(100);

  let toolsQ = supabase
    .from('tools')
    .select('id, name, country_code, content_status, is_active, master_id')
    .eq('content_status', 'published')
    .eq('is_active', true)
    .in('master_id', masterFilter);
  if (cc) toolsQ = toolsQ.eq('country_code', cc);
  const toolsRes = await toolsQ.limit(100);

  if (spotsRes.error) errors.push(spotsRes.error.message);
  if (toolsRes.error) errors.push(toolsRes.error.message);

  for (const row of spotsRes.data ?? []) {
    const slugs = Array.isArray(row.category_slugs) ? row.category_slugs.map(String) : [];
    if (slugs.includes('tools')) continue;
    pushUniqueOption(options, seen, {
      key: `spot:${row.id}`,
      contentId: String(row.id),
      contentType: 'spot',
      title: String(row.name ?? ''),
      subtitle: 'Spot',
    });
  }
  for (const row of toolsRes.data ?? []) {
    pushUniqueOption(options, seen, {
      key: `tool:${row.id}`,
      contentId: String(row.id),
      contentType: 'tool',
      title: String(row.name ?? ''),
      subtitle: 'Outil',
    });
  }

  return errors.length ? errors.join(' · ') : undefined;
}

export async function listPartnerContentOptions(input: {
  partnerUserId: string;
  countryCode: string;
  isTheLoop: boolean;
}): Promise<{ items: PartnerContentOptionRow[]; error?: string }> {
  const cc = input.countryCode.toUpperCase().slice(0, 2);
  const options: PartnerContentOptionRow[] = [];

  if (input.isTheLoop) {
    let eventsQ = supabase
      .from('events')
      .select('id, title, country_code, content_origin, content_status, is_active')
      .eq('content_status', 'published')
      .eq('is_active', true)
      .in('content_origin', teamOriginsFilter());
    if (cc) eventsQ = eventsQ.eq('country_code', cc);
    const eventsRes = await eventsQ.limit(200);

    let spotsQ = supabase
      .from('establishments')
      .select('id, name, country_code, content_origin, content_status, is_active, category_slugs')
      .eq('content_status', 'published')
      .eq('is_active', true)
      .in('content_origin', teamOriginsFilter());
    if (cc) spotsQ = spotsQ.eq('country_code', cc);
    const spotsRes = await spotsQ.limit(200);

    let toolsQ = supabase
      .from('tools')
      .select('id, name, country_code, content_origin, content_status, is_active')
      .eq('content_status', 'published')
      .eq('is_active', true)
      .in('content_origin', teamOriginsFilter());
    if (cc) toolsQ = toolsQ.eq('country_code', cc);
    const toolsRes = await toolsQ.limit(200);

    for (const row of eventsRes.data ?? []) {
      options.push({
        key: `event:${row.id}`,
        contentId: String(row.id),
        contentType: 'event',
        title: String(row.title ?? ''),
        subtitle: 'Événement',
      });
    }
    for (const row of spotsRes.data ?? []) {
      const slugs = Array.isArray(row.category_slugs) ? row.category_slugs.map(String) : [];
      if (slugs.includes('tools')) continue;
      options.push({
        key: `spot:${row.id}`,
        contentId: String(row.id),
        contentType: 'spot',
        title: String(row.name ?? ''),
        subtitle: 'Spot',
      });
    }
    for (const row of toolsRes.data ?? []) {
      options.push({
        key: `tool:${row.id}`,
        contentId: String(row.id),
        contentType: 'tool',
        title: String(row.name ?? ''),
        subtitle: 'Outil',
      });
    }
    return { items: options.sort((a, b) => a.title.localeCompare(b.title, 'fr')) };
  }

  const seen = new Set<string>([PARTNER_WIDE_CONTENT_KEY]);
  pushUniqueOption(options, seen, { ...WIDE_OPTION });

  const ownerIds = await resolvePartnerOwnerIds(input.partnerUserId);
  const subErr = await appendPartnerOptionsFromSubmissions(input.partnerUserId, cc, options, seen);
  const catErr = await appendPartnerOptionsFromCatalog(input.partnerUserId, ownerIds, cc, options, seen);

  const sorted = options.sort((a, b) => {
    if (a.key === PARTNER_WIDE_CONTENT_KEY) return -1;
    if (b.key === PARTNER_WIDE_CONTENT_KEY) return 1;
    return a.title.localeCompare(b.title, 'fr');
  });

  return { items: sorted, error: subErr ?? catErr };
}

export function offeringFromPartnerAndContent(
  account: PartnerAccountRow,
  content: PartnerContentOptionRow,
): BenefitOfferingPartner {
  return {
    partnerId: account.userId,
    displayName: account.name,
    contentId: content.contentId,
    contentType: content.contentType,
    contentTitle: content.title,
  };
}

export function formatOfferingScope(
  contentType: BenefitOfferingPartner['contentType'],
  contentTitle?: string | null,
): string {
  if (!contentType && !contentTitle) return 'Tous les établissements';
  const kind =
    contentType === 'event' ? 'Événement' : contentType === 'tool' ? 'Outil' : contentType === 'spot' ? 'Spot' : 'Lieu';
  return contentTitle ? `${kind} · ${contentTitle}` : kind;
}

export function offeringIdentityKey(partner: BenefitOfferingPartner): string {
  return `${partner.partnerId}|${partner.displayName}|${partner.contentId ?? ''}|${partner.contentType ?? ''}`;
}
