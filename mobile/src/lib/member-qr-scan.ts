import { parseRotatingQrPayload } from '@/lib/rotating-qr-token';

import { findRegistryUserById } from '@/lib/user-registry-store';

import { mapDbRole } from '@/lib/user-mapper';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

import type { User, UserRole } from '@/types';



export interface ScannedMemberProfile {

  userId: string;

  firstName: string | null;

  lastName: string | null;

  phoneNumber: string | null;

  role: User['role'];

  isVerified: boolean;

}



export type QrScanFailureReason =

  | 'invalid_format'

  | 'rpc_error'

  | 'expired_or_invalid'

  | 'user_not_found'

  | 'user_inactive'

  | 'offline_fallback_failed';



export interface QrScanResult {

  member: ScannedMemberProfile | null;

  reason?: QrScanFailureReason;

  detail?: string;

}

const SCANNED_MEMBER_ROLE_LABELS: Record<UserRole, string> = {
  USER_ANONYMOUS: 'Sans compte',
  USER_FREE: 'Membre',
  USER_PRIME: 'Loop Prime',
  PARTNER: 'Partenaire',
  ADMIN: 'Admin THE LOOP',
};

export function scannedMemberRoleLabel(role: UserRole): string {
  return SCANNED_MEMBER_ROLE_LABELS[role] ?? 'Membre';
}



async function mapRegistryToProfile(userId: string): Promise<ScannedMemberProfile | null> {

  const registry = await findRegistryUserById(userId);

  if (registry) {

    return {

      userId: registry.id,

      firstName: registry.firstName,

      lastName: registry.lastName,

      phoneNumber: registry.phoneNumber,

      role: registry.role,

      isVerified: true,

    };

  }

  return null;

}




export async function resolveMemberFromRotatingQr(payload: string): Promise<ScannedMemberProfile | null> {

  const result = await resolveMemberFromRotatingQrDetailed(payload);

  return result.member;

}



type QrRpcBody = {
  valid?: boolean;
  reason?: string;
  user_id?: string;
  user_role?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
};

async function profileFromValidRpc(body: QrRpcBody): Promise<ScannedMemberProfile | null> {
  if (!body.valid || !body.user_id) return null;
  const userId = String(body.user_id);

  if (body.first_name !== undefined || body.last_name !== undefined || body.phone_number !== undefined) {
    return {
      userId,
      firstName: body.first_name ?? null,
      lastName: body.last_name ?? null,
      phoneNumber: body.phone_number ?? null,
      role: mapDbRole(body.user_role ?? 'member'),
      isVerified: true,
    };
  }

  // verify_member_qr_payload masque l'identité : seul l'annuaire admin peut la
  // compléter. Un partenaire garde un profil vérifié mais anonyme.
  const profile = await mapRegistryToProfile(userId);
  if (profile) return profile;

  return {
    userId,
    firstName: null,
    lastName: null,
    phoneNumber: null,
    role: mapDbRole(body.user_role ?? 'member'),
    isVerified: true,
  };
}

async function parseQrRpcResponse(data: unknown): Promise<QrScanResult | null> {
  if (!data || typeof data !== 'object') return null;
  const body = data as QrRpcBody;

  if (body.valid && body.user_id) {
    const member = await profileFromValidRpc(body);
    if (member) return { member };
    return { member: null, reason: 'user_inactive' };
  }

  if (body.user_id && body.reason === 'expired_or_invalid') {
    return {
      member: null,
      reason: 'expired_or_invalid',
      detail: 'Code expiré — demandez au membre d\'actualiser son QR (compte à rebours).',
    };
  }

  if (body.reason === 'user_not_found') return { member: null, reason: 'user_not_found' };
  if (body.reason === 'user_inactive') return { member: null, reason: 'user_inactive' };
  if (body.reason === 'invalid_format') return { member: null, reason: 'invalid_format' };

  return null;
}

export async function resolveMemberFromRotatingQrDetailed(payload: string): Promise<QrScanResult> {
  const trimmed = payload.trim().toUpperCase();
  const parsed = parseRotatingQrPayload(trimmed);
  if (!parsed) {
    return { member: null, reason: 'invalid_format', detail: 'Format LOOP-XXXXXXXX-slot-code attendu.' };
  }

  if (isSupabaseConfigured() && supabase) {
    const rpcNames = ['verify_member_qr_partner', 'verify_member_qr_payload'] as const;
    let lastError: string | undefined;

    for (const rpcName of rpcNames) {
      const { data, error } = await supabase.rpc(rpcName, { p_payload: trimmed });

      if (!error && data) {
        const parsedResult = await parseQrRpcResponse(data);
        if (parsedResult) return parsedResult;
        continue;
      }

      if (error) {
        lastError = error.message;
        if (__DEV__) console.warn(`[QR scan] RPC ${rpcName}:`, error.message);
      }
    }

    const isMigrationIssue = lastError?.toLowerCase().includes('digest') ?? false;
    return {
      member: null,
      reason: 'rpc_error',
      detail: isMigrationIssue
        ? 'Migration Supabase requise : exécutez 20260743_qr_scan_partner_rpc.sql dans le SQL Editor.'
        : lastError,
    };
  }

  return {
    member: null,
    reason: 'offline_fallback_failed',
    detail: 'Vérification impossible sans connexion — réessayez une fois en ligne.',
  };
}
