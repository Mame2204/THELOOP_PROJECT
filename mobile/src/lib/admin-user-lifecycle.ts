import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { setPhoneDeactivated } from '@/lib/deactivated-users-store';
import type { AccountAccessStatus } from '@/lib/account-access';

export interface UserLinkSummary {
  events: number;
  establishments: number;
  tools: number;
  benefitOffers: number;
  hasLinks: boolean;
}

export interface UserLifecycleResult {
  ok: boolean;
  action?: 'deleted' | 'archived' | 'suspended';
  error?: string;
  links?: UserLinkSummary;
}

async function countLinkedSpotSubmissions(userId: string): Promise<number> {
  if (!isSupabaseConfigured() || !supabase) return 0;

  const [pendingRes, publishedRes] = await Promise.all([
    supabase
      .from('partner_spot_submissions')
      .select('local_id', { count: 'exact', head: true })
      .eq('partner_user_id', userId)
      .in('status', ['pending', 'draft', 'rejected']),
    supabase
      .from('partner_spot_submissions')
      .select('local_id', { count: 'exact', head: true })
      .eq('partner_user_id', userId)
      .eq('status', 'approved')
      .or('published_establishment_id.not.is.null,published_tool_id.not.is.null'),
  ]);

  return (pendingRes.count ?? 0) + (publishedRes.count ?? 0);
}

async function countLinkedSubmissions(
  table: 'partner_event_submissions',
  userId: string,
): Promise<number> {
  if (!isSupabaseConfigured() || !supabase) return 0;

  const userFilter = `partner_user_id.eq.${userId},master_user_id.eq.${userId}`;

  const [pendingRes, publishedRes] = await Promise.all([
    supabase
      .from(table)
      .select('local_id', { count: 'exact', head: true })
      .or(userFilter)
      .in('status', ['pending', 'draft', 'rejected']),
    supabase
      .from(table)
      .select('local_id', { count: 'exact', head: true })
      .or(userFilter)
      .eq('status', 'approved')
      .not('published_event_id', 'is', null),
  ]);

  return (pendingRes.count ?? 0) + (publishedRes.count ?? 0);
}

async function countLinks(userId: string): Promise<UserLinkSummary> {
  if (!isSupabaseConfigured() || !supabase) {
    return { events: 0, establishments: 0, tools: 0, benefitOffers: 0, hasLinks: false };
  }

  const [events, establishments, tools, eventSubs, spotSubs] = await Promise.all([
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .or(`organizer_id.eq.${userId},master_id.eq.${userId},partner_id.eq.${userId}`),
    supabase
      .from('establishments')
      .select('id', { count: 'exact', head: true })
      .or(`master_id.eq.${userId},partner_id.eq.${userId}`),
    supabase
      .from('tools')
      .select('id', { count: 'exact', head: true })
      .or(`master_id.eq.${userId},partner_id.eq.${userId}`),
    countLinkedSubmissions('partner_event_submissions', userId),
    countLinkedSpotSubmissions(userId),
  ]);

  const summary: UserLinkSummary = {
    events: events.count ?? 0,
    establishments: establishments.count ?? 0,
    tools: tools.count ?? 0,
    benefitOffers: eventSubs + spotSubs,
    hasLinks: false,
  };
  summary.hasLinks =
    summary.events + summary.establishments + summary.tools + summary.benefitOffers > 0;
  return summary;
}

export async function inspectUserLinks(userId: string): Promise<UserLinkSummary> {
  return countLinks(userId);
}

export function formatUserDeleteImpact(
  fullName: string,
  links: UserLinkSummary,
  canHardDelete: boolean,
): string {
  if (!canHardDelete && links.hasLinks) {
    return [
      `Impossible de supprimer « ${fullName} » : des contenus ou avantages y sont rattachés.`,
      '',
      `• ${links.events} événement(s)`,
      `• ${links.establishments} spot(s)`,
      `• ${links.tools} outil(s)`,
      `• ${links.benefitOffers} soumission(s) partenaire`,
      '',
      'Seule l’archivage est possible : le compte deviendra inaccessible.',
    ].join('\n');
  }

  return [
    `Supprimer définitivement « ${fullName} » ?`,
    '',
    'Conséquences :',
    '• Le compte sera effacé de THE LOOP',
    '• PASS, favoris et notifications seront supprimés en cascade',
    '• Cette action est irréversible',
  ].join('\n');
}

export async function setUserAccountStatus(
  userId: string,
  status: AccountAccessStatus,
  phone?: string | null,
): Promise<UserLifecycleResult> {
  if (!isSupabaseConfigured() || !supabase) {
    if (phone && status !== 'active') await setPhoneDeactivated(phone, true);
    if (phone && status === 'active') await setPhoneDeactivated(phone, false);
    return { ok: true, action: status === 'deleted' ? 'deleted' : status === 'archived' ? 'archived' : 'suspended' };
  }

  if (status === 'deleted') {
    const { data, error } = await supabase.rpc('admin_delete_user_if_orphan', { p_user_id: userId });
    if (error) {
      if (error.message.includes('LINKED_CONTENT')) {
        const links = await countLinks(userId);
        return { ok: false, error: 'Compte rattaché à du contenu — archivez-le.', links };
      }
      return { ok: false, error: error.message };
    }
    if (data === false) {
      const links = await countLinks(userId);
      return { ok: false, error: 'Compte rattaché à du contenu — archivez-le.', links };
    }
    if (phone) await setPhoneDeactivated(phone, true);
    return { ok: true, action: 'deleted' };
  }

  const isActive = status === 'active';
  const patch: Record<string, unknown> = {
    is_active: isActive,
    account_status: status,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('users').update(patch).eq('id', userId);
  if (error) return { ok: false, error: error.message };
  if (phone) await setPhoneDeactivated(phone, !isActive);
  return {
    ok: true,
    action: status === 'archived' ? 'archived' : status === 'suspended' ? 'suspended' : undefined,
  };
}

export async function deleteOrArchiveUser(
  userId: string,
  phone: string | null | undefined,
  forceArchive = false,
): Promise<UserLifecycleResult> {
  const links = await countLinks(userId);
  if (links.hasLinks || forceArchive) {
    return setUserAccountStatus(userId, 'archived', phone);
  }
  return setUserAccountStatus(userId, 'deleted', phone);
}
