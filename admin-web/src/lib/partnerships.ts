import { supabase } from './supabase';

export type PartnershipStatus =
  | 'pending'
  | 'to_contact'
  | 'in_discussion'
  | 'approved'
  | 'rejected';

export const PARTNERSHIP_STATUS_LABELS: Record<PartnershipStatus, string> = {
  pending: 'Nouvelle demande',
  to_contact: 'À contacter',
  in_discussion: 'En discussion',
  approved: 'Partenaire validé',
  rejected: 'Refusé',
};

export const PARTNERSHIP_STATUSES: PartnershipStatus[] = [
  'pending',
  'to_contact',
  'in_discussion',
  'approved',
  'rejected',
];

export interface PartnershipNote {
  id: string;
  partnershipId: string;
  body: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
}

export interface PartnershipRequest {
  id: string;
  establishmentName: string;
  managerName: string;
  email: string;
  phone: string;
  countryCode: string;
  status: PartnershipStatus;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  notes: PartnershipNote[];
}

function mapStatus(raw: string): PartnershipStatus {
  return PARTNERSHIP_STATUSES.includes(raw as PartnershipStatus)
    ? (raw as PartnershipStatus)
    : 'pending';
}

export async function listPartnershipRequests(
  countryCode?: string,
): Promise<{ items: PartnershipRequest[]; error?: string }> {
  let query = supabase
    .from('partnership_requests')
    .select(
      'id, establishment_name, manager_name, email, phone, country_code, status, admin_notes, created_at, updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(150);

  if (countryCode) query = query.eq('country_code', countryCode);

  const { data, error } = await query;
  if (error) return { items: [], error: error.message };
  if (!data?.length) return { items: [] };

  const ids = data.map((r) => r.id as string);
  const { data: notesData } = await supabase
    .from('partnership_notes')
    .select('id, partnership_id, author_id, author_name, body, created_at')
    .in('partnership_id', ids)
    .order('created_at', { ascending: false })
    .limit(300);

  const notes: PartnershipNote[] = (notesData ?? []).map((n) => ({
    id: String(n.id),
    partnershipId: String(n.partnership_id),
    body: String(n.body),
    authorId: n.author_id ? String(n.author_id) : null,
    authorName: n.author_name ? String(n.author_name) : 'Admin',
    createdAt: String(n.created_at),
  }));

  const items = data.map((row) => ({
    id: String(row.id),
    establishmentName: String(row.establishment_name ?? ''),
    managerName: String(row.manager_name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    countryCode: String(row.country_code ?? 'GN'),
    status: mapStatus(String(row.status ?? 'pending')),
    adminNotes: row.admin_notes ? String(row.admin_notes) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at ?? row.created_at),
    notes: notes
      .filter((n) => n.partnershipId === row.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  }));

  return { items };
}

export async function updatePartnershipStatus(
  id: string,
  status: PartnershipStatus,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('partnership_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Valide le partenariat + note rappel d'inviter le contact (Espace Pro). */
export async function approvePartnershipWithOnboarding(
  request: PartnershipRequest,
): Promise<{ ok: boolean; error?: string }> {
  const statusRes = await updatePartnershipStatus(request.id, 'approved');
  if (!statusRes.ok) return statusRes;

  const email = request.email.trim().toLowerCase();
  const label = request.establishmentName.trim() || request.managerName.trim() || 'Partenaire';
  const noteBody = email
    ? `Partenariat validé pour « ${label} ». Prochaine étape : inviter ${email} depuis Utilisateurs (rôle Partenaire) pour activer l'Espace Pro.`
    : `Partenariat validé pour « ${label} ». Prochaine étape : inviter le contact depuis Utilisateurs (rôle Partenaire).`;

  const noteRes = await addPartnershipNote(request.id, noteBody, null, 'Système THE LOOP');
  if (!noteRes.ok) return { ok: false, error: noteRes.error ?? 'Note système impossible.' };
  return { ok: true };
}

export async function addPartnershipNote(
  partnershipId: string,
  body: string,
  authorId: string | null,
  authorName: string,
): Promise<{ ok: boolean; note?: PartnershipNote; error?: string }> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'Note vide.' };

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

  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    note: {
      id: String(data.id),
      partnershipId,
      body: trimmed,
      authorId,
      authorName,
      createdAt: String(data.created_at),
    },
  };
}
