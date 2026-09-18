import { isNetworkOnline } from '@/lib/offline-store';
import { resolvePartnerUserIdForSync } from '@/lib/partner-user-resolve';
import type { StagingEvent, StagingSpot } from '@/lib/partner-staging-store';
import { syncEstablishmentOpeningHours } from '@/lib/establishment-schedules-sync';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export { resolvePartnerUserIdForSync };

function spotToPayload(spot: StagingSpot): Record<string, unknown> {
  const isTool =
    spot.subCategory === 'tools'
    || (spot.categories?.includes('tools') ?? false)
    || Boolean(spot.toolCategory?.trim());
  const categories = isTool
    ? ['tools', ...(spot.categories ?? []).filter((c) => c !== 'tools')]
    : (spot.categories?.length ? spot.categories : [spot.subCategory]);
  return {
    name: spot.name,
    description: spot.description,
    address: spot.address,
    district: spot.district,
    sub_category: isTool ? 'tools' : spot.subCategory,
    categories,
    phone: spot.phone,
    website: spot.website,
    logo_url: spot.logoUrl,
    cover_image_url: spot.coverImageUrl,
    gallery_images: spot.galleryImages,
    opening_hours: spot.openingHours,
    price_label: spot.priceLabel,
    instagram_url: spot.instagramUrl,
    facebook_url: spot.facebookUrl,
    cta_url: spot.ctaUrl,
    organizer_name: spot.organizerName,
    content_origin: spot.contentOrigin ?? 'partner',
    country_code: spot.countryCode,
    tool_category: spot.toolCategory,
    developer: spot.developer,
    is_verified: spot.isVerified ?? false,
    partnership_status: spot.partnershipStatus,
  };
}

export async function syncPartnerSpotSubmission(spot: StagingSpot): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, reason: 'no_supabase' };
  if (!(await isNetworkOnline())) return { ok: false, reason: 'offline' };

  const partnerUserId = await resolvePartnerUserIdForSync(spot.partnerId, spot.partnerName);
  if (!partnerUserId) {
    console.warn('[PartnerSync] partner_user_id introuvable pour', spot.partnerId, spot.partnerName);
    return { ok: false, reason: 'no_partner_user' };
  }

  const { error } = await supabase.rpc('upsert_partner_spot_submission', {
    p_local_id: spot.id,
    p_partner_user_id: partnerUserId,
    p_partner_name: spot.partnerName,
    p_payload: spotToPayload(spot),
    p_status: spot.status,
  });

  if (error) {
    console.warn('[PartnerSync] upsert spot:', error.message);
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

export async function publishPartnerSpotToEstablishments(localId: string): Promise<{ ok: boolean; establishmentId?: string; reason?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, reason: 'no_supabase' };
  if (!(await isNetworkOnline())) return { ok: false, reason: 'offline' };

  const { data, error } = await supabase.rpc('publish_partner_spot_submission', {
    p_local_id: localId,
  });

  if (error) {
    console.warn('[PartnerSync] publish spot:', error.message);
    return { ok: false, reason: error.message };
  }

  const establishmentId = data ? String(data) : undefined;
  if (establishmentId) {
    const { data: submission } = await supabase
      .from('partner_spot_submissions')
      .select('opening_hours')
      .eq('local_id', localId)
      .maybeSingle();
    await syncEstablishmentOpeningHours(establishmentId, submission?.opening_hours);
  }

  return { ok: true, establishmentId };
}

export async function rejectPartnerSpotSubmission(
  localId: string,
  reason?: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, reason: 'no_supabase' };
  if (!(await isNetworkOnline())) return { ok: false, reason: 'offline' };
  const { error } = await supabase.rpc('reject_partner_spot_submission', {
    p_local_id: localId,
    p_reason: reason ?? 'Refusé',
  });
  if (error) {
    console.warn('[PartnerSync] reject spot:', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

function eventToPayload(event: StagingEvent): Record<string, unknown> {
  const categories = event.categories?.length ? event.categories : [event.category];
  return {
    title: event.title,
    description: event.description,
    program: event.program,
    category: event.category,
    categories,
    starts_at: event.startsAt,
    ends_at: event.endsAt,
    venue_name: event.venueName,
    venue_address: event.venueAddress,
    venue_location: event.venueLocation ?? null,
    guinea_location_id: event.guineaLocationId ?? null,
    spot_id: event.spotId,
    entry_price: event.entryPrice,
    is_invitation_only: event.isInvitationOnly === true,
    currency: event.currency,
    info_url: event.infoUrl,
    instagram_url: event.instagramUrl,
    facebook_url: event.facebookUrl,
    website_url: event.websiteUrl,
    cover_image_url: event.coverImageUrl,
    gallery_images: event.galleryImages ?? [],
    organizer_name: event.organizerName,
    speakers: (event.speakers ?? [])
      .filter((sp) => sp.name.trim().length > 0)
      .map((sp) => ({
        name: sp.name.trim(),
        title: sp.title?.trim() || null,
        company: sp.company?.trim() || null,
      })),
    content_origin: event.contentOrigin === 'admin' || event.contentOrigin === 'loop'
      ? 'partner'
      : (event.contentOrigin ?? 'partner'),
    country_code: event.countryCode,
  };
}

function resolveMasterUserId(event: StagingEvent, partnerUserId: string): string | null {
  if (isUuid(event.masterId)) return event.masterId;
  return partnerUserId;
}

export async function syncPartnerEventSubmission(event: StagingEvent): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, reason: 'no_supabase' };
  if (!(await isNetworkOnline())) return { ok: false, reason: 'offline' };

  const partnerUserId = await resolvePartnerUserIdForSync(event.partnerId, event.partnerName);
  if (!partnerUserId) {
    console.warn('[PartnerSync] partner_user_id introuvable pour événement', event.partnerId);
    return { ok: false, reason: 'no_partner_user' };
  }

  const masterUserId = resolveMasterUserId(event, partnerUserId);
  if (!masterUserId) return { ok: false, reason: 'no_master_user' };

  const { error } = await supabase.rpc('upsert_partner_event_submission', {
    p_local_id: event.id,
    p_partner_user_id: partnerUserId,
    p_partner_name: event.partnerName,
    p_master_user_id: masterUserId,
    p_payload: eventToPayload(event),
    p_status: event.status,
  });

  if (error) {
    console.warn('[PartnerSync] upsert event:', error.message);
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

export async function publishPartnerEventToEvents(localId: string): Promise<{ ok: boolean; eventId?: string; reason?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, reason: 'no_supabase' };
  if (!(await isNetworkOnline())) return { ok: false, reason: 'offline' };

  const { data, error } = await supabase.rpc('publish_partner_event_submission', {
    p_local_id: localId,
  });

  if (error) {
    console.warn('[PartnerSync] publish event:', error.message);
    return { ok: false, reason: error.message };
  }

  return { ok: true, eventId: data ? String(data) : undefined };
}

export async function rejectPartnerEventSubmission(
  localId: string,
  reason?: string,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, reason: 'no_supabase' };
  if (!(await isNetworkOnline())) return { ok: false, reason: 'offline' };
  const { error } = await supabase.rpc('reject_partner_event_submission', {
    p_local_id: localId,
    p_reason: reason ?? 'Refusé',
  });
  if (error) {
    console.warn('[PartnerSync] reject event:', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

export async function deletePartnerEventSubmission(localId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: true };
  if (!(await isNetworkOnline())) return { ok: false, reason: 'offline' };
  const { error } = await supabase
    .from('partner_event_submissions')
    .delete()
    .eq('local_id', localId)
    .in('status', ['pending', 'draft', 'rejected']);
  if (error) {
    console.warn('[PartnerSync] delete event submission:', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

export async function deletePartnerSpotSubmission(localId: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isSupabaseConfigured() || !supabase) return { ok: true };
  if (!(await isNetworkOnline())) return { ok: false, reason: 'offline' };
  const { error } = await supabase
    .from('partner_spot_submissions')
    .delete()
    .eq('local_id', localId)
    .in('status', ['pending', 'draft', 'rejected']);
  if (error) {
    console.warn('[PartnerSync] delete spot submission:', error.message);
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

type RemoteSubmissionStatus = StagingEvent['status'];

function mapEventSubmissionRow(row: Record<string, unknown>): StagingEvent {
  const categories = Array.isArray(row.category_slugs)
    ? (row.category_slugs as string[])
    : row.category
      ? [String(row.category)]
      : ['corporate'];
  const partnerId = String(row.partner_user_id ?? row.master_user_id ?? 'partner');
  const speakersRaw = Array.isArray(row.speakers) ? row.speakers : [];
  return {
    id: String(row.local_id),
    partnerId,
    partnerName: String(row.partner_name ?? 'Partenaire'),
    masterId: String(row.master_user_id ?? partnerId),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    program: row.program ? String(row.program) : null,
    category: (categories[0] ?? 'corporate') as StagingEvent['category'],
    categories,
    startsAt: String(row.starts_at ?? new Date().toISOString()),
    endsAt: row.ends_at ? String(row.ends_at) : null,
    venueName: String(row.venue_name ?? ''),
    venueAddress: row.venue_address ? String(row.venue_address) : null,
    spotId: row.spot_id ? String(row.spot_id) : null,
    entryPrice: row.entry_price != null ? Number(row.entry_price) : null,
    isInvitationOnly: row.is_invitation_only === true,
    currency: String(row.currency ?? 'GNF'),
    infoUrl: row.info_url ? String(row.info_url) : null,
    instagramUrl: row.instagram_url ? String(row.instagram_url) : null,
    facebookUrl: row.facebook_url ? String(row.facebook_url) : null,
    websiteUrl: row.website_url ? String(row.website_url) : null,
    coverImageUrl: row.cover_image_url ? String(row.cover_image_url) : null,
    galleryImages: Array.isArray(row.gallery_images)
      ? (row.gallery_images as unknown[]).map(String).filter(Boolean)
      : [],
    speakers: speakersRaw
      .map((raw) => {
        const sp = (raw ?? {}) as Record<string, unknown>;
        return {
          name: String(sp.name ?? sp.full_name ?? '').trim(),
          title: sp.title || sp.professional_title
            ? String(sp.title ?? sp.professional_title).trim()
            : null,
          company: sp.company || sp.company_name
            ? String(sp.company ?? sp.company_name).trim()
            : null,
        };
      })
      .filter((sp) => sp.name.length > 0),
    organizerName: row.organizer_name ? String(row.organizer_name) : null,
    contentOrigin: (row.content_origin as StagingEvent['contentOrigin']) ?? 'partner',
    countryCode: String(row.country_code ?? 'GN'),
    publishedEventId: row.published_event_id ? String(row.published_event_id) : null,
    status: (row.status as RemoteSubmissionStatus) ?? 'pending',
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapSpotSubmissionRow(row: Record<string, unknown>): StagingSpot {
  const subFromRow = String(row.sub_category ?? '').trim();
  const isTool = subFromRow === 'tools';
  const categories = Array.isArray(row.category_slugs)
    ? (row.category_slugs as string[])
    : subFromRow
      ? [subFromRow]
      : ['fine_dining'];
  const subCategory = (isTool ? 'tools' : (categories[0] ?? 'fine_dining')) as StagingSpot['subCategory'];
  const galleryRaw = row.gallery_images;
  const galleryImages = Array.isArray(galleryRaw) ? galleryRaw.map(String).filter(Boolean) : [];
  return {
    id: String(row.local_id),
    partnerId: String(row.partner_user_id ?? 'partner'),
    partnerName: String(row.partner_name ?? 'Partenaire'),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    address: String(row.address ?? ''),
    district: row.district ? String(row.district) : null,
    subCategory,
    categories: isTool ? ['tools', ...categories.filter((c) => c !== 'tools')] : categories,
    phone: row.phone ? String(row.phone) : null,
    website: row.website ? String(row.website) : null,
    logoUrl: row.logo_url ? String(row.logo_url) : null,
    coverImageUrl: row.cover_image_url ? String(row.cover_image_url) : null,
    galleryImages,
    openingHours: row.opening_hours ? String(row.opening_hours) : null,
    priceLabel: row.price_label ? String(row.price_label) : null,
    instagramUrl: row.instagram_url ? String(row.instagram_url) : null,
    facebookUrl: row.facebook_url ? String(row.facebook_url) : null,
    ctaUrl: row.cta_url ? String(row.cta_url) : null,
    organizerName: row.organizer_name ? String(row.organizer_name) : null,
    countryCode: String(row.country_code ?? 'GN'),
    toolCategory: row.tool_category ? String(row.tool_category) : null,
    developer: row.developer ? String(row.developer) : null,
    isVerified: Boolean(row.is_verified),
    partnershipStatus: (row.partnership_status as StagingSpot['partnershipStatus']) ?? (isTool ? 'pending' : 'none'),
    contentOrigin: (row.content_origin as StagingSpot['contentOrigin']) ?? 'partner',
    status: (row.status as RemoteSubmissionStatus) ?? 'pending',
    publishedEstablishmentId: row.published_establishment_id ? String(row.published_establishment_id) : null,
    publishedToolId: row.published_tool_id ? String(row.published_tool_id) : null,
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of local) map.set(item.id, item);
  for (const item of remote) {
    const prev = map.get(item.id);
    if (!prev) {
      map.set(item.id, item);
      continue;
    }
    // Remote gagne pour le statut (publié / refusé) après modération multi-appareils
    map.set(item.id, { ...prev, ...item });
  }
  return Array.from(map.values());
}

/** Soumissions événement depuis Supabase (modération / mon contenu). */
export async function fetchRemotePartnerEventSubmissions(options?: {
  partnerUserId?: string;
  statuses?: RemoteSubmissionStatus[];
}): Promise<StagingEvent[]> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return [];

  let query = supabase.from('partner_event_submissions').select('local_id, partner_user_id, master_user_id, partner_name, title, description, program, category, category_slugs, starts_at, ends_at, venue_name, venue_address, spot_id, entry_price, is_invitation_only, currency, info_url, instagram_url, facebook_url, website_url, cover_image_url, gallery_images, organizer_name, content_origin, country_code, speakers, published_event_id, status, rejection_reason, created_at, updated_at');
  if (options?.partnerUserId && isUuid(options.partnerUserId)) {
    query = query.eq('partner_user_id', options.partnerUserId);
  }
  if (options?.statuses?.length) {
    query = query.in('status', options.statuses);
  }

  const { data, error } = await query.order('updated_at', { ascending: false }).limit(200);
  if (error) {
    console.warn('[PartnerSync] lecture events submissions:', error.message);
    return [];
  }
  return (data ?? []).map((row) => mapEventSubmissionRow(row as Record<string, unknown>));
}

/** Une soumission spot/outil par local_id (statut à jour côté serveur). */
export async function fetchRemotePartnerSpotSubmissionByLocalId(
  localId: string,
): Promise<StagingSpot | null> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return null;
  const id = localId.trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('partner_spot_submissions')
    .select(
      'local_id, partner_user_id, partner_name, name, description, address, district, sub_category, category_slugs, phone, website, logo_url, cover_image_url, gallery_images, opening_hours, price_label, instagram_url, facebook_url, cta_url, organizer_name, country_code, tool_category, developer, is_verified, partnership_status, content_origin, status, published_establishment_id, published_tool_id, rejection_reason, created_at, updated_at',
    )
    .eq('local_id', id)
    .maybeSingle();

  if (error || !data) return null;
  return mapSpotSubmissionRow(data as Record<string, unknown>);
}

/** Une soumission événement par local_id (statut à jour côté serveur). */
export async function fetchRemotePartnerEventSubmissionByLocalId(
  localId: string,
): Promise<StagingEvent | null> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return null;
  const id = localId.trim();
  if (!id) return null;

  const { data, error } = await supabase
    .from('partner_event_submissions')
    .select(
      'local_id, partner_user_id, master_user_id, partner_name, title, description, program, category, category_slugs, starts_at, ends_at, venue_name, venue_address, spot_id, entry_price, is_invitation_only, currency, info_url, instagram_url, facebook_url, website_url, cover_image_url, gallery_images, organizer_name, content_origin, country_code, speakers, published_event_id, status, rejection_reason, created_at, updated_at',
    )
    .eq('local_id', id)
    .maybeSingle();

  if (error || !data) return null;
  return mapEventSubmissionRow(data as Record<string, unknown>);
}

/** Soumissions spot/outil depuis Supabase (modération / mon contenu). */
export async function fetchRemotePartnerSpotSubmissions(options?: {
  partnerUserId?: string;
  statuses?: RemoteSubmissionStatus[];
}): Promise<StagingSpot[]> {
  if (!isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) return [];

  let query = supabase.from('partner_spot_submissions').select('local_id, partner_user_id, partner_name, name, description, address, district, sub_category, category_slugs, phone, website, logo_url, cover_image_url, gallery_images, opening_hours, price_label, instagram_url, facebook_url, cta_url, organizer_name, country_code, tool_category, developer, is_verified, partnership_status, content_origin, status, published_establishment_id, published_tool_id, rejection_reason, created_at, updated_at');
  if (options?.partnerUserId && isUuid(options.partnerUserId)) {
    query = query.eq('partner_user_id', options.partnerUserId);
  }
  if (options?.statuses?.length) {
    query = query.in('status', options.statuses);
  }

  const { data, error } = await query.order('updated_at', { ascending: false }).limit(200);
  if (error) {
    console.warn('[PartnerSync] lecture spots submissions:', error.message);
    return [];
  }
  return (data ?? []).map((row) => mapSpotSubmissionRow(row as Record<string, unknown>));
}

export function mergeStagingWithRemote<T extends { id: string }>(local: T[], remote: T[]): T[] {
  return mergeById(local, remote);
}
