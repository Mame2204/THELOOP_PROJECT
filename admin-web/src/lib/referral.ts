import { supabase } from './supabase';

export interface ReferralSettings {
  referralsPerReward: number;
  rewardMonths: number;
  maxRewardMonthsPerYear: number;
  updatedAt: string;
}

const DEFAULT_SETTINGS: ReferralSettings = {
  referralsPerReward: 10,
  rewardMonths: 1,
  maxRewardMonthsPerYear: 5,
  updatedAt: new Date(0).toISOString(),
};

function normalize(row: {
  referrals_per_reward?: number | null;
  reward_months?: number | null;
  max_reward_months_per_year?: number | null;
  updated_at?: string | null;
}): ReferralSettings {
  return {
    referralsPerReward: Number(row.referrals_per_reward) || DEFAULT_SETTINGS.referralsPerReward,
    rewardMonths: Number(row.reward_months) || DEFAULT_SETTINGS.rewardMonths,
    maxRewardMonthsPerYear:
      Number(row.max_reward_months_per_year) || DEFAULT_SETTINGS.maxRewardMonthsPerYear,
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function loadReferralSettings(): Promise<{ settings: ReferralSettings; error?: string }> {
  const { data, error } = await supabase
    .from('referral_settings')
    .select('referrals_per_reward, reward_months, max_reward_months_per_year, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) return { settings: DEFAULT_SETTINGS, error: error.message };
  if (!data) return { settings: DEFAULT_SETTINGS };
  return { settings: normalize(data) };
}

export async function saveReferralSettings(
  settings: Pick<ReferralSettings, 'referralsPerReward' | 'rewardMonths' | 'maxRewardMonthsPerYear'>,
): Promise<{ ok: boolean; error?: string; settings?: ReferralSettings }> {
  const { data, error } = await supabase.rpc('admin_update_referral_settings', {
    p_referrals_per_reward: settings.referralsPerReward,
    p_reward_months: settings.rewardMonths,
    p_max_reward_months_per_year: settings.maxRewardMonthsPerYear,
  });

  if (error) {
    return {
      ok: false,
      error: error.message.includes('admin_update_referral_settings')
        ? 'Migration Supabase manquante : admin_update_referral_settings'
        : error.message,
    };
  }

  if (data && typeof data === 'object') {
    return { ok: true, settings: normalize(data as Record<string, unknown>) };
  }

  return { ok: true, settings: { ...settings, updatedAt: new Date().toISOString() } };
}
