import type { SupabaseClient } from '@supabase/supabase-js';
import { sendExpoPushToUserIds } from './expo-push.js';

export interface PushDeliveryResult {
  sent: number;
  failed: number;
  reason?: string;
}

/** Envoi push OS unifié (cron, admin API, clients mobile/web). */
export async function deliverPushToUserIds(
  supabase: SupabaseClient,
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<PushDeliveryResult> {
  const ids = [...new Set(userIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!ids.length) return { sent: 0, failed: 0, reason: 'no_users' };

  const t = title.trim();
  const b = body.trim();
  if (!t || !b) return { sent: 0, failed: 0, reason: 'empty_content' };

  const result = await sendExpoPushToUserIds(supabase, ids, t, b, data);
  if (result.reason) {
    console.warn('[push-delivery]', result.reason);
  } else if (result.sent > 0 || result.failed > 0) {
    console.log(`[push-delivery] ${result.sent} ok, ${result.failed} échec(s)`);
  }
  return result;
}
