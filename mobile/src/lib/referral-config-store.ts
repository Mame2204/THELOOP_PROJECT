import { loadCachedJson, saveCachedJson } from '@/lib/remote-settings-sync';
import { supabase } from '@/lib/supabase';

export interface ReferralSettings {
  referralsPerReward: number;
  rewardMonths: number;
  maxRewardMonthsPerYear: number;
  updatedAt: string;
}

const CACHE_KEY = 'loop_referral_settings_v1';

/** Valeurs métier par défaut si remote/cache absents. */
const DEFAULT_SETTINGS: ReferralSettings = {
  referralsPerReward: 10,
  rewardMonths: 1,
  maxRewardMonthsPerYear: 5,
  updatedAt: new Date(0).toISOString(),
};

function normalizeSettings(data: {
  referrals_per_reward?: number | null;
  reward_months?: number | null;
  max_reward_months_per_year?: number | null;
  updated_at?: string | null;
}): ReferralSettings {
  return {
    referralsPerReward: Number(data.referrals_per_reward) || DEFAULT_SETTINGS.referralsPerReward,
    rewardMonths: Number(data.reward_months) || DEFAULT_SETTINGS.rewardMonths,
    maxRewardMonthsPerYear:
      Number(data.max_reward_months_per_year) || DEFAULT_SETTINGS.maxRewardMonthsPerYear,
    updatedAt: String(data.updated_at ?? new Date().toISOString()),
  };
}

export async function loadReferralSettings(): Promise<ReferralSettings> {
  if (supabase) {
    const { data, error } = await supabase
      .from('referral_settings')
      .select('referrals_per_reward, reward_months, max_reward_months_per_year, updated_at')
      .eq('id', 1)
      .maybeSingle();

    if (!error && data) {
      const remote = normalizeSettings(data);
      await saveCachedJson(CACHE_KEY, remote);
      return remote;
    }
  }

  const cached = await loadCachedJson<ReferralSettings>(CACHE_KEY);
  return cached ?? { ...DEFAULT_SETTINGS };
}

export type SaveReferralSettingsResult = {
  ok: boolean;
  error?: string;
};

export async function saveReferralSettings(
  settings: ReferralSettings,
): Promise<SaveReferralSettingsResult> {
  const payload: ReferralSettings = {
    ...settings,
    updatedAt: new Date().toISOString(),
  };
  await saveCachedJson(CACHE_KEY, payload);

  if (!supabase) {
    return { ok: true };
  }

  const { data, error } = await supabase.rpc('admin_update_referral_settings', {
    p_referrals_per_reward: payload.referralsPerReward,
    p_reward_months: payload.rewardMonths,
    p_max_reward_months_per_year: payload.maxRewardMonthsPerYear,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  if (data && typeof data === 'object') {
    const row = data as {
      referrals_per_reward?: number | null;
      reward_months?: number | null;
      max_reward_months_per_year?: number | null;
      updated_at?: string | null;
    };
    const synced = normalizeSettings(row);
    await saveCachedJson(CACHE_KEY, synced);
  }

  return { ok: true };
}
