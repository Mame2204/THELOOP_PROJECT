import type { PartnerContentScopes, UserRole } from '@/types';

export type { PartnerContentScopes };

export const DEFAULT_PARTNER_CONTENT_SCOPES: PartnerContentScopes = {
  events: true,
  spots: true,
  tools: true,
};

export function parsePartnerContentScopesFromRow(row: Record<string, unknown>): PartnerContentScopes {
  return {
    events: row.partner_can_manage_events !== false,
    spots: row.partner_can_manage_spots !== false,
    tools: row.partner_can_manage_tools !== false,
  };
}

export function resolvePartnerContentScopes(
  role: UserRole,
  raw?: Partial<PartnerContentScopes> | null,
): PartnerContentScopes | null {
  if (role !== 'PARTNER') return null;
  return {
    events: raw?.events ?? true,
    spots: raw?.spots ?? true,
    tools: raw?.tools ?? true,
  };
}

export function hasAnyPartnerContentScope(scopes: PartnerContentScopes | null | undefined): boolean {
  if (!scopes) return false;
  return scopes.events || scopes.spots || scopes.tools;
}

export function partnerScopeSummary(scopes: PartnerContentScopes): string {
  const parts: string[] = [];
  if (scopes.events) parts.push('Événements');
  if (scopes.spots) parts.push('Spots');
  if (scopes.tools) parts.push('Outils');
  return parts.length ? parts.join(' · ') : 'Aucun module';
}
