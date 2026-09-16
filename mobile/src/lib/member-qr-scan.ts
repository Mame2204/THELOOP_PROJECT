import { parseRotatingQrPayload, shortUserId, verifyRotatingQrPayload } from '@/lib/rotating-qr-token';

import { findRegistryUserById, listRegistryUsers } from '@/lib/user-registry-store';

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

  qrCodeToken: string | null;

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

      qrCodeToken: null,

    };

  }

  return null;

}



function rowToProfile(row: {

  id: string;

  first_name: string | null;

  last_name: string | null;

  phone_number: string | null;

  user_role: string | null;

  qr_code_token: string | null;

}): ScannedMemberProfile {

  return {

    userId: String(row.id),

    firstName: row.first_name ?? null,

    lastName: row.last_name ?? null,

    phoneNumber: row.phone_number ?? null,

    role: mapDbRole(row.user_role ?? 'member'),

    isVerified: true,

    qrCodeToken: row.qr_code_token ?? null,

  };

}



async function verifyLocallyForUser(

  trimmed: string,

  userId: string,

  qrCodeToken: string | null,

): Promise<boolean> {

  if (!qrCodeToken?.trim()) return false;

  return verifyRotatingQrPayload(trimmed, qrCodeToken, userId);

}



async function resolveFromLocalFallback(trimmed: string, parsed: { userIdShort: string }): Promise<ScannedMemberProfile | null> {
  if (isSupabaseConfigured() && supabase) {
    const { data: rows } = await supabase
      .from('users')
      .select('id, first_name, last_name, phone_number, user_role, is_active, qr_code_token')
      .eq('is_active', true)
      .limit(200);

    for (const row of rows ?? []) {
      if (shortUserId(String(row.id)) !== parsed.userIdShort || !row.qr_code_token) continue;
      const valid = await verifyRotatingQrPayload(trimmed, row.qr_code_token, String(row.id));
      if (valid) return rowToProfile(row);
    }
  }

  const registryUsers = await listRegistryUsers();
  for (const u of registryUsers) {
    if (shortUserId(u.id) !== parsed.userIdShort) continue;
    if (!isSupabaseConfigured() || !supabase) continue;
    const profile = await tryLocalVerifyForUserId(trimmed, u.id);
    if (profile) return profile;
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
      qrCodeToken: null,
    };
  }

  const profile = await mapRegistryToProfile(userId);
  if (profile) return profile;

  if (!isSupabaseConfigured() || !supabase) return null;

  const { data: row } = await supabase
    .from('users')
    .select('id, first_name, last_name, phone_number, user_role, is_active, qr_code_token')
    .eq('id', userId)
    .maybeSingle();

  if (row && row.is_active !== false) return rowToProfile(row);
  return null;
}

async function tryLocalVerifyForUserId(trimmed: string, userId: string): Promise<ScannedMemberProfile | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const { data: row } = await supabase
    .from('users')
    .select('id, first_name, last_name, phone_number, user_role, is_active, qr_code_token')
    .eq('id', userId)
    .maybeSingle();

  if (row?.qr_code_token && row.is_active !== false) {
    const valid = await verifyLocallyForUser(trimmed, userId, row.qr_code_token);
    if (valid) return rowToProfile(row);
  }
  return null;
}

async function parseQrRpcResponse(trimmed: string, data: unknown): Promise<QrScanResult | null> {
  if (!data || typeof data !== 'object') return null;
  const body = data as QrRpcBody;

  if (body.valid && body.user_id) {
    const member = await profileFromValidRpc(body);
    if (member) return { member };
    return { member: null, reason: 'user_inactive' };
  }

  if (body.user_id && body.reason === 'expired_or_invalid') {
    const userId = String(body.user_id);
    const localMember = await tryLocalVerifyForUserId(trimmed, userId);
    if (localMember) return { member: localMember };
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
        const parsedResult = await parseQrRpcResponse(trimmed, data);
        if (parsedResult) return parsedResult;
        continue;
      }

      if (error) {
        lastError = error.message;
        if (__DEV__) console.warn(`[QR scan] RPC ${rpcName}:`, error.message);
      }
    }

    const local = await resolveFromLocalFallback(trimmed, parsed);
    if (local) return { member: local };

    const isMigrationIssue = lastError?.toLowerCase().includes('digest') ?? false;
    return {
      member: null,
      reason: 'rpc_error',
      detail: isMigrationIssue
        ? 'Migration Supabase requise : exécutez 20260743_qr_scan_partner_rpc.sql dans le SQL Editor.'
        : lastError,
    };
  }

  const local = await resolveFromLocalFallback(trimmed, parsed);
  if (local) return { member: local };

  return { member: null, reason: 'offline_fallback_failed' };
}
