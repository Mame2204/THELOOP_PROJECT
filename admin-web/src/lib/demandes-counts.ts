import { listPartnershipRequests } from './partnerships';
import { listPendingStaging } from './moderation';
import { listWithdrawalRequests } from './partner-withdrawal';
import { listCommunitySuggestions } from './suggestions';

export interface DemandesCounts {
  partnerships: number;
  moderation: number;
  withdrawals: number;
  suggestions: number;
  total: number;
}

export async function loadDemandesCounts(
  countryCode?: string,
): Promise<DemandesCounts> {
  const [partnershipsRes, stagingRes, withdrawalRes, suggestionsRes] = await Promise.all([
    listPartnershipRequests(countryCode),
    listPendingStaging(countryCode),
    listWithdrawalRequests(countryCode),
    listCommunitySuggestions(countryCode),
  ]);

  const partnerships = (partnershipsRes.items ?? []).filter((p) =>
    ['pending', 'to_contact', 'in_discussion'].includes(p.status),
  ).length;
  const moderation = stagingRes.items?.length ?? 0;
  const withdrawals = withdrawalRes.items?.length ?? 0;
  const suggestions = (suggestionsRes.items ?? []).filter((s) => s.status === 'pending').length;

  return {
    partnerships,
    moderation,
    withdrawals,
    suggestions,
    total: partnerships + moderation + withdrawals + suggestions,
  };
}
