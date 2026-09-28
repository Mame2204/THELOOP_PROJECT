import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { deliverPushToAdminUserIds } from '@/lib/user-notifications-store';

export type AccountDeletionRequestResult =
  | { ok: true; alreadyPending: boolean; createdAt: string | null }
  | { ok: false; error: string };

const PUSH_TITLE = 'Demande suppression compte';
const PUSH_BODY = 'Un membre demande la suppression de son compte — voir Notifications.';

/** Enregistre la demande côté Supabase et prévient le super admin (inbox + push). */
export async function requestAccountDeletion(reason?: string): Promise<AccountDeletionRequestResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Service indisponible. Contactez le support.' };
  }

  const { data, error } = await supabase.rpc('request_account_deletion', {
    p_reason: reason?.trim() || undefined,
  });

  if (error) {
    if (/Could not find the function|schema cache|PGRST202/i.test(error.message)) {
      return { ok: false, error: 'Service indisponible pour le moment. Contactez le support.' };
    }
    return { ok: false, error: 'Envoi impossible. Vérifiez votre connexion ou contactez le support.' };
  }

  const payload = (data ?? {}) as { already_pending?: boolean; created_at?: string; admin_ids?: unknown };
  const alreadyPending = payload.already_pending === true;
  if (!alreadyPending) {
    await deliverPushToAdminUserIds(payload.admin_ids, PUSH_TITLE, PUSH_BODY, 'admin');
  }
  return {
    ok: true,
    alreadyPending,
    createdAt: typeof payload.created_at === 'string' ? payload.created_at : null,
  };
}
