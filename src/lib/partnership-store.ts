import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { PartnerActivityType } from '@/types/partner';
import { PARTNER_ACTIVITY_LABELS } from '@/types/partner';

export interface PartnershipRequestInput {
  companyName: string;
  activityType: PartnerActivityType;
  email: string;
  message: string;
}

const OPEN_PARTNERSHIP_STATUSES = ['pending', 'to_contact', 'in_discussion'] as const;

export const PARTNERSHIP_DUPLICATE_MESSAGE =
  'Une demande de partenariat est déjà en cours pour cet e-mail. Notre équipe vous recontactera prochainement.';

function isDuplicatePartnershipError(err: { code?: string; message?: string }): boolean {
  const msg = (err.message ?? '').toLowerCase();
  return err.code === '23505' || msg.includes('duplicate') || msg.includes('unique constraint');
}

export async function submitPartnershipRequest(
  input: PartnershipRequestInput,
): Promise<{ ok: boolean; error?: string; duplicate?: boolean }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Supabase non configuré.' };
  }

  const email = input.email.trim().toLowerCase();
  const activityLabel = PARTNER_ACTIVITY_LABELS[input.activityType];

  const { data: existing } = await supabase
    .from('partnership_requests')
    .select('id')
    .eq('email', email)
    .in('status', [...OPEN_PARTNERSHIP_STATUSES])
    .limit(1);

  if ((existing?.length ?? 0) > 0) {
    return { ok: false, error: PARTNERSHIP_DUPLICATE_MESSAGE, duplicate: true };
  }

  const { error } = await supabase.from('partnership_requests').insert({
    manager_name: input.companyName,
    establishment_name: input.companyName,
    email,
    phone: 'non_renseigne',
    status: 'pending',
    admin_notes: `[${activityLabel}] ${input.message.trim()}`,
  });

  if (error) {
    console.warn('[Partenariat] Insertion:', error.message);
    if (isDuplicatePartnershipError(error)) {
      return { ok: false, error: PARTNERSHIP_DUPLICATE_MESSAGE, duplicate: true };
    }
    return { ok: false, error: 'Envoi impossible. Réessayez dans quelques instants.' };
  }

  return { ok: true };
}
