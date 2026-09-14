import { findRegistryUserByEmailOrPhone } from '@/lib/user-registry-store';
import { isPhoneNumberTaken } from '@/lib/phone-auth';

/** Vérifie qu'un compte existe pour ce numéro (Supabase ou registre local démo). */
export async function accountExistsForPhone(phone: string): Promise<boolean> {
  if (await isPhoneNumberTaken(phone)) return true;
  const registry = await findRegistryUserByEmailOrPhone(null, phone);
  return registry != null;
}
