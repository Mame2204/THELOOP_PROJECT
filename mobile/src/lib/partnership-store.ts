import { inferCountryCodeFromPhone } from '@/lib/countries';
import { notifyAdminUsers } from '@/lib/user-notifications-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { normalizePhone } from '@/lib/otp-auth';

export type PartnerActivityType =
  | 'restaurant'
  | 'bar_club'
  | 'association'
  | 'event_organizer'
  | 'other';

export interface PartnershipRequestInput {
  companyName: string;
  activityType: PartnerActivityType;
  email: string;
  phone: string;
  message: string;
}

export async function submitPartnershipRequest(
  input: PartnershipRequestInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Supabase non configuré.' };
  }

  const phone = normalizePhone(input.phone);
  const countryCode = inferCountryCodeFromPhone(phone);
  const projectNote = input.message.trim();

  const { error } = await supabase.from('partnership_requests').insert({
    manager_name: input.companyName,
    establishment_name: input.companyName,
    email: input.email.trim().toLowerCase(),
    phone,
    country_code: countryCode,
    status: 'pending',
    admin_notes: projectNote || null,
  });

  if (error) {
    console.warn('[Partenariat]', error.message);
    return { ok: false, error: error.message };
  }

  await notifyAdminUsers({
    title: 'Nouvelle demande de partenariat',
    message: `${input.companyName.trim()} — ${input.email.trim()} · ${phone}`,
    countryCode,
  });

  return { ok: true };
}
