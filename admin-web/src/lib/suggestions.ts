import { supabase } from './supabase';

export type SuggestionType = 'improvement' | 'event' | 'spot' | 'tool' | 'other';
export type SuggestionStatus = 'pending' | 'reviewed' | 'done' | 'dismissed';

export const SUGGESTION_TYPE_LABELS: Record<SuggestionType, string> = {
  improvement: "Amélioration de l'app",
  event: 'Événement à tester',
  spot: 'Spot à découvrir',
  tool: 'Outil utile',
  other: 'Autre idée',
};

export const SUGGESTION_STATUS_LABELS: Record<SuggestionStatus, string> = {
  pending: 'Nouvelle',
  reviewed: 'En cours',
  done: 'Traitée',
  dismissed: 'Archivée',
};

export const SUGGESTION_STATUS_FLOW: SuggestionStatus[] = [
  'pending',
  'reviewed',
  'done',
  'dismissed',
];

export interface CommunitySuggestion {
  id: string;
  suggestionType: SuggestionType;
  title: string | null;
  placeName: string | null;
  description: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  countryCode: string;
  userId: string | null;
  status: SuggestionStatus;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapType(raw: string): SuggestionType {
  return raw in SUGGESTION_TYPE_LABELS ? (raw as SuggestionType) : 'other';
}

function mapStatus(raw: string): SuggestionStatus {
  return raw in SUGGESTION_STATUS_LABELS ? (raw as SuggestionStatus) : 'pending';
}

export async function listCommunitySuggestions(
  countryCode?: string,
): Promise<{ items: CommunitySuggestion[]; error?: string }> {
  let query = supabase
    .from('community_suggestions')
    .select(
      'id, suggestion_type, title, place_name, description, contact_name, contact_email, contact_phone, country_code, user_id, status, admin_notes, created_at, updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);

  if (countryCode) query = query.eq('country_code', countryCode);

  const { data, error } = await query;
  if (error) return { items: [], error: error.message };

  return {
    items: (data ?? []).map((row) => ({
      id: String(row.id),
      suggestionType: mapType(String(row.suggestion_type ?? 'other')),
      title: row.title ? String(row.title) : null,
      placeName: row.place_name ? String(row.place_name) : null,
      description: String(row.description ?? ''),
      contactName: row.contact_name ? String(row.contact_name) : null,
      contactEmail: row.contact_email ? String(row.contact_email) : null,
      contactPhone: row.contact_phone ? String(row.contact_phone) : null,
      countryCode: String(row.country_code ?? 'GN'),
      userId: row.user_id ? String(row.user_id) : null,
      status: mapStatus(String(row.status ?? 'pending')),
      adminNotes: row.admin_notes ? String(row.admin_notes) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at ?? row.created_at),
    })),
  };
}

export async function updateSuggestionStatus(
  id: string,
  status: SuggestionStatus,
  adminNotes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (adminNotes !== undefined) {
    payload.admin_notes = adminNotes.trim() || null;
  }

  const { error } = await supabase.from('community_suggestions').update(payload).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export function nextSuggestionStatus(current: SuggestionStatus): SuggestionStatus {
  const idx = SUGGESTION_STATUS_FLOW.indexOf(current);
  if (idx < 0) return 'pending';
  return SUGGESTION_STATUS_FLOW[(idx + 1) % SUGGESTION_STATUS_FLOW.length];
}
