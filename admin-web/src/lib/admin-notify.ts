import { supabase } from './supabase';

/** Inbox admin (tous les comptes admin/super_admin) via RPC Supabase. */
export async function notifyAdminInbox(input: {
  title: string;
  message: string;
  countryCode?: string | null;
}): Promise<void> {
  const title = input.title.trim();
  const message = input.message.trim();
  if (!title || !message) return;

  const country =
    input.countryCode?.trim().toUpperCase().slice(0, 2) || null;

  const { error } = await supabase.rpc('admin_distribute_notifications', {
    p_title: title,
    p_message: message,
    p_audience: 'admin',
    p_country_code: country,
    p_campaign_id: null,
  });

  if (error) {
    console.warn('[admin-notify]', error.message);
  }
}
