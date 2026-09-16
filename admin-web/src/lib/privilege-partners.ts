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

  options.push({ ...WIDE_OPTION });

  let eventsQ = supabase
    .from('events')
    .select('id, title, partner_user_id, country_code, content_status, is_active')
    .eq('content_status', 'published')
    .eq('is_active', true)
    .eq('partner_user_id', input.partnerUserId);
  if (cc) eventsQ = eventsQ.eq('country_code', cc);
  const eventsRes = await eventsQ.limit(100);

  let spotsQ = supabase
    .from('establishments')
    .select('id, name, partner_user_id, country_code, content_status, is_active, category_slugs')
    .eq('content_status', 'published')
    .eq('is_active', true)
    .eq('partner_user_id', input.partnerUserId);
  if (cc) spotsQ = spotsQ.eq('country_code', cc);
  const spotsRes = await spotsQ.limit(100);

  let toolsQ = supabase
    .from('tools')
    .select('id, name, partner_user_id, country_code, content_status, is_active')
    .eq('content_status', 'published')
    .eq('is_active', true)
    .eq('partner_user_id', input.partnerUserId);
  if (cc) toolsQ = toolsQ.eq('country_code', cc);
  const toolsRes = await toolsQ.limit(100);

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
