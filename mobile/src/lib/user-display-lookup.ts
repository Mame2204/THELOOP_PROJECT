import { normalizeEmail } from '@/lib/email-auth';
import { normalizePhone } from '@/lib/otp-auth';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { findRegistryUserByEmailOrPhone, listRegistryUsers } from '@/lib/user-registry-store';

export interface UserDisplayInfo {
  id: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  city: string | null;
}

function formatName(first: string | null | undefined, last: string | null | undefined, fallback: string): string {
  const full = `${first ?? ''} ${last ?? ''}`.trim();
  return full || fallback;
}

/** Recherche un utilisateur par téléphone — Supabase en priorité, puis registre local. */
export async function lookupUserByPhone(phone: string): Promise<UserDisplayInfo | null> {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone_number, city')
      .eq('phone_number', normalized)
      .maybeSingle();

    if (!error && data) {
      const email = typeof data.email === 'string' ? data.email : null;
      return {
        id: String(data.id),
        displayName: formatName(
          typeof data.first_name === 'string' ? data.first_name : null,
          typeof data.last_name === 'string' ? data.last_name : null,
          email ?? normalized,
        ),
        phone: typeof data.phone_number === 'string' ? data.phone_number : normalized,
        email,
        city: typeof data.city === 'string' ? data.city : null,
      };
    }
  }

  const registry = await findRegistryUserByEmailOrPhone(null, normalized);
  if (registry) {
    return {
      id: registry.id,
      displayName: formatName(registry.firstName, registry.lastName, registry.email ?? normalized),
      phone: registry.phoneNumber,
      email: registry.email,
      city: registry.city ?? null,
    };
  }

  return null;
}

/** Recherche un utilisateur par e-mail — Supabase en priorité, puis registre local. */
export async function lookupUserByEmail(email: string): Promise<UserDisplayInfo | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('id, first_name, last_name, email, phone_number, city')
      .eq('email', normalized)
      .maybeSingle();

    if (!error && data) {
      const resolvedEmail = typeof data.email === 'string' ? data.email : normalized;
      return {
        id: String(data.id),
        displayName: formatName(
          typeof data.first_name === 'string' ? data.first_name : null,
          typeof data.last_name === 'string' ? data.last_name : null,
          resolvedEmail,
        ),
        phone: typeof data.phone_number === 'string' ? data.phone_number : null,
        email: resolvedEmail,
        city: typeof data.city === 'string' ? data.city : null,
      };
    }
  }

  const registry = await findRegistryUserByEmailOrPhone(normalized, null);
  if (registry) {
    return {
      id: registry.id,
      displayName: formatName(registry.firstName, registry.lastName, registry.email ?? normalized),
      phone: registry.phoneNumber,
      email: registry.email ?? normalized,
      city: registry.city ?? null,
    };
  }

  return null;
}

/** Nom affiché pour un bénéficiaire d'avantage Prime. */
export async function resolveBeneficiaryDisplayName(
  userId: string,
  userPhone: string | null,
): Promise<string | null> {
  if (userPhone) {
    const byPhone = await lookupUserByPhone(userPhone);
    if (byPhone) return byPhone.displayName;
  }

  const users = await listRegistryUsers();
  const byId = users.find((u) => u.id === userId);
  if (byId) {
    const name = formatName(byId.firstName, byId.lastName, byId.email ?? '');
    if (name) return name;
  }

  if (userId.startsWith('phone:')) {
    const phone = userId.slice(6);
    const byPhone = await lookupUserByPhone(phone);
    if (byPhone) return byPhone.displayName;
    return normalizePhone(phone);
  }

  if (userId.startsWith('email:')) {
    const email = userId.slice(6);
    const byEmail = await lookupUserByEmail(email);
    if (byEmail) return byEmail.displayName;
    return email;
  }

  if (userPhone) return normalizePhone(userPhone);
  return userId;
}
