import { loadContentSnapshot } from '@/lib/content-store';
import {
  neighborhoodLabelForSupabase,
  resolvePublishedEventId,
  resolvePublishedSpotTarget,
  resolveSupabaseLocationId,
  syncPublishedSpotSubmissionLocation,
  type PublishedSpotTarget,
} from '@/lib/admin-location-sync';
import {
  isStoredNaLocation,
  isStoredOnlineLocation,
} from '@/lib/content-location-utils';
import { syncEstablishmentOpeningHours } from '@/lib/establishment-schedules-sync';
import { canonicalizeGuineaLocationLabel, guineaLocationSnapshotFromStored, sanitizePhysicalLocationInput, type GuineaLocationSnapshot } from '@/lib/guinea-locations';
import { mapDbEstablishmentToHomeLocation, mapDbToolToHomeLocation, formatProgramFromSchedules } from '@/lib/content-mappers';
import type { HomeLocation } from '@/lib/demo-data';
import {
  getStagingEventById,
  getStagingSpotById,
  mergeStagingEvent,
  mergeStagingSpot,
  type StagingEvent,
  type StagingSpot,
} from '@/lib/partner-staging-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { EventCategory, LocationSubCategory, ToolPartnershipStatus } from '@/types';
import { normalizeCategoriesList } from '@/lib/content-categories-utils';
import { eventGalleryExtras } from '@/lib/detail-gallery-utils';

const ESTABLISHMENT_EDIT_SELECT = `
  id, name, description, price_indicator, phone_contact, action_link, website_url,
  instagram_url, facebook_url, latitude, longitude, location_id, is_active, country_code,
  content_origin, click_count, favorite_count, engagement_score, star_count, stars_source,
  admin_star_override, rating_avg, rating_count, category_slugs, opening_hours_label,
  is_featured, featured_end_date, created_at,
  locations ( id, neighborhood_name, city, country, country_code ),
  establishment_photos ( id, photo_url, is_primary ),
  establishment_schedules ( id, day_of_week, opening_time, closing_time, is_closed )
`;

const TOOL_EDIT_SELECT = `
  id, name, description, category_slugs, logo_url, website_url, action_link,
  instagram_url, facebook_url, phone_contact, developer, is_verified, partnership_status,
  country_code, content_origin, content_status, is_active, click_count, favorite_count,
  engagement_score, star_count, stars_source, admin_star_override, rating_avg, rating_count,
  created_at, is_featured, featured_start_date, featured_end_date,
  tool_photos ( id, photo_url, is_primary )
`;

const EVENT_EDIT_SELECT = `
  id, title, description, banner_url, fallback_color, organizer_id, master_id, organizer_name,
  content_origin, is_external_location, establishment_id, custom_location_name, location_id,
  guinea_location_id, venue_location,
  start_date, end_date, is_free, is_invitation_only, ticket_price, action_link, website_url,
  instagram_url, facebook_url, is_loop_x, reveal_price, is_featured, featured_end_date,
  country_code, category_slugs, created_at, click_count, favorite_count, gallery_images,
  locations ( id, neighborhood_name, city, country ),
  establishments ( id, name ),
  event_schedules ( id, time_label, activity_title, order_index ),
  event_speakers ( id, full_name, professional_title, company_name, photo_url )
`;

export type ContentSource = 'staging' | 'supabase' | 'snapshot';

export interface EditableSpeakerInput {
  name: string;
  title?: string | null;
  company?: string | null;
}

export interface EditableEventPayload {
  source: ContentSource;
  id: string;
  title: string;
  description: string;
  program: string | null;
  category: EventCategory;
  categories?: string[];
  startsAt: string;
  endsAt: string | null;
  venueName: string;
  venueAddress: string | null;
  venueLocation?: GuineaLocationSnapshot | null;
  guineaLocationId?: number | null;
  spotId: string | null;
  entryPrice: number | null;
  isInvitationOnly?: boolean;
  currency: string;
  infoUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
  coverImageUrl: string | null;
  galleryImages: string[];
  organizerName: string | null;
  countryCode: string;
  speakers?: EditableSpeakerInput[];
}

export interface EditableSpotPayload {
  source: ContentSource;
  id: string;
  name: string;
  description: string;
  address: string;
  district: string | null;
  subCategory: LocationSubCategory;
  categories?: string[];
  phone: string | null;
  website: string | null;
  logoUrl?: string | null;
  toolCategory?: string | null;
  isVerified?: boolean;
  developer?: string | null;
  partnershipStatus?: ToolPartnershipStatus;
  openingHours: string | null;
  priceLabel: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  ctaUrl: string | null;
  galleryImages: string[];
  coverImageUrl: string | null;
  organizerName: string | null;
  countryCode: string;
}

function fromHomeLocation(spot: HomeLocation, source: ContentSource): EditableSpotPayload {
  return {
    source,
    id: spot.id,
    name: spot.name,
    description: spot.description,
    address: spot.address,
    district: spot.district ?? null,
    subCategory: spot.subCategory,
    categories: spot.categories,
    phone: spot.phone,
    website: spot.website,
    logoUrl: spot.logoUrl ?? null,
    toolCategory: spot.toolCategory ?? null,
    isVerified: spot.isVerified ?? false,
    developer: spot.developer ?? null,
    partnershipStatus: spot.partnershipStatus ?? 'none',
    openingHours: spot.openingHours,
    priceLabel: spot.priceLabel,
    instagramUrl: spot.instagramUrl ?? null,
    facebookUrl: spot.facebookUrl ?? null,
    ctaUrl: spot.ctaUrl ?? null,
    galleryImages: spot.galleryImages ?? [],
    coverImageUrl: spot.coverImageUrl,
    organizerName: spot.organizerName ?? null,
    countryCode: spot.countryCode ?? 'GN',
  };
}

function submissionRowToStagingSpot(row: Record<string, unknown>, partnerId: string): StagingSpot {
  const categories = normalizeCategoriesList(
    row.category_slugs ?? row.sub_category,
    'fine_dining',
  );
  const subCategory = (categories[0] ?? 'fine_dining') as LocationSubCategory;
  const galleryRaw = row.gallery_images;
  const galleryImages = Array.isArray(galleryRaw)
    ? galleryRaw.map(String).filter(Boolean)
    : [];

  return {
    id: String(row.local_id),
    partnerId,
    partnerName: String(row.partner_name ?? 'Partenaire'),
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    address: String(row.address ?? ''),
    district: row.district ? String(row.district) : null,
    subCategory,
    categories,
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
    partnershipStatus: (row.partnership_status as ToolPartnershipStatus) ?? 'none',
    status: (row.status as StagingSpot['status']) ?? 'pending',
    rejectionReason: row.rejection_reason ? String(row.rejection_reason) : undefined,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

async function fetchSpotFromPartnerSubmission(id: string): Promise<EditableSpotPayload | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from('partner_spot_submissions')
    .select('local_id, partner_user_id, partner_name, name, description, address, district, sub_category, category_slugs, phone, website, logo_url, cover_image_url, gallery_images, opening_hours, price_label, instagram_url, facebook_url, cta_url, organizer_name, country_code, tool_category, developer, is_verified, partnership_status, content_origin, status, published_establishment_id, published_tool_id, rejection_reason, created_at, updated_at')
    .or(`local_id.eq.${id},published_establishment_id.eq.${id},published_tool_id.eq.${id}`)
    .maybeSingle();
  if (error || !data) return null;

  const partnerId = data.partner_user_id ? String(data.partner_user_id) : 'partner';
  const staging = submissionRowToStagingSpot(data as Record<string, unknown>, partnerId);
  await mergeStagingSpot(staging);
  const payload = fromStagingSpot(staging);
  const publishedEstablishmentId = data.published_establishment_id
    ? String(data.published_establishment_id)
    : null;
  const publishedToolId = data.published_tool_id ? String(data.published_tool_id) : null;
  const publishedId = publishedToolId ?? publishedEstablishmentId;
  if (publishedId && id === publishedId) {
    payload.id = publishedId;
    payload.source = 'supabase';
  }
  return payload;
}

async function fetchSpotFromEstablishments(id: string): Promise<EditableSpotPayload | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  const toolRes = await supabase.from('tools').select(TOOL_EDIT_SELECT).eq('id', id).maybeSingle();
  if (!toolRes.error && toolRes.data) {
    const slug = String(toolRes.data.name ?? 'outil').toLowerCase().replace(/\s+/g, '-');
    const home = mapDbToolToHomeLocation(toolRes.data, slug);
    const payload = fromHomeLocation(home, 'supabase');
    const { data: submission } = await supabase
      .from('partner_spot_submissions')
      .select('address, district')
      .eq('published_tool_id', id)
      .maybeSingle();
    if (submission) {
      if (submission.address != null) payload.address = String(submission.address);
      payload.district = submission.district ? String(submission.district) : null;
    }
    return payload;
  }

  const { data, error } = await supabase
    .from('establishments')
    .select(ESTABLISHMENT_EDIT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;

  const slug = String(data.name ?? 'spot').toLowerCase().replace(/\s+/g, '-');
  const home = mapDbEstablishmentToHomeLocation(data, slug);
  const payload = fromHomeLocation(home, 'supabase');

  if (data.opening_hours_label?.trim()) {
    payload.openingHours = String(data.opening_hours_label).trim();
  } else if (!payload.openingHours || payload.openingHours === 'Horaires sur demande') {
    const { data: submission } = await supabase
      .from('partner_spot_submissions')
      .select('opening_hours')
      .eq('published_establishment_id', id)
      .maybeSingle();
    if (submission?.opening_hours?.trim()) {
      payload.openingHours = submission.opening_hours.trim();
    }
  }

  if (!payload.instagramUrl || !payload.facebookUrl || !payload.website || !payload.ctaUrl) {
    const { data: submissionLinks } = await supabase
      .from('partner_spot_submissions')
      .select('instagram_url, facebook_url, website, cta_url')
      .eq('published_establishment_id', id)
      .maybeSingle();
    if (submissionLinks) {
      if (!payload.instagramUrl && submissionLinks.instagram_url) {
        payload.instagramUrl = String(submissionLinks.instagram_url);
      }
      if (!payload.facebookUrl && submissionLinks.facebook_url) {
        payload.facebookUrl = String(submissionLinks.facebook_url);
      }
      if (!payload.website && submissionLinks.website) {
        payload.website = String(submissionLinks.website);
      }
      if (!payload.ctaUrl && submissionLinks.cta_url) {
        payload.ctaUrl = String(submissionLinks.cta_url);
      }
    }
  }

  const { data: submissionLoc } = await supabase
    .from('partner_spot_submissions')
    .select('address, district')
    .eq('published_establishment_id', id)
    .maybeSingle();
  if (submissionLoc?.address != null) {
    payload.address = String(submissionLoc.address);
    payload.district = submissionLoc.district ? String(submissionLoc.district) : null;
  }

  return payload;
}

async function fetchEventFromPartnerSubmission(id: string): Promise<EditableEventPayload | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from('partner_event_submissions')
    .select('local_id, partner_user_id, master_user_id, partner_name, title, description, program, category, category_slugs, starts_at, ends_at, venue_name, venue_address, venue_location, guinea_location_id, spot_id, entry_price, is_invitation_only, currency, info_url, instagram_url, facebook_url, website_url, cover_image_url, gallery_images, organizer_name, content_origin, country_code, speakers, published_event_id, status, rejection_reason, created_at, updated_at')
    .or(`local_id.eq.${id},published_event_id.eq.${id}`)
    .maybeSingle();
  if (error || !data) return null;

  const categories = normalizeCategoriesList(data.category_slugs ?? data.category, 'corporate');
  const staging: StagingEvent = {
    id: String(data.local_id),
    partnerId: data.partner_user_id ? String(data.partner_user_id) : 'partner',
    partnerName: String(data.partner_name ?? 'Partenaire'),
    masterId: data.master_user_id ? String(data.master_user_id) : String(data.partner_user_id ?? 'partner'),
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    program: data.program ? String(data.program) : null,
    category: categories[0] as EventCategory,
    categories,
    startsAt: String(data.starts_at ?? new Date().toISOString()),
    endsAt: data.ends_at ? String(data.ends_at) : null,
    venueName: String(data.venue_name ?? ''),
    venueAddress: data.venue_address
      ? sanitizePhysicalLocationInput(String(data.venue_address), null, String(data.venue_name ?? '')) || null
      : null,
    venueLocation: data.venue_location
      ? guineaLocationSnapshotFromStored(data.venue_location, String(data.country_code ?? 'GN'))
      : null,
    guineaLocationId: data.guinea_location_id != null ? Number(data.guinea_location_id) : null,
    spotId: data.spot_id ? String(data.spot_id) : null,
    entryPrice: data.entry_price != null ? Number(data.entry_price) : null,
    currency: String(data.currency ?? 'GNF'),
    infoUrl: data.info_url ? String(data.info_url) : null,
    instagramUrl: data.instagram_url ? String(data.instagram_url) : null,
    facebookUrl: data.facebook_url ? String(data.facebook_url) : null,
    websiteUrl: data.website_url ? String(data.website_url) : null,
    coverImageUrl: data.cover_image_url ? String(data.cover_image_url) : null,
    galleryImages: eventGalleryExtras(
      data.cover_image_url ? String(data.cover_image_url) : null,
      Array.isArray(data.gallery_images) ? (data.gallery_images as unknown[]).map(String) : [],
    ),
    organizerName: data.organizer_name ? String(data.organizer_name) : null,
    contentOrigin: (data.content_origin as StagingEvent['contentOrigin']) ?? 'partner',
    countryCode: String(data.country_code ?? 'GN'),
    speakers: Array.isArray(data.speakers)
      ? (data.speakers as Array<Record<string, unknown>>)
          .map((sp) => ({
            name: String(sp.name ?? sp.full_name ?? '').trim(),
            title: sp.title != null || sp.professional_title != null
              ? String(sp.title ?? sp.professional_title)
              : null,
            company: sp.company != null || sp.company_name != null
              ? String(sp.company ?? sp.company_name)
              : null,
          }))
          .filter((sp) => sp.name.length > 0)
      : [],
    status: (data.status as StagingEvent['status']) ?? 'pending',
    rejectionReason: data.rejection_reason ? String(data.rejection_reason) : undefined,
    createdAt: String(data.created_at ?? new Date().toISOString()),
    updatedAt: String(data.updated_at ?? new Date().toISOString()),
  };
  await mergeStagingEvent(staging);
  const payload = fromStagingEvent(staging);
  const publishedEventId = data.published_event_id ? String(data.published_event_id) : null;
  if (publishedEventId && id === publishedEventId) {
    payload.id = publishedEventId;
    payload.source = 'supabase';
  }
  return payload;
}

async function fetchEventSubmissionMeta(eventId: string): Promise<{
  venueName: string | null;
  venueAddress: string | null;
  venueLocation: GuineaLocationSnapshot | null;
  guineaLocationId: number | null;
  spotId: string | null;
  program: string | null;
  infoUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  websiteUrl: string | null;
} | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data } = await supabase
    .from('partner_event_submissions')
    .select('venue_name, venue_address, venue_location, guinea_location_id, spot_id, program, info_url, instagram_url, facebook_url, website_url')
    .eq('published_event_id', eventId)
    .maybeSingle();
  if (!data) return null;
  return {
    venueName: data.venue_name ? String(data.venue_name) : null,
    venueAddress: data.venue_address != null ? String(data.venue_address) : null,
    venueLocation: data.venue_location
      ? guineaLocationSnapshotFromStored(data.venue_location)
      : null,
    guineaLocationId: data.guinea_location_id != null ? Number(data.guinea_location_id) : null,
    spotId: data.spot_id ? String(data.spot_id) : null,
    program: data.program ? String(data.program) : null,
    infoUrl: data.info_url ? String(data.info_url) : null,
    instagramUrl: data.instagram_url ? String(data.instagram_url) : null,
    facebookUrl: data.facebook_url ? String(data.facebook_url) : null,
    websiteUrl: data.website_url ? String(data.website_url) : null,
  };
}

async function fetchEventFromSupabase(id: string): Promise<EditableEventPayload | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from('events')
    .select(EVENT_EDIT_SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;

  const categories = normalizeCategoriesList(data.category_slugs ?? [], 'corporate');
  const submissionMeta = await fetchEventSubmissionMeta(id);
  const programFromSchedules = formatProgramFromSchedules(data.event_schedules ?? null);
  const actionLink = data.action_link ? String(data.action_link) : null;
  const locationJoin = Array.isArray(data.locations) ? data.locations[0] : data.locations;
  const establishmentJoin = Array.isArray(data.establishments) ? data.establishments[0] : data.establishments;
  const venueAddressFromJoin = locationJoin
    ? `${locationJoin.neighborhood_name}, ${locationJoin.city}`
    : null;

  return {
    source: 'supabase',
    id: String(data.id),
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    program: submissionMeta?.program ?? programFromSchedules,
    category: categories[0] as EventCategory,
    categories,
    startsAt: String(data.start_date ?? new Date().toISOString()),
    endsAt: data.end_date ? String(data.end_date) : null,
    venueName: submissionMeta?.venueName
      ?? String(data.custom_location_name ?? establishmentJoin?.name ?? ''),
    venueAddress: (() => {
      const venueNameHint = submissionMeta?.venueName
        ?? String(data.custom_location_name ?? establishmentJoin?.name ?? '');
      if (submissionMeta?.venueAddress != null) {
        const cleaned = sanitizePhysicalLocationInput(
          submissionMeta.venueAddress,
          null,
          venueNameHint,
        );
        return cleaned || null;
      }
      return venueAddressFromJoin ? canonicalizeGuineaLocationLabel(venueAddressFromJoin) : null;
    })(),
    venueLocation: submissionMeta?.venueLocation
      ?? (data.venue_location ? guineaLocationSnapshotFromStored(data.venue_location, String(data.country_code ?? 'GN')) : null),
    guineaLocationId: submissionMeta?.guineaLocationId
      ?? (data.guinea_location_id != null ? Number(data.guinea_location_id) : null),
    spotId: submissionMeta?.spotId ?? (data.establishment_id ? String(data.establishment_id) : null),
    entryPrice: data.is_invitation_only
      ? null
      : (data.is_free ? null : (data.ticket_price != null ? Number(data.ticket_price) : null)),
    isInvitationOnly: Boolean(data.is_invitation_only),
    currency: 'GNF',
    infoUrl: submissionMeta?.infoUrl ?? actionLink,
    instagramUrl: data.instagram_url ? String(data.instagram_url) : (submissionMeta?.instagramUrl ?? null),
    facebookUrl: data.facebook_url ? String(data.facebook_url) : (submissionMeta?.facebookUrl ?? null),
    websiteUrl: data.website_url
      ? String(data.website_url)
      : (submissionMeta?.websiteUrl ?? null),
    coverImageUrl: data.banner_url ? String(data.banner_url) : null,
    galleryImages: eventGalleryExtras(
      data.banner_url ? String(data.banner_url) : null,
      Array.isArray(data.gallery_images) ? (data.gallery_images as unknown[]).map(String) : [],
    ),
    organizerName: data.organizer_name ? String(data.organizer_name) : null,
    countryCode: String(data.country_code ?? 'GN'),
    speakers: normalizeEditableSpeakers(data.event_speakers),
  };
}

function normalizeEditableSpeakers(raw: unknown): EditableSpeakerInput[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const sp = item as Record<string, unknown>;
      const name = String(sp.full_name ?? sp.name ?? '').trim();
      if (!name) return null;
      return {
        name,
        title: sp.professional_title != null || sp.title != null
          ? String(sp.professional_title ?? sp.title)
          : null,
        company: sp.company_name != null || sp.company != null
          ? String(sp.company_name ?? sp.company)
          : null,
      };
    })
    .filter((sp): sp is NonNullable<typeof sp> => sp !== null);
}

async function syncEventProgram(eventId: string, program: string | null): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  await supabase.from('event_schedules').delete().eq('event_id', eventId);
  const trimmed = program?.trim();
  if (!trimmed) return;
  await supabase.from('event_schedules').insert({
    event_id: eventId,
    time_label: 'Programme',
    activity_title: trimmed.slice(0, 255),
    order_index: 1,
  });
}

export async function syncEditableEventSpeakers(
  eventId: string,
  speakers: EditableSpeakerInput[] | undefined,
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;
  const payload = (speakers ?? [])
    .filter((speaker) => speaker.name.trim().length > 0)
    .map((speaker) => ({
      name: speaker.name.trim(),
      title: speaker.title?.trim() || null,
      company: speaker.company?.trim() || null,
    }));

  const { error } = await supabase.rpc('sync_event_speakers', {
    p_event_id: eventId,
    p_speakers: payload,
  });
  if (error) {
    console.warn('[AdminEdit] event_speakers:', error.message);
    return false;
  }
  return true;
}

function isCatalogUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function buildEventSubmissionPatch(payload: EditableEventPayload): Record<string, unknown> {
  return {
    title: payload.title.trim(),
    description: payload.description.trim(),
    program: payload.program,
    category: payload.category,
    category_slugs: payload.categories?.length ? payload.categories : [payload.category],
    starts_at: new Date(payload.startsAt).toISOString(),
    ends_at: payload.endsAt ? new Date(payload.endsAt).toISOString() : null,
    venue_name: payload.venueName.trim(),
    venue_address: payload.venueAddress,
    venue_location: payload.venueLocation ?? null,
    guinea_location_id: payload.guineaLocationId ?? null,
    spot_id: payload.spotId,
    entry_price: payload.isInvitationOnly || payload.entryPrice == null ? null : payload.entryPrice,
    currency: payload.currency,
    info_url: payload.infoUrl,
    instagram_url: payload.instagramUrl,
    facebook_url: payload.facebookUrl,
    website_url: payload.websiteUrl,
    cover_image_url: payload.coverImageUrl,
    gallery_images: eventGalleryExtras(payload.coverImageUrl, payload.galleryImages),
    organizer_name: payload.organizerName,
    country_code: payload.countryCode,
    updated_at: new Date().toISOString(),
  };
}

/** Slugs outil depuis content_categories (plus de colonne tools.tool_category). */
function resolveToolCategorySlugs(payload: EditableSpotPayload): string[] {
  const fromCategories = (payload.categories ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== 'tools');
  if (fromCategories.length) return fromCategories;

  const fromToolCategory = payload.toolCategory?.trim();
  if (fromToolCategory && fromToolCategory !== 'tools') return [fromToolCategory];

  return ['tool-autre'];
}

function buildSpotSubmissionPatch(payload: EditableSpotPayload): Record<string, unknown> {
  const isTool = payload.subCategory === 'tools' || Boolean(payload.toolCategory);
  const categorySlugs = isTool
    ? resolveToolCategorySlugs(payload)
    : payload.categories?.length
      ? payload.categories
      : [payload.subCategory];

  return {
    name: payload.name.trim(),
    description: payload.description.trim(),
    address: payload.address.trim(),
    district: payload.district,
    sub_category: payload.subCategory,
    category_slugs: categorySlugs,
    phone: payload.phone,
    website: payload.website,
    opening_hours: payload.openingHours,
    price_label: payload.priceLabel,
    instagram_url: payload.instagramUrl,
    facebook_url: payload.facebookUrl,
    cta_url: payload.ctaUrl,
    cover_image_url: payload.coverImageUrl,
    gallery_images: payload.galleryImages,
    logo_url: payload.logoUrl ?? null,
    // Colonne legacy encore présente sur partner_spot_submissions (pas sur tools).
    tool_category: isTool ? (resolveToolCategorySlugs(payload)[0] ?? null) : null,
    developer: payload.developer ?? null,
    is_verified: payload.isVerified ?? false,
    partnership_status: payload.partnershipStatus ?? null,
    organizer_name: payload.organizerName,
    country_code: payload.countryCode,
    updated_at: new Date().toISOString(),
  };
}

async function syncEventSubmissionFull(eventId: string, payload: EditableEventPayload): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const patch = buildEventSubmissionPatch(payload);

  const { data: existing } = await supabase
    .from('partner_event_submissions')
    .select('id')
    .eq('published_event_id', eventId)
    .maybeSingle();
  if (existing) {
    await supabase.from('partner_event_submissions').update(patch).eq('published_event_id', eventId);
    return;
  }

  const { data: eventRow } = await supabase
    .from('events')
    .select('organizer_id, master_id')
    .eq('id', eventId)
    .maybeSingle();
  const { data: authData } = await supabase.auth.getUser();
  const partnerUserId = eventRow?.organizer_id
    ? String(eventRow.organizer_id)
    : (authData.user?.id ?? null);

  await supabase.from('partner_event_submissions').insert({
    local_id: `admin-sync-${eventId}`,
    partner_user_id: partnerUserId,
    partner_name: payload.organizerName?.trim() || 'THE LOOP Admin',
    master_user_id: eventRow?.master_id ? String(eventRow.master_id) : partnerUserId,
    published_event_id: eventId,
    status: 'approved',
    ...patch,
  });
}

async function syncSpotSubmissionFull(
  target: PublishedSpotTarget,
  payload: EditableSpotPayload,
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const patch = buildSpotSubmissionPatch(payload);
  const publishedColumn = target.kind === 'tool' ? 'published_tool_id' : 'published_establishment_id';

  const { data: existing } = await supabase
    .from('partner_spot_submissions')
    .select('id')
    .eq(publishedColumn, target.id)
    .maybeSingle();
  if (existing) {
    await supabase.from('partner_spot_submissions').update(patch).eq(publishedColumn, target.id);
    return;
  }

  const { data: authData } = await supabase.auth.getUser();
  const partnerUserId = authData.user?.id ?? null;
  const localPrefix = target.kind === 'tool' ? 'tool-admin' : 'spot-admin';

  await supabase.from('partner_spot_submissions').insert({
    local_id: `${localPrefix}-${target.id}`,
    partner_user_id: partnerUserId,
    partner_name: payload.organizerName?.trim() || payload.developer?.trim() || 'THE LOOP Admin',
    [publishedColumn]: target.id,
    status: 'approved',
    ...patch,
  });
}

async function resolveEventLocationId(payload: EditableEventPayload): Promise<number | null | undefined> {
  const addr = payload.venueAddress?.trim() ?? '';
  const isVirtual = isStoredOnlineLocation(addr) || isStoredNaLocation(addr);
  const neighborhood = payload.venueLocation?.district
    ?? neighborhoodLabelForSupabase(payload.venueAddress, null, payload.venueName);
  if (isVirtual) {
    return neighborhood ? await resolveSupabaseLocationId(neighborhood) : null;
  }
  if (!neighborhood) return undefined;
  return await resolveSupabaseLocationId(neighborhood);
}

async function resolveSpotLocationId(payload: EditableSpotPayload): Promise<number | null | undefined> {
  const addr = payload.address?.trim() ?? '';
  const isVirtual = isStoredOnlineLocation(addr) || isStoredNaLocation(addr);
  const neighborhood = neighborhoodLabelForSupabase(payload.address, payload.district);
  if (isVirtual) {
    return neighborhood ? await resolveSupabaseLocationId(neighborhood) : null;
  }
  if (!neighborhood) return undefined;
  return await resolveSupabaseLocationId(neighborhood);
}

async function applyPublishedEventUpdate(
  publishedId: string,
  payload: EditableEventPayload,
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;

  const actionLink = payload.infoUrl?.trim() || payload.websiteUrl?.trim() || null;
  const locationId = await resolveEventLocationId(payload);

  const eventUpdate: Record<string, unknown> = {
    title: payload.title.trim(),
    description: payload.description.trim(),
    start_date: new Date(payload.startsAt).toISOString(),
    end_date: payload.endsAt ? new Date(payload.endsAt).toISOString() : null,
    custom_location_name: payload.venueName.trim(),
    establishment_id: payload.spotId || null,
    banner_url: payload.coverImageUrl,
    gallery_images: eventGalleryExtras(payload.coverImageUrl, payload.galleryImages),
    action_link: actionLink,
    website_url: payload.websiteUrl?.trim() || null,
    instagram_url: payload.instagramUrl?.trim() || null,
    facebook_url: payload.facebookUrl?.trim() || null,
    organizer_name: payload.organizerName,
    country_code: payload.countryCode,
    is_free: !payload.isInvitationOnly && payload.entryPrice == null,
    is_invitation_only: Boolean(payload.isInvitationOnly),
    ticket_price: payload.isInvitationOnly || payload.entryPrice == null ? null : payload.entryPrice,
    category_slugs: payload.categories?.length ? payload.categories : [payload.category],
    venue_location: payload.venueLocation ?? null,
    guinea_location_id: payload.guineaLocationId ?? null,
  };
  if (locationId !== undefined) {
    eventUpdate.location_id = locationId;
  }

  const { error } = await supabase.from('events').update(eventUpdate).eq('id', publishedId);

  if (error) {
    console.warn('[AdminEdit] events update:', error.message);
    return false;
  }

  await syncEventProgram(publishedId, payload.program);
  await syncEditableEventSpeakers(publishedId, payload.speakers);
  await syncEventSubmissionFull(publishedId, payload);
  return true;
}

async function applyPublishedSpotUpdate(
  target: PublishedSpotTarget,
  payload: EditableSpotPayload,
): Promise<boolean> {
  if (!isSupabaseConfigured() || !supabase) return false;

  if (target.kind === 'tool') {
    const toolCategorySlugs = resolveToolCategorySlugs(payload);
    const { error } = await supabase
      .from('tools')
      .update({
        name: payload.name.trim(),
        description: payload.description.trim(),
        phone_contact: payload.phone,
        action_link: payload.ctaUrl?.trim() || payload.website?.trim() || null,
        website_url: payload.website?.trim() || null,
        instagram_url: payload.instagramUrl?.trim() || null,
        facebook_url: payload.facebookUrl?.trim() || null,
        country_code: payload.countryCode,
        logo_url: payload.logoUrl?.trim() || null,
        category_slugs: toolCategorySlugs,
        developer: payload.developer?.trim() || null,
        is_verified: payload.isVerified ?? false,
        partnership_status: payload.partnershipStatus ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.id);

    if (error) {
      console.warn('[AdminEdit] tools update:', error.message);
      return false;
    }

    await syncSpotSubmissionFull(target, payload);

    const photoUrls = [
      ...(payload.logoUrl || payload.coverImageUrl ? [payload.logoUrl || payload.coverImageUrl!] : []),
      ...payload.galleryImages.filter((url) => url !== payload.logoUrl && url !== payload.coverImageUrl),
    ];

    if (photoUrls.length) {
      await supabase.from('tool_photos').delete().eq('tool_id', target.id);
      const rows = photoUrls.map((photo_url, index) => ({
        tool_id: target.id,
        photo_url,
        is_primary: index === 0,
      }));
      const { error: photosError } = await supabase.from('tool_photos').insert(rows);
      if (photosError) {
        console.warn('[AdminEdit] tool_photos:', photosError.message);
      }
    }

    return true;
  }

  const locationId = await resolveSpotLocationId(payload);

  const establishmentUpdate: Record<string, unknown> = {
    name: payload.name.trim(),
    description: payload.description.trim(),
    phone_contact: payload.phone,
    action_link: payload.ctaUrl?.trim() || payload.website?.trim() || null,
    website_url: payload.website?.trim() || null,
    instagram_url: payload.instagramUrl?.trim() || null,
    facebook_url: payload.facebookUrl?.trim() || null,
    price_indicator: payload.priceLabel,
    country_code: payload.countryCode,
    category_slugs: payload.categories?.length ? payload.categories : [payload.subCategory],
    opening_hours_label: payload.openingHours?.trim() || null,
  };
  if (locationId !== undefined) {
    establishmentUpdate.location_id = locationId;
  }

  const { error } = await supabase
    .from('establishments')
    .update(establishmentUpdate)
    .eq('id', target.id);

  if (error) {
    console.warn('[AdminEdit] establishments update:', error.message);
    return false;
  }

  await syncEstablishmentOpeningHours(target.id, payload.openingHours);
  await syncSpotSubmissionFull(target, payload);

  const photoUrls = [
    ...(payload.coverImageUrl ? [payload.coverImageUrl] : []),
    ...payload.galleryImages.filter((url) => url !== payload.coverImageUrl),
  ];

  if (photoUrls.length) {
    await supabase.from('establishment_photos').delete().eq('establishment_id', target.id);
    const rows = photoUrls.map((photo_url, index) => ({
      establishment_id: target.id,
      photo_url,
      is_primary: photo_url === payload.coverImageUrl || (index === 0 && !payload.coverImageUrl),
    }));
    const { error: photosError } = await supabase.from('establishment_photos').insert(rows);
    if (photosError) {
      console.warn('[AdminEdit] establishment_photos:', photosError.message);
    }
  }

  return true;
}

function fromStagingEvent(row: StagingEvent): EditableEventPayload {
  return {
    source: 'staging',
    id: row.id,
    title: row.title,
    description: row.description,
    program: row.program,
    category: row.category,
    categories: row.categories,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    venueName: row.venueName,
    venueAddress: row.venueAddress,
    venueLocation: row.venueLocation ?? null,
    guineaLocationId: row.guineaLocationId ?? null,
    spotId: row.spotId,
    entryPrice: row.entryPrice,
    isInvitationOnly: row.isInvitationOnly ?? false,
    currency: row.currency,
    infoUrl: row.infoUrl,
    instagramUrl: row.instagramUrl ?? null,
    facebookUrl: row.facebookUrl ?? null,
    websiteUrl: row.websiteUrl ?? null,
    coverImageUrl: row.coverImageUrl,
    galleryImages: eventGalleryExtras(row.coverImageUrl, row.galleryImages),
    organizerName: row.organizerName,
    countryCode: row.countryCode ?? 'GN',
    speakers: (row.speakers ?? []).map((sp) => ({
      name: sp.name,
      title: sp.title ?? null,
      company: sp.company ?? null,
    })),
  };
}

function fromStagingSpot(row: StagingSpot): EditableSpotPayload {
  return {
    source: 'staging',
    id: row.id,
    name: row.name,
    description: row.description,
    address: row.address,
    district: row.district,
    subCategory: row.subCategory,
    categories: row.categories,
    phone: row.phone,
    website: row.website,
    logoUrl: row.logoUrl ?? null,
    toolCategory: row.toolCategory ?? null,
    isVerified: row.isVerified ?? false,
    developer: row.developer ?? null,
    partnershipStatus: row.partnershipStatus ?? 'none',
    openingHours: row.openingHours,
    priceLabel: row.priceLabel,
    instagramUrl: row.instagramUrl,
    facebookUrl: row.facebookUrl,
    ctaUrl: row.ctaUrl,
    galleryImages: row.galleryImages,
    coverImageUrl: row.coverImageUrl,
    organizerName: row.organizerName,
    countryCode: row.countryCode ?? 'GN',
  };
}

export async function loadEditableEvent(id: string): Promise<EditableEventPayload | null> {
  if (!isCatalogUuid(id)) {
    const staging = await getStagingEventById(id);
    if (staging) return fromStagingEvent(staging);
  }

  // Priorité à l’événement publié (event_speakers) — la soumission partenaire
  // ne doit pas masquer les intervenants déjà synchronisés.
  const fromDb = await fetchEventFromSupabase(id);
  if (fromDb) {
    if (!fromDb.speakers?.length) {
      const fromSubmission = await fetchEventFromPartnerSubmission(id);
      if (fromSubmission?.speakers?.length) {
        return { ...fromDb, speakers: fromSubmission.speakers };
      }
    }
    return fromDb;
  }

  const fromSubmission = await fetchEventFromPartnerSubmission(id);
  if (fromSubmission) return fromSubmission;

  const snapshot = await loadContentSnapshot();
  const event = snapshot.events.find((e) => e.id === id);
  if (!event) return null;

  return {
    source: snapshot.source === 'supabase' ? 'supabase' : 'snapshot',
    id: event.id,
    title: event.title,
    description: event.description,
    program: event.program,
    category: event.category,
    categories: event.categories,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    venueName: event.venueName,
    venueAddress: event.venueAddress,
    spotId: event.locationId,
    entryPrice: event.entryPrice,
    currency: event.currency,
    infoUrl: event.infoUrl ?? null,
    instagramUrl: event.instagramUrl ?? null,
    facebookUrl: event.facebookUrl ?? null,
    websiteUrl: event.websiteUrl ?? null,
    coverImageUrl: event.coverImageUrl ?? null,
    galleryImages: eventGalleryExtras(event.coverImageUrl, event.galleryImages),
    organizerName: event.organizerName ?? null,
    countryCode: event.countryCode ?? 'GN',
    speakers: (event.speakers ?? []).map((sp) => ({
      name: sp.name,
      title: sp.title ?? null,
      company: sp.company ?? null,
    })),
  };
}

export async function loadEditableSpot(id: string): Promise<EditableSpotPayload | null> {
  if (!isCatalogUuid(id)) {
    const staging = await getStagingSpotById(id);
    if (staging) return fromStagingSpot(staging);
  }

  const fromSubmission = await fetchSpotFromPartnerSubmission(id);
  if (fromSubmission) return fromSubmission;

  const fromDb = await fetchSpotFromEstablishments(id);
  if (fromDb) return fromDb;

  const snapshot = await loadContentSnapshot();
  const spot = snapshot.locations.find((s) => s.id === id);
  if (!spot) return null;

  return fromHomeLocation(
    spot,
    snapshot.source === 'supabase' ? 'supabase' : 'snapshot',
  );
}

export async function saveEditableEvent(
  payload: EditableEventPayload,
): Promise<boolean> {
  const isStagingId = payload.id.startsWith('evt-');

  if (payload.source === 'staging' || isStagingId) {
    const updated = await adminUpdatePartnerEventFromPayload(payload);
    if (!updated) return false;
    const publishedId = await resolvePublishedEventId(payload.id);
    if (!publishedId) return true;
    return applyPublishedEventUpdate(publishedId, payload);
  }

  return applyPublishedEventUpdate(payload.id, payload);
}

export async function saveEditableSpot(
  payload: EditableSpotPayload,
): Promise<boolean> {
  const isStagingId = payload.id.startsWith('spot-') || payload.id.startsWith('tool-');

  if (payload.source === 'staging' || isStagingId) {
    const updated = await adminUpdatePartnerSpotFromPayload(payload);
    if (!updated) return false;
    const target = await resolvePublishedSpotTarget(payload.id);
    if (!target) return true;
    return applyPublishedSpotUpdate(target, payload);
  }

  const target = await resolvePublishedSpotTarget(payload.id);
  if (!target) return false;
  return applyPublishedSpotUpdate(target, payload);
}

async function adminUpdatePartnerEventFromPayload(payload: EditableEventPayload) {
  const { adminUpdatePartnerEvent } = await import('@/lib/partner-staging-store');
  return adminUpdatePartnerEvent(payload.id, {
    title: payload.title.trim(),
    description: payload.description.trim(),
    program: payload.program,
    category: payload.category,
    categories: payload.categories,
    startsAt: new Date(payload.startsAt).toISOString(),
    endsAt: payload.endsAt ? new Date(payload.endsAt).toISOString() : null,
    venueName: payload.venueName.trim(),
    venueAddress: payload.venueAddress,
    venueLocation: payload.venueLocation ?? null,
    guineaLocationId: payload.guineaLocationId ?? null,
    spotId: payload.spotId,
    entryPrice: payload.entryPrice,
    isInvitationOnly: payload.isInvitationOnly,
    currency: payload.currency,
    infoUrl: payload.infoUrl,
    instagramUrl: payload.instagramUrl,
    facebookUrl: payload.facebookUrl,
    websiteUrl: payload.websiteUrl,
    coverImageUrl: payload.coverImageUrl,
    galleryImages: eventGalleryExtras(payload.coverImageUrl, payload.galleryImages),
    organizerName: payload.organizerName,
    countryCode: payload.countryCode,
    speakers: payload.speakers,
  });
}

async function adminUpdatePartnerSpotFromPayload(payload: EditableSpotPayload) {
  const { adminUpdatePartnerSpot } = await import('@/lib/partner-staging-store');
  return adminUpdatePartnerSpot(payload.id, {
    name: payload.name.trim(),
    description: payload.description.trim(),
    address: payload.address.trim(),
    district: payload.district,
    subCategory: payload.subCategory,
    categories: payload.categories,
    phone: payload.phone,
    website: payload.website,
    logoUrl: payload.logoUrl ?? null,
    toolCategory: payload.toolCategory ?? null,
    isVerified: payload.isVerified ?? false,
    developer: payload.developer ?? null,
    partnershipStatus: payload.partnershipStatus ?? 'none',
    openingHours: payload.openingHours,
    priceLabel: payload.priceLabel,
    instagramUrl: payload.instagramUrl,
    facebookUrl: payload.facebookUrl,
    ctaUrl: payload.ctaUrl,
    galleryImages: payload.galleryImages,
    coverImageUrl: payload.coverImageUrl,
    organizerName: payload.organizerName,
    countryCode: payload.countryCode,
  });
}
