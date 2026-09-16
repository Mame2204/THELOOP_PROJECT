import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_COUNTRY_CODE, inferCountryCodeFromPhone } from '@/lib/countries';
import { notifyAdminUsers } from '@/lib/user-notifications-store';
import { hydrateScoped, peekScoped, scopedStorageKey } from '@/lib/swr-cache';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { normalizePhone } from '@/lib/otp-auth';

export type SuggestionType = 'improvement' | 'event' | 'spot' | 'tool' | 'other';
export type SuggestionStatus = 'pending' | 'reviewed' | 'done' | 'dismissed';

export const SUGGESTION_TYPE_LABELS: Record<SuggestionType, string> = {
  improvement: 'Amélioration de l\'app',
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

export interface SubmitSuggestionInput {
  suggestionType: SuggestionType;
  title?: string;
  placeName?: string;
  description: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  countryCode?: string;
  userId?: string | null;
}

const LOCAL_KEY = 'loop_community_suggestions_v1';

function isMissingSuggestionsTable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('community_suggestions') &&
    (m.includes('schema cache') ||
      m.includes('does not exist') ||
      m.includes('could not find') ||
      m.includes('relation') && m.includes('does not exist'))
  );
}

function logSuggestionsError(message: string): void {
  if (isMissingSuggestionsTable(message)) return;
  console.warn('[Suggestions]', message);
}

interface DbRow {
  id: string;
  suggestion_type: string;
  title: string | null;
  place_name: string | null;
  description: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  country_code: string;
  user_id: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(row: DbRow): CommunitySuggestion {
  const type = row.suggestion_type as SuggestionType;
  const status = row.status as SuggestionStatus;
  return {
    id: row.id,
    suggestionType: SUGGESTION_TYPE_LABELS[type] ? type : 'other',
    title: row.title,
    placeName: row.place_name,
    description: row.description,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    countryCode: row.country_code ?? DEFAULT_COUNTRY_CODE,
    userId: row.user_id,
    status: SUGGESTION_STATUS_LABELS[status] ? status : 'pending',
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

async function loadLocalFallback(): Promise<CommunitySuggestion[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CommunitySuggestion[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocalFallback(items: CommunitySuggestion[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

function suggestionsScope(countryCode?: string): string {
  return countryCode ?? '__ALL__';
}

function filterByCountry(items: CommunitySuggestion[], countryCode?: string): CommunitySuggestion[] {
  return countryCode ? items.filter((s) => s.countryCode === countryCode) : items;
}

async function fetchRemoteSuggestions(countryCode?: string): Promise<CommunitySuggestion[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  let query = supabase
    .from('community_suggestions')
    .select('id, suggestion_type, title, place_name, description, contact_name, contact_email, contact_phone, country_code, user_id, status, admin_notes, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (countryCode) query = query.eq('country_code', countryCode);

  const { data, error } = await query;
  if (error) {
    logSuggestionsError(error.message);
    return null;
  }

  const remote = (data as DbRow[]).map(mapRow);
  const local = await loadLocalFallback();
  const remoteIds = new Set(remote.map((r) => r.id));
  return [...remote, ...local.filter((l) => !remoteIds.has(l.id))];
}

/** Suggestions immédiates depuis le cache local. */
export async function peekCommunitySuggestions(countryCode?: string): Promise<CommunitySuggestion[]> {
  const scope = suggestionsScope(countryCode);
  const diskKey = scopedStorageKey('loop_suggestions', scope);
  const cached = await peekScoped<CommunitySuggestion[]>(scope, diskKey);
  if (cached) return cached;
  return filterByCountry(await loadLocalFallback(), countryCode);
}

export async function submitCommunitySuggestion(
  input: SubmitSuggestionInput,
): Promise<{ ok: boolean; error?: string }> {
  const description = input.description.trim();
  if (!description) return { ok: false, error: 'Décrivez votre idée.' };

  const phone = input.contactPhone?.trim() ? normalizePhone(input.contactPhone) : null;
  const email = input.contactEmail?.trim().toLowerCase() || null;
  const countryCode =
    input.countryCode ??
    (phone ? inferCountryCodeFromPhone(phone) : DEFAULT_COUNTRY_CODE);

  const payload = {
    suggestion_type: input.suggestionType,
    title: input.title?.trim() || null,
    place_name: input.placeName?.trim() || null,
    description,
    contact_name: input.contactName?.trim() || null,
    contact_email: email,
    contact_phone: phone,
    country_code: countryCode,
    user_id: input.userId ?? null,
    status: 'pending' as const,
  };

  const typeLabel = SUGGESTION_TYPE_LABELS[input.suggestionType];
  const headline = input.title?.trim() || input.placeName?.trim() || typeLabel;
  const contact = [input.contactName?.trim(), email, phone].filter(Boolean).join(' · ');

  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.from('community_suggestions').insert(payload);
    if (error) {
      logSuggestionsError(error.message);
      const local = await loadLocalFallback();
      const entry: CommunitySuggestion = {
        id: `local-${Date.now()}`,
        suggestionType: input.suggestionType,
        title: payload.title,
        placeName: payload.place_name,
        description,
        contactName: payload.contact_name,
        contactEmail: email,
        contactPhone: phone,
        countryCode,
        userId: input.userId ?? null,
        status: 'pending',
        adminNotes: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      local.unshift(entry);
      await saveLocalFallback(local);
    }
  } else {
    const local = await loadLocalFallback();
    local.unshift({
      id: `local-${Date.now()}`,
      suggestionType: input.suggestionType,
      title: payload.title,
      placeName: payload.place_name,
      description,
      contactName: payload.contact_name,
      contactEmail: email,
      contactPhone: phone,
      countryCode,
      userId: input.userId ?? null,
      status: 'pending',
      adminNotes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await saveLocalFallback(local);
  }

  await notifyAdminUsers({
    title: 'Nouvelle suggestion',
    message: `${typeLabel} — ${headline}${contact ? ` (${contact})` : ''}`,
    countryCode,
  });

  return { ok: true };
}

export async function listCommunitySuggestions(
  countryCode?: string,
  options?: { force?: boolean },
): Promise<CommunitySuggestion[]> {
  const scope = suggestionsScope(countryCode);
  const diskKey = scopedStorageKey('loop_suggestions', scope);

  if (options?.force) {
    const fresh = (await fetchRemoteSuggestions(countryCode)) ?? filterByCountry(await loadLocalFallback(), countryCode);
    await hydrateScoped(scope, diskKey, fresh);
    return fresh;
  }

  const cached = await peekScoped<CommunitySuggestion[]>(scope, diskKey);
  if (cached != null && cached.length > 0) {
    return cached;
  }

  const fresh = (await fetchRemoteSuggestions(countryCode)) ?? filterByCountry(await loadLocalFallback(), countryCode);
  await hydrateScoped(scope, diskKey, fresh);
  return fresh;
}

export async function countPendingSuggestions(countryCode?: string): Promise<number> {
  const all = await listCommunitySuggestions(countryCode);
  return all.filter((s) => s.status === 'pending').length;
}

export async function updateSuggestionStatus(
  id: string,
  status: SuggestionStatus,
  adminNotes?: string,
): Promise<boolean> {
  if (id.startsWith('local-')) {
    const all = await loadLocalFallback();
    const idx = all.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    all[idx] = {
      ...all[idx],
      status,
      adminNotes: adminNotes?.trim() || all[idx].adminNotes,
      updatedAt: new Date().toISOString(),
    };
    await saveLocalFallback(all);
    return true;
  }

  if (!isSupabaseConfigured() || !supabase) return false;

  const { error } = await supabase
    .from('community_suggestions')
    .update({
      status,
      admin_notes: adminNotes?.trim() || null,
    })
    .eq('id', id);

  if (error) {
    logSuggestionsError(error.message);
    return false;
  }
  return true;
}
