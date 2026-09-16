import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveCountryCode } from '@/lib/admin-country';
import { hydrateScoped, peekScoped, scopedStorageKey } from '@/lib/swr-cache';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { onboardApprovedPartnership } from '@/lib/admin-partner-token-store';
import type { PartnershipNote, PartnershipRequest, PartnershipStatus } from '@/lib/admin-types';
import { PARTNERSHIP_STATUS_LABELS } from '@/lib/admin-types';

export { PARTNERSHIP_STATUS_LABELS };

const LOCAL_NOTES_KEY = 'loop_admin_partnership_notes_v1';

interface DbPartnershipRow {
  id: string;
  establishment_name: string;
  manager_name: string;
  email: string;
  phone: string;
  country_code?: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at?: string | null;
}

interface DbNoteRow {
  id: string;
  partnership_id: string;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

async function loadLocalNotes(): Promise<PartnershipNote[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_NOTES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PartnershipNote[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocalNotes(notes: PartnershipNote[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_NOTES_KEY, JSON.stringify(notes));
}

function mapStatus(raw: string): PartnershipStatus {
  const allowed: PartnershipStatus[] = ['pending', 'to_contact', 'in_discussion', 'approved', 'rejected'];
  return allowed.includes(raw as PartnershipStatus) ? (raw as PartnershipStatus) : 'pending';
}

function mapRow(row: DbPartnershipRow, notes: PartnershipNote[]): PartnershipRequest {
  return {
    id: row.id,
    establishmentName: row.establishment_name,
    managerName: row.manager_name,
    email: row.email,
    phone: row.phone,
    countryCode: resolveCountryCode(row.country_code, row.phone),
    status: mapStatus(row.status),
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
    notes: notes.filter((n) => n.partnershipId === row.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

function partnershipsScope(countryCode?: string): string {
  return countryCode ?? '__ALL__';
}

async function fetchPartnershipRequests(countryCode?: string): Promise<PartnershipRequest[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const localNotes = await loadLocalNotes();

  let query = supabase
    .from('partnership_requests')
    .select('id, establishment_name, manager_name, email, phone, country_code, status, admin_notes, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (countryCode) {
    query = query.eq('country_code', countryCode);
  }

  const { data, error } = await query;

  if (error) {
    console.warn('[Partenariats]', error.message);
    return null;
  }
  if (!data?.length) return [];

  let dbNotes: DbNoteRow[] = [];
  const { data: notesData } = await supabase
    .from('partnership_notes')
    .select('id, partnership_id, author_id, author_name, body, created_at')
    .order('created_at', { ascending: false })
    .limit(15);

  if (notesData) dbNotes = notesData as DbNoteRow[];

  const allNotes: PartnershipNote[] = [
    ...localNotes,
    ...dbNotes.map((n) => ({
      id: n.id,
      partnershipId: n.partnership_id,
      body: n.body,
      authorId: n.author_id,
      authorName: n.author_name ?? 'Admin',
      createdAt: n.created_at,
    })),
  ];

  return (data as DbPartnershipRow[])
    .map((row) => mapRow(row, allNotes))
    .filter((p) => !countryCode || p.countryCode === countryCode);
}

/** Demandes partenariat immédiates depuis le cache. */
export async function peekPartnershipRequests(countryCode?: string): Promise<PartnershipRequest[]> {
  const scope = partnershipsScope(countryCode);
  const diskKey = scopedStorageKey('loop_partnerships', scope);
  return (await peekScoped<PartnershipRequest[]>(scope, diskKey)) ?? [];
}

export async function listPartnershipRequests(
  countryCode?: string,
  options?: { force?: boolean },
): Promise<PartnershipRequest[]> {
  const scope = partnershipsScope(countryCode);
  const diskKey = scopedStorageKey('loop_partnerships', scope);

  if (options?.force) {
    const fresh = (await fetchPartnershipRequests(countryCode)) ?? [];
    await hydrateScoped(scope, diskKey, fresh);
    return fresh;
  }

  const cached = await peekScoped<PartnershipRequest[]>(scope, diskKey);
  if (cached != null && cached.length > 0) {
    return cached;
  }

  const fresh = (await fetchPartnershipRequests(countryCode)) ?? [];
  await hydrateScoped(scope, diskKey, fresh);
  return fresh;
}

export async function approvePartnershipWithOnboarding(
  request: PartnershipRequest,
): Promise<{ ok: boolean; tokenCode?: string; error?: string }> {
  const statusRes = await updatePartnershipStatus(request.id, 'approved');
  if (!statusRes.ok) return statusRes;

  return onboardApprovedPartnership({
    partnershipId: request.id,
    establishmentName: request.establishmentName,
    managerName: request.managerName,
    email: request.email,
  });
}

export async function updatePartnershipStatus(
  id: string,
  status: PartnershipStatus,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Supabase non configuré.' };
  }
  const { error } = await supabase
    .from('partnership_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  const scope = partnershipsScope();
  const diskKey = scopedStorageKey('loop_partnerships', scope);
  const cached = await peekPartnershipRequests();
  const next = cached.map((p) => (p.id === id ? { ...p, status, updatedAt: new Date().toISOString() } : p));
  await hydrateScoped(scope, diskKey, next);

  return { ok: true };
}

export async function addPartnershipNote(
  partnershipId: string,
  body: string,
  authorId: string | null,
  authorName: string,
): Promise<PartnershipNote> {
  const trimmed = body.trim();
  const note: PartnershipNote = {
    id: `pn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partnershipId,
    body: trimmed,
    authorId,
    authorName,
    createdAt: new Date().toISOString(),
  };

  if (isSupabaseConfigured() && supabase) {
    const { data, error } = await supabase
      .from('partnership_notes')
      .insert({
        partnership_id: partnershipId,
        author_id: authorId,
        author_name: authorName,
        body: trimmed,
      })
      .select('id, created_at')
      .single();

    if (!error && data) {
      note.id = data.id;
      note.createdAt = data.created_at;
    }
  } else {
    const notes = await loadLocalNotes();
    notes.unshift(note);
    await saveLocalNotes(notes);
  }

  return note;
}

export async function countPartnershipsByStatus(countryCode?: string): Promise<Record<PartnershipStatus, number>> {
  const list = await listPartnershipRequests(countryCode);
  const counts: Record<PartnershipStatus, number> = {
    pending: 0,
    to_contact: 0,
    in_discussion: 0,
    approved: 0,
    rejected: 0,
  };
  for (const p of list) counts[p.status] += 1;
  return counts;
}
