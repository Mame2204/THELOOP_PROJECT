import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { PartnerActivityType } from '@/types/partner';
import { PARTNER_ACTIVITY_LABELS } from '@/types/partner';

export interface PartnershipRequestInput {
  companyName: string;
  activityType: PartnerActivityType;
  email: string;
  message: string;
}

export async function submitPartnershipRequest(
  input: PartnershipRequestInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Supabase non configuré.' };
  }

  const activityLabel = PARTNER_ACTIVITY_LABELS[input.activityType];
  const { error } = await supabase.from('partnership_requests').insert({
    manager_name: input.companyName,
    establishment_name: input.companyName,
    email: input.email.trim().toLowerCase(),
    phone: 'non_renseigne',
    status: 'pending',
    admin_notes: `[${activityLabel}] ${input.message.trim()}`,
  });

  if (error) {
    console.warn('[Partenariat] Insertion:', error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}
