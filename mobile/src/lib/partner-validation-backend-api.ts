import type { PartnerPendingValidationRow } from '@/lib/benefit-redemption-store';
import {
  getLoopBackendApiUrl,
  isLoopBackendConfigured,
  loopBackendAuthHeaders,
} from '@/lib/loop-backend-api';

type BackendPendingItem = {
  redemptionLocalId: string;
  benefitId: string;
  benefitTitle: string;
  benefitDescription?: string;
  partnerKey: string;
  partnerName: string;
  partnerCode: string;
  expiresAt: string;
};

function mapBackendRow(row: BackendPendingItem, memberUserId: string): PartnerPendingValidationRow {
  return {
    redemption: {
      id: row.redemptionLocalId,
      benefitId: row.benefitId,
      userId: memberUserId,
      partnerId: row.partnerKey,
      partnerName: row.partnerName,
      partnerCode: row.partnerCode,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: row.expiresAt,
      validatedAt: null,
    },
    benefitTitle: row.benefitTitle,
    benefitDescription: row.benefitDescription ?? '',
  };
}

/** Lecture avantages en attente via serveur THE LOOP (service role Supabase). */
export async function fetchPartnerPendingValidationsViaBackend(
  memberUserId: string,
  partnerCode: string,
): Promise<PartnerPendingValidationRow[]> {
  if (!isLoopBackendConfigured()) return [];

  const headers = await loopBackendAuthHeaders();

  let response: Response;
  try {
    response = await fetch(`${getLoopBackendApiUrl()}/api/partner/pending-validations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ memberUserId, partnerCode }),
    });
  } catch {
    if (__DEV__) {
      console.warn('[PartnerValidation] backend unreachable (tunnel Expo ?) —', getLoopBackendApiUrl());
    }
    return [];
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    console.warn('[PartnerValidation] backend list:', body.error ?? response.status);
    return [];
  }

  const body = (await response.json()) as { items?: BackendPendingItem[] };
  return (body.items ?? []).map((row) => mapBackendRow(row, memberUserId));
}

export async function applyPartnerBenefitValidationViaBackend(
  partnerCode: string,
  redemptionLocalIds: string[],
  validate: boolean,
): Promise<number> {
  if (!isLoopBackendConfigured()) return 0;
  if (!redemptionLocalIds.length) return 0;

  const headers = await loopBackendAuthHeaders();

  let response: Response;
  try {
    response = await fetch(`${getLoopBackendApiUrl()}/api/partner/apply-validation`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ partnerCode, redemptionLocalIds, validate }),
    });
  } catch {
    throw new Error('backend_unreachable');
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'backend_apply_failed');
  }

  const body = (await response.json()) as { applied?: number };
  return typeof body.applied === 'number' ? body.applied : 0;
}

/** Push OS membre après validation RPC (inbox déjà créée côté Supabase). */
export async function notifyPartnerBenefitOutcomeViaBackend(
  partnerCode: string,
  items: Array<{ redemptionLocalId: string; action: 'validated' | 'cancelled' }>,
): Promise<void> {
  if (!isLoopBackendConfigured() || !items.length) return;

  const headers = await loopBackendAuthHeaders();

  try {
    await fetch(`${getLoopBackendApiUrl()}/api/partner/benefit-notify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ partnerCode, items }),
    });
  } catch {
    if (__DEV__) {
      console.warn('[PartnerValidation] benefit-notify unreachable —', getLoopBackendApiUrl());
    }
  }
}
