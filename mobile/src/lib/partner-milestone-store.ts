import AsyncStorage from '@react-native-async-storage/async-storage';
import { setContentFeatured } from '@/lib/admin-content-store';
import { sendAdminNotification } from '@/lib/admin-notifications-store';
import { resolvePartnerUserIdForSync } from '@/lib/partner-user-resolve';
import { appendUserNotification } from '@/lib/user-notifications-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type PartnerMilestoneMetric = 'unique_members' | 'validations';
export type PartnerMilestoneRewardType = 'featured_week' | 'push_once';
export type PartnerMilestoneRewardStatus = 'earned' | 'configured' | 'active' | 'used' | 'expired';
export type PartnerRewardContentKind = 'event' | 'spot' | 'tool';

export interface PartnerMilestoneRule {
  id: string;
  name: string;
  description: string | null;
  metricType: PartnerMilestoneMetric;
  threshold: number;
  rewardType: PartnerMilestoneRewardType;
  durationDays: number;
  validityDays: number;
  pushTitle: string | null;
  pushMessage: string | null;
  countryCode: string;
  isActive: boolean;
  archived: boolean;
  periodMonths: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerMilestoneReward {
  id: string;
  ruleId: string;
  ruleName: string;
  partnerKey: string;
  partnerUserId: string | null;
  partnerName: string;
  metricType: PartnerMilestoneMetric;
  metricValue: number;
  rewardType: PartnerMilestoneRewardType;
  status: PartnerMilestoneRewardStatus;
  periodKey: string;
  contentKind: PartnerRewardContentKind | null;
  contentId: string | null;
  contentTitle: string | null;
  durationDays: number;
  validityDays: number;
  pushTitle: string | null;
  pushMessage: string | null;
  earnedAt: string;
  selectedAt: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  usedAt: string | null;
}

export interface PartnerRuleProgress {
  rule: PartnerMilestoneRule;
  current: number;
  periodLabel: string;
  alreadyGranted: boolean;
}

export interface PartnerMilestoneMetrics {
  uniqueMembers: number;
  validations: number;
}

const RULES_KEY = 'loop_partner_milestone_rules_v1';
const REWARDS_KEY = 'loop_partner_milestone_rewards_v1';
const ATTR_KEY = 'loop_partner_member_attributions_v1';

export const MILESTONE_METRIC_LABELS: Record<PartnerMilestoneMetric, string> = {
  unique_members: 'Membres distincts validés',
  validations: 'Validations d\'avantages',
};

export const MILESTONE_REWARD_LABELS: Record<PartnerMilestoneRewardType, string> = {
  featured_week: 'À la une (1 semaine)',
  push_once: 'Push notification (1 fois)',
};

export const MILESTONE_STATUS_LABELS: Record<PartnerMilestoneRewardStatus, string> = {
  earned: 'À configurer',
  configured: 'Prêt à activer',
  active: 'En cours',
  used: 'Utilisé',
  expired: 'Expiré',
};

export const MILESTONE_PERIOD_OPTIONS: { value: number; label: string; short: string }[] = [
  { value: 0, label: 'Depuis toujours (cumul total)', short: 'Total' },
  { value: 1, label: '1 mois calendaire', short: 'Ce mois' },
  { value: 3, label: '3 mois (trimestre)', short: '3 mois' },
  { value: 6, label: '6 mois (semestre)', short: '6 mois' },
  { value: 12, label: '12 mois (année)', short: '12 mois' },
];

export function getMilestonePeriodLabel(periodMonths: number): string {
  return MILESTONE_PERIOD_OPTIONS.find((p) => p.value === periodMonths)?.label ?? `${periodMonths} mois`;
}

export function getMilestonePeriodShort(periodMonths: number): string {
  return MILESTONE_PERIOD_OPTIONS.find((p) => p.value === periodMonths)?.short ?? `${periodMonths}m`;
}

export function getMilestonePeriodKey(periodMonths: number, at = new Date()): string {
  if (periodMonths <= 0) return 'all';
  if (periodMonths === 1) {
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
  }
  if (periodMonths === 3) {
    const q = Math.floor(at.getMonth() / 3) + 1;
    return `${at.getFullYear()}-Q${q}`;
  }
  if (periodMonths === 6) {
    return `${at.getFullYear()}-${at.getMonth() < 6 ? 'H1' : 'H2'}`;
  }
  return `${at.getFullYear()}`;
}

export function getMilestonePeriodSince(periodMonths: number, at = new Date()): Date | null {
  if (periodMonths <= 0) return null;
  const since = new Date(at);
  if (periodMonths === 1) {
    since.setDate(1);
    since.setHours(0, 0, 0, 0);
    return since;
  }
  if (periodMonths === 3) {
    since.setMonth(Math.floor(at.getMonth() / 3) * 3, 1);
    since.setHours(0, 0, 0, 0);
    return since;
  }
  if (periodMonths === 6) {
    since.setMonth(at.getMonth() < 6 ? 0 : 6, 1);
    since.setHours(0, 0, 0, 0);
    return since;
  }
  if (periodMonths === 12) {
    since.setMonth(0, 1);
    since.setHours(0, 0, 0, 0);
    return since;
  }
  return null;
}

interface MemberAttribution {
  partnerKey: string;
  userId: string;
  firstValidatedAt: string;
}

async function loadRulesLocal(): Promise<PartnerMilestoneRule[]> {
  try {
    const raw = await AsyncStorage.getItem(RULES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PartnerMilestoneRule[];
    return parsed.length ? parsed : [];
  } catch {
    return [];
  }
}

async function saveRulesLocal(rules: PartnerMilestoneRule[]): Promise<void> {
  await AsyncStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

async function loadRewardsLocal(): Promise<PartnerMilestoneReward[]> {
  try {
    const raw = await AsyncStorage.getItem(REWARDS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PartnerMilestoneReward[];
  } catch {
    return [];
  }
}

async function saveRewardsLocal(items: PartnerMilestoneReward[]): Promise<void> {
  await AsyncStorage.setItem(REWARDS_KEY, JSON.stringify(items));
}

async function loadAttributionsLocal(): Promise<MemberAttribution[]> {
  try {
    const raw = await AsyncStorage.getItem(ATTR_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as MemberAttribution[];
  } catch {
    return [];
  }
}

async function saveAttributionsLocal(items: MemberAttribution[]): Promise<void> {
  await AsyncStorage.setItem(ATTR_KEY, JSON.stringify(items));
}

function mapRuleRow(row: Record<string, unknown>): PartnerMilestoneRule {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    metricType: row.metric_type as PartnerMilestoneMetric,
    threshold: Number(row.threshold),
    rewardType: row.reward_type as PartnerMilestoneRewardType,
    durationDays: Number(row.duration_days ?? 7),
    validityDays: Number(row.validity_days ?? 90),
    pushTitle: row.push_title ? String(row.push_title) : null,
    pushMessage: row.push_message ? String(row.push_message) : null,
    countryCode: String(row.country_code ?? 'GN'),
    isActive: Boolean(row.is_active ?? true),
    archived: Boolean(row.archived ?? false),
    periodMonths: Number(row.period_months ?? 1),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
  };
}

function normalizeLocalRule(rule: PartnerMilestoneRule): PartnerMilestoneRule {
  return {
    ...rule,
    archived: rule.archived ?? false,
    periodMonths: rule.periodMonths ?? 1,
  };
}

function normalizeLocalReward(reward: PartnerMilestoneReward): PartnerMilestoneReward {
  return { ...reward, periodKey: reward.periodKey ?? 'all' };
}

export async function listPartnerMilestoneRules(
  countryCode?: string,
  options?: { includeArchived?: boolean },
): Promise<PartnerMilestoneRule[]> {
  const includeArchived = options?.includeArchived ?? false;
  if (isSupabaseConfigured() && supabase) {
    let query = supabase.from('partner_milestone_rules').select('id, name, description, metric_type, threshold, reward_type, duration_days, validity_days, push_title, push_message, country_code, is_active, archived, period_months, sort_order, created_at, updated_at').order('sort_order').limit(200);
    if (countryCode) query = query.eq('country_code', countryCode);
    if (!includeArchived) query = query.eq('archived', false);
    const { data, error } = await query;
    if (!error && data?.length) {
      const rules = data.map((r) => mapRuleRow(r as Record<string, unknown>));
      await saveRulesLocal(rules);
      return rules;
    }
  }
  const local = (await loadRulesLocal()).map(normalizeLocalRule);
  const filtered = countryCode ? local.filter((r) => r.countryCode === countryCode) : local;
  return includeArchived ? filtered : filtered.filter((r) => !r.archived);
}

export async function upsertPartnerMilestoneRule(
  input: Omit<PartnerMilestoneRule, 'createdAt' | 'updatedAt' | 'id'> & { id?: string },
): Promise<PartnerMilestoneRule> {
  const now = new Date().toISOString();
  const rule: PartnerMilestoneRule = {
    ...input,
    archived: input.archived ?? false,
    periodMonths: input.periodMonths ?? 1,
    id: input.id ?? `rule-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
  };

  const rules = await loadRulesLocal();
  const idx = rules.findIndex((r) => r.id === rule.id);
  if (idx >= 0) rules[idx] = { ...rules[idx], ...rule, updatedAt: now };
  else rules.push(rule);
  await saveRulesLocal(rules.sort((a, b) => a.sortOrder - b.sortOrder));

  if (isSupabaseConfigured() && supabase && !rule.id.startsWith('rule-')) {
    await supabase.from('partner_milestone_rules').upsert({
      id: rule.id,
      name: rule.name,
      description: rule.description,
      metric_type: rule.metricType,
      threshold: rule.threshold,
      reward_type: rule.rewardType,
      duration_days: rule.durationDays,
      validity_days: rule.validityDays,
      push_title: rule.pushTitle,
      push_message: rule.pushMessage,
      country_code: rule.countryCode,
      is_active: rule.isActive,
      archived: rule.archived,
      period_months: rule.periodMonths,
      sort_order: rule.sortOrder,
    });
  }

  return rule;
}

export async function togglePartnerMilestoneRuleActive(ruleId: string, isActive: boolean): Promise<void> {
  const rules = (await loadRulesLocal()).map(normalizeLocalRule);
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx < 0) return;
  rules[idx] = { ...rules[idx], isActive, updatedAt: new Date().toISOString() };
  await saveRulesLocal(rules);
  if (isSupabaseConfigured() && supabase && !ruleId.startsWith('rule-')) {
    await supabase.from('partner_milestone_rules').update({ is_active: isActive }).eq('id', ruleId);
  }
}

export async function archivePartnerMilestoneRule(ruleId: string): Promise<void> {
  const rules = (await loadRulesLocal()).map(normalizeLocalRule);
  const idx = rules.findIndex((r) => r.id === ruleId);
  if (idx < 0) return;
  rules[idx] = {
    ...rules[idx],
    archived: true,
    isActive: false,
    updatedAt: new Date().toISOString(),
  };
  await saveRulesLocal(rules);
  if (isSupabaseConfigured() && supabase && !ruleId.startsWith('rule-')) {
    await supabase.from('partner_milestone_rules').update({ archived: true, is_active: false }).eq('id', ruleId);
  }
}

/** @deprecated Utiliser archivePartnerMilestoneRule — ne supprime plus les données */
export async function deletePartnerMilestoneRule(ruleId: string): Promise<void> {
  await archivePartnerMilestoneRule(ruleId);
}

export async function countPartnerMetricsFromRedemptions(
  partnerKey: string,
  partnerName: string,
  since?: Date | null,
): Promise<PartnerMilestoneMetrics> {
  const { countPartnerValidationMetrics } = await import('@/lib/benefit-redemption-store');
  const fromRedemptions = await countPartnerValidationMetrics(partnerKey, partnerName, since);
  if (since) {
    return {
      uniqueMembers: fromRedemptions.uniqueMembers,
      validations: fromRedemptions.validations,
    };
  }
  const attributions = await loadAttributionsLocal();
  const uniqueFromAttr = attributions.filter((a) => a.partnerKey === partnerKey).length;
  return {
    uniqueMembers: Math.max(uniqueFromAttr, fromRedemptions.uniqueMembers),
    validations: fromRedemptions.validations,
  };
}

async function recordMemberAttribution(partnerKey: string, userId: string): Promise<boolean> {
  const attrs = await loadAttributionsLocal();
  if (attrs.some((a) => a.partnerKey === partnerKey && a.userId === userId)) return false;
  attrs.push({ partnerKey, userId, firstValidatedAt: new Date().toISOString() });
  await saveAttributionsLocal(attrs);

  if (isSupabaseConfigured() && supabase && /^[0-9a-f-]{36}$/i.test(userId)) {
    await supabase.rpc('record_partner_member_attribution', {
      p_partner_key: partnerKey,
      p_user_id: userId,
    });
  }
  return true;
}

function metricValue(metrics: PartnerMilestoneMetrics, type: PartnerMilestoneMetric): number {
  return type === 'unique_members' ? metrics.uniqueMembers : metrics.validations;
}

async function notifyPartnerMilestoneEarned(
  partnerUserId: string | null,
  rule: PartnerMilestoneRule,
  metrics: PartnerMilestoneMetrics,
): Promise<void> {
  if (!partnerUserId) return;
  const current = metricValue(metrics, rule.metricType);
  await appendUserNotification(partnerUserId, {
    title: 'Félicitations !',
    message: `Vous avez atteint ${current} ${MILESTONE_METRIC_LABELS[rule.metricType].toLowerCase()}. Récompense : ${MILESTONE_REWARD_LABELS[rule.rewardType]}. Ouvrez « Récompenses THE LOOP » pour choisir votre contenu.`,
    audience: 'partner',
  });
}

export async function evaluatePartnerMilestonesAfterValidation(input: {
  partnerKey: string;
  partnerName: string;
  memberUserId: string;
  countryCode?: string;
}): Promise<PartnerMilestoneReward[]> {
  await recordMemberAttribution(input.partnerKey, input.memberUserId);
  const partnerUserId = await resolvePartnerUserIdForSync(input.partnerKey, input.partnerName);
  const rules = (await listPartnerMilestoneRules(input.countryCode)).filter((r) => r.isActive && !r.archived);
  const rewards = (await loadRewardsLocal()).map(normalizeLocalReward);
  const granted: PartnerMilestoneReward[] = [];

  for (const rule of rules) {
    const periodKey = getMilestonePeriodKey(rule.periodMonths);
    if (rewards.some((r) => r.partnerKey === input.partnerKey && r.ruleId === rule.id && r.periodKey === periodKey)) {
      continue;
    }
    const since = getMilestonePeriodSince(rule.periodMonths);
    const metrics = await countPartnerMetricsFromRedemptions(input.partnerKey, input.partnerName, since);
    const value = metricValue(metrics, rule.metricType);
    if (value < rule.threshold) continue;

    const validityEnd = new Date();
    validityEnd.setDate(validityEnd.getDate() + rule.validityDays);

    const reward: PartnerMilestoneReward = {
      id: `pmr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ruleId: rule.id,
      ruleName: rule.name,
      partnerKey: input.partnerKey,
      partnerUserId,
      partnerName: input.partnerName,
      metricType: rule.metricType,
      metricValue: value,
      rewardType: rule.rewardType,
      status: 'earned',
      periodKey,
      contentKind: null,
      contentId: null,
      contentTitle: null,
      durationDays: rule.durationDays,
      validityDays: rule.validityDays,
      pushTitle: rule.pushTitle,
      pushMessage: rule.pushMessage,
      earnedAt: new Date().toISOString(),
      selectedAt: null,
      activatedAt: null,
      expiresAt: validityEnd.toISOString(),
      usedAt: null,
    };
    rewards.unshift(reward);
    granted.push(reward);
    await notifyPartnerMilestoneEarned(partnerUserId, rule, metrics);
  }

  if (granted.length) await saveRewardsLocal(rewards);
  return granted;
}

export async function listPartnerMilestoneRewards(
  partnerUserId: string,
  partnerKey?: string,
): Promise<PartnerMilestoneReward[]> {
  await expireStalePartnerRewards();
  const all = await loadRewardsLocal();
  return all.filter(
    (r) => r.partnerUserId === partnerUserId || (partnerKey && r.partnerKey === partnerKey),
  );
}

export async function countPartnerPendingRewards(partnerUserId: string): Promise<number> {
  const items = await listPartnerMilestoneRewards(partnerUserId);
  return items.filter((r) => r.status === 'earned' || r.status === 'configured').length;
}

export async function getPartnerMilestoneProgress(
  partnerUserId: string,
  partnerKey: string,
  partnerName: string,
  countryCode?: string,
): Promise<{
  metrics: PartnerMilestoneMetrics;
  monthMetrics: PartnerMilestoneMetrics;
  rules: PartnerRuleProgress[];
  rewards: PartnerMilestoneReward[];
}> {
  const { startOfCurrentMonth } = await import('@/lib/partner-engagement-report');
  const monthSince = startOfCurrentMonth();
  const [metrics, monthMetrics, allRules, rewards] = await Promise.all([
    countPartnerMetricsFromRedemptions(partnerKey, partnerName),
    countPartnerMetricsFromRedemptions(partnerKey, partnerName, monthSince),
    listPartnerMilestoneRules(countryCode),
    listPartnerMilestoneRewards(partnerUserId, partnerKey),
  ]);

  const activeRules = allRules.filter((r) => r.isActive && !r.archived);
  const rules: PartnerRuleProgress[] = await Promise.all(
    activeRules.map(async (rule) => {
      const since = getMilestonePeriodSince(rule.periodMonths);
      const ruleMetrics = await countPartnerMetricsFromRedemptions(partnerKey, partnerName, since);
      const periodKey = getMilestonePeriodKey(rule.periodMonths);
      const alreadyGranted = rewards.some(
        (r) => r.ruleId === rule.id && r.periodKey === periodKey && r.status !== 'expired',
      );
      return {
        rule,
        current: metricValue(ruleMetrics, rule.metricType),
        periodLabel: getMilestonePeriodShort(rule.periodMonths),
        alreadyGranted,
      };
    }),
  );

  return { metrics, monthMetrics, rules, rewards };
}

export function filterVisiblePartnerPaliers(rules: PartnerRuleProgress[]): PartnerRuleProgress[] {
  const pending = [...rules]
    .filter((r) => !r.alreadyGranted)
    .sort((a, b) => a.rule.threshold - b.rule.threshold);

  const lowestId = pending[0]?.rule.id;

  return pending.filter((item) => {
    if (item.current <= 0) return false;
    if (item.rule.id === lowestId) return true;
    return item.current >= item.rule.threshold;
  });
}

export async function listPartnerMilestoneGrantsForRule(ruleId: string): Promise<PartnerMilestoneReward[]> {
  const all = (await loadRewardsLocal()).map(normalizeLocalReward);
  return all.filter((r) => r.ruleId === ruleId).sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
}

export async function selectPartnerRewardContent(
  rewardId: string,
  partnerUserId: string,
  content: { kind: PartnerRewardContentKind; id: string; title: string },
): Promise<PartnerMilestoneReward | null> {
  const all = await loadRewardsLocal();
  const idx = all.findIndex((r) => r.id === rewardId && r.partnerUserId === partnerUserId);
  if (idx < 0 || all[idx].status !== 'earned') return null;

  const now = new Date().toISOString();
  all[idx] = {
    ...all[idx],
    status: 'configured',
    contentKind: content.kind,
    contentId: content.id,
    contentTitle: content.title,
    selectedAt: now,
  };
  await saveRewardsLocal(all);
  return all[idx];
}

export async function activatePartnerReward(
  rewardId: string,
  partnerUserId: string,
): Promise<{ ok: boolean; error?: string; reward?: PartnerMilestoneReward }> {
  await expireStalePartnerRewards();
  const all = await loadRewardsLocal();
  const idx = all.findIndex((r) => r.id === rewardId && r.partnerUserId === partnerUserId);
  if (idx < 0) return { ok: false, error: 'not_found' };

  const reward = all[idx];
  if (reward.status !== 'configured') return { ok: false, error: 'not_ready' };
  if (!reward.contentId || !reward.contentKind) return { ok: false, error: 'no_content' };
  if (reward.expiresAt && new Date(reward.expiresAt).getTime() < Date.now()) {
    all[idx] = { ...reward, status: 'expired' };
    await saveRewardsLocal(all);
    return { ok: false, error: 'expired' };
  }

  const now = new Date();
  const activatedAt = now.toISOString();

  if (reward.rewardType === 'featured_week') {
    const end = new Date(now);
    end.setDate(end.getDate() + reward.durationDays);
    const kind = reward.contentKind === 'event' ? 'event' : 'spot';
    await setContentFeatured(kind, reward.contentId, true, activatedAt, end.toISOString());
    all[idx] = { ...reward, status: 'active', activatedAt, expiresAt: end.toISOString() };
  } else if (reward.rewardType === 'push_once') {
    const title = reward.pushTitle ?? `THE LOOP — ${reward.partnerName}`;
    const message =
      reward.pushMessage ??
      `Découvrez « ${reward.contentTitle ?? 'notre partenaire'} » sur THE LOOP.`;
    await sendAdminNotification({
      title,
      message,
      audience: 'all',
      countryCode: 'GN',
    });
    all[idx] = {
      ...reward,
      status: 'used',
      activatedAt,
      usedAt: activatedAt,
      expiresAt: activatedAt,
    };
  }

  await saveRewardsLocal(all);

  await appendUserNotification(partnerUserId, {
    title: reward.rewardType === 'featured_week' ? 'À la une activée' : 'Push envoyé',
    message:
      reward.rewardType === 'featured_week'
        ? `« ${reward.contentTitle} » est à la une pour ${reward.durationDays} jours.`
        : `Votre push pour « ${reward.contentTitle} » a été envoyé aux membres.`,
    audience: 'partner',
  });

  return { ok: true, reward: all[idx] };
}

export async function expireStalePartnerRewards(): Promise<void> {
  const all = await loadRewardsLocal();
  const now = Date.now();
  let changed = false;
  const next = all.map((r) => {
    if ((r.status === 'earned' || r.status === 'configured') && r.expiresAt && new Date(r.expiresAt).getTime() < now) {
      changed = true;
      return { ...r, status: 'expired' as const };
    }
    if (r.status === 'active' && r.expiresAt && new Date(r.expiresAt).getTime() < now) {
      changed = true;
      return { ...r, status: 'used' as const, usedAt: r.expiresAt };
    }
    return r;
  });
  if (changed) await saveRewardsLocal(next);
}

export async function listAllPartnerMilestoneRewards(): Promise<PartnerMilestoneReward[]> {
  await expireStalePartnerRewards();
  return (await loadRewardsLocal()).map(normalizeLocalReward);
}
