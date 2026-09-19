import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverPushToUserIds } from './push-delivery.js';

export interface PassExpiryCronResult {
  expiredGrants: number;
  activatedGrants: number;
  demotedUsers: number;
  notifiedUsers: number;
  pushSent: number;
  errors: string[];
}

interface ExpireRpcPayload {
  expiredGrants?: number;
  activatedGrants?: number;
  demotedUsers?: number;
  notifiedUsers?: number;
  notifiedUserIds?: unknown;
}

const PUSH_TITLE = 'Votre PASS Loop Prime a expiré';
const PUSH_BODY =
  'Votre abonnement est arrivé à échéance. Renouvelez-le depuis l’onglet Abonnement pour retrouver vos avantages.';

function toUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
}

/**
 * Applique les échéances d’abonnement : PASS échus, PASS suivant en file,
 * retour au rôle « member ». La règle vit en base (expire_due_pass_grants)
 * pour que le serveur et l’application ne puissent pas diverger.
 */
export async function runPassExpiry(supabase: SupabaseClient): Promise<PassExpiryCronResult> {
  const result: PassExpiryCronResult = {
    expiredGrants: 0,
    activatedGrants: 0,
    demotedUsers: 0,
    notifiedUsers: 0,
    pushSent: 0,
    errors: [],
  };

  const { data, error } = await supabase.rpc('expire_due_pass_grants', { p_limit: 500 });
  if (error) {
    result.errors.push(error.message);
    return result;
  }

  const payload = (data ?? {}) as ExpireRpcPayload;
  result.expiredGrants = Number(payload.expiredGrants ?? 0);
  result.activatedGrants = Number(payload.activatedGrants ?? 0);
  result.demotedUsers = Number(payload.demotedUsers ?? 0);
  result.notifiedUsers = Number(payload.notifiedUsers ?? 0);

  const userIds = toUserIds(payload.notifiedUserIds);
  if (userIds.length) {
    try {
      const push = await deliverPushToUserIds(supabase, userIds, PUSH_TITLE, PUSH_BODY, {
        source: 'theloop-cron',
        kind: 'pass_expired',
      });
      result.pushSent = push.sent;
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return result;
}
