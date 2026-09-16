import { inferCountryCodeFromPhone } from '@/lib/countries';
import { deliverPushToAdminUserIds, notifyAdminUsers } from '@/lib/user-notifications-store';
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

export type PartnershipSubmitResult =
  | { ok: true }
  | { ok: false; error: string; duplicate?: boolean };

/** Statuts « pipeline ouvert » — une seule demande active par e-mail. */
const OPEN_PARTNERSHIP_STATUSES = ['pending', 'to_contact', 'in_discussion'] as const;

export const PARTNERSHIP_DUPLICATE_MESSAGE =
  'Une demande de partenariat est déjà en cours pour cet e-mail. Notre équipe vous recontactera prochainement.';

function isDuplicatePartnershipError(err: { code?: string; message?: string }): boolean {
  const msg = (err.message ?? '').toLowerCase();
  return err.code === '23505' || msg.includes('duplicate') || msg.includes('unique constraint');
}

async function hasOpenPartnershipRequest(email: string): Promise<boolean> {
  if (!supabase) return false;
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from('partnership_requests')
    .select('id, email, status')
    .in('status', [...OPEN_PARTNERSHIP_STATUSES])
    .limit(20);

  if (error) {
    console.warn('[Partenariat] recherche doublon:', error.message);
    return false;
  }
  return (data ?? []).some(
    (row) => String(row.email ?? '').trim().toLowerCase() === normalized,
  );
}

export async function submitPartnershipRequest(
  input: PartnershipRequestInput,
): Promise<PartnershipSubmitResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Supabase non configuré.' };
  }

  const phone = normalizePhone(input.phone);
  const email = input.email.trim().toLowerCase();
  const countryCode = inferCountryCodeFromPhone(phone);
  const projectNote = input.message.trim();

  if (await hasOpenPartnershipRequest(email)) {
    return { ok: false, error: PARTNERSHIP_DUPLICATE_MESSAGE, duplicate: true };
  }

  const rpcPayload = {
    p_manager_name: input.companyName.trim(),
    p_establishment_name: input.companyName.trim(),
    p_email: email,
    p_phone: phone,
    p_country_code: countryCode,
    p_admin_notes: projectNote || null,
  };

  const { data: rpcId, error: rpcError } = await supabase.rpc('submit_partnership_request', rpcPayload);

  if (rpcError) {
    if (isDuplicatePartnershipError(rpcError) || rpcError.message.includes('open_request_exists')) {
      return { ok: false, error: PARTNERSHIP_DUPLICATE_MESSAGE, duplicate: true };
    }
    if (!rpcError.message.includes('Could not find the function')) {
      console.warn('[Partenariat] RPC:', rpcError.message);
      return { ok: false, error: 'Envoi impossible. Réessayez dans quelques instants.' };
    }
  }

  if (!rpcError && rpcId) {
    const title = 'Nouvelle demande de partenariat';
    const message = `${input.companyName.trim()} — ${email} · ${phone}`;
    const { data: adminIds, error: notifyError } = await supabase.rpc(
      'notify_admins_for_partnership_request',
      { p_email: email },
    );
    if (!notifyError) {
      await deliverPushToAdminUserIds(adminIds, title, message, 'admin');
      return { ok: true };
    }
    console.warn('[Partenariat] notify_admins_for_partnership_request:', notifyError.message);
    await notifyAdminUsers({ title, message, countryCode });
    return { ok: true };
  }

  const { error } = await supabase.from('partnership_requests').insert({
    manager_name: input.companyName,
    establishment_name: input.companyName,
    email,
    phone,
    country_code: countryCode,
    status: 'pending',
    admin_notes: projectNote || null,
  });

  if (error) {
    console.warn('[Partenariat]', error.message);
    if (isDuplicatePartnershipError(error)) {
      const stillOpen = await hasOpenPartnershipRequest(email);
      if (stillOpen) {
        return { ok: false, error: PARTNERSHIP_DUPLICATE_MESSAGE, duplicate: true };
      }
      return {
        ok: false,
        error:
          'Impossible de renouveler la demande (configuration serveur). Contactez contact@theloop-app.com ou réessayez après mise à jour de l’app.',
      };
    }
    return { ok: false, error: 'Envoi impossible. Réessayez dans quelques instants.' };
  }

  const title = 'Nouvelle demande de partenariat';
  const message = `${input.companyName.trim()} — ${email} · ${phone}`;

  const { data: adminIds, error: notifyError } = await supabase.rpc(
    'notify_admins_for_partnership_request',
    { p_email: email },
  );
  if (!notifyError) {
    await deliverPushToAdminUserIds(adminIds, title, message, 'admin');
    return { ok: true };
  }
  console.warn('[Partenariat] notify_admins_for_partnership_request:', notifyError.message);

  await notifyAdminUsers({ title, message, countryCode });

  return { ok: true };
}
