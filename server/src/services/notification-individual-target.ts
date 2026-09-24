import type { SupabaseClient } from '@supabase/supabase-js';

export function parseIndividualTargets(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isEmailTarget(target: string): boolean {
  return target.includes('@');
}

function matchesCampaignCountry(campaignCountry: string, userCountry: string | null | undefined): boolean {
  const cc = campaignCountry.trim().toUpperCase();
  if (!cc) return true;
  if (!userCountry) return true;
  return String(userCountry).toUpperCase() === cc;
}

export async function resolveIndividualUserIds(
  supabase: SupabaseClient,
  raw: string,
  countryCode: string | null | undefined,
): Promise<string[]> {
  const targets = parseIndividualTargets(raw);
  if (!targets.length) return [];

  const ids = new Set<string>();
  const cc = countryCode?.trim().toUpperCase() ?? '';

  for (const target of targets) {
    if (isEmailTarget(target)) {
      const email = target.toLowerCase();
      const { data, error } = await supabase
        .from('users')
        .select('id, country_code')
        .eq('is_active', true)
        .ilike('email', email)
        .limit(10);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        if (matchesCampaignCountry(cc, row.country_code as string | null | undefined)) {
          ids.add(String(row.id));
        }
      }
      continue;
    }

    const phone = target.replace(/\s/g, '');
    const suffix = phone.slice(-9);
    let query = supabase.from('users').select('id, country_code').eq('is_active', true).limit(20);
    if (cc) query = query.eq('country_code', cc);
    const { data, error } = await query.or(
      `phone_number.eq.${phone},phone_number.ilike.%${suffix}`,
    );
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      ids.add(String(row.id));
    }
  }

  return [...ids].filter((id) => /^[0-9a-f-]{36}$/i.test(id));
}
