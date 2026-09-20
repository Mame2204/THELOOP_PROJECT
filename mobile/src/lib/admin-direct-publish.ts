import { syncEstablishmentOpeningHours } from '@/lib/establishment-schedules-sync';
import { isNetworkOnline } from '@/lib/offline-store';
import type { ContentOrigin } from '@/lib/content-origin';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface AdminDirectPublishResult {
  ok: boolean;
  id?: string;
  reason?: string;
  table?: 'events' | 'establishments' | 'tools';
}

export interface AdminEventDirectInput {
  title: string;
  description: string;
  program?: string | null;
  category: string;
  categories?: string[];
  startsAt: string;
  endsAt?: string | null;
  venueName: string;
  venueAddress?: string | null;
  spotId?: string | null;
  entryPrice?: number | null;
  isInvitationOnly?: boolean;
  infoUrl?: string | null;
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  coverImageUrl?: string | null;
  galleryImages?: string[];
  organizerName?: string | null;
  speakers?: { name: string; title?: string | null; company?: string | null }[];
  contentOrigin?: ContentOrigin;
  countryCode: string;
  contentStatus?: 'draft' | 'published';
}

export interface AdminSpotDirectInput {
  name: string;
  description: string;
  address: string;
  district?: string | null;
  subCategory: string;
  categories?: string[];
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  galleryImages?: string[];
  openingHours?: string | null;
  priceLabel?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  ctaUrl?: string | null;
  organizerName?: string | null;
  contentOrigin?: ContentOrigin;
  countryCode: string;
  contentStatus?: 'draft' | 'published';
}

export interface AdminToolDirectInput {
  name: string;
  description: string;
  phone?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  galleryImages?: string[];
  categories?: string[];
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  ctaUrl?: string | null;
  toolCategory?: string | null;
  developer?: string | null;
  isVerified?: boolean;
  partnershipStatus?: string | null;
  contentOrigin?: ContentOrigin;
  countryCode: string;
  contentStatus?: 'draft' | 'published';
}

function eventPayload(input: AdminEventDirectInput): Record<string, unknown> {
  const categories = input.categories?.length ? input.categories : [input.category];
  return {
    title: input.title,
    description: input.description,
    program: input.program,
    category: input.category,
    categories,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    venue_name: input.venueName,
    venue_address: input.venueAddress,
    spot_id: input.spotId,
    entry_price: input.entryPrice,
    is_invitation_only: input.isInvitationOnly === true,
    info_url: input.infoUrl,
    website_url: input.websiteUrl,
    instagram_url: input.instagramUrl,
    facebook_url: input.facebookUrl,
    cover_image_url: input.coverImageUrl,
    gallery_images: input.galleryImages ?? [],
    organizer_name: input.organizerName,
    speakers: (input.speakers ?? [])
      .filter((speaker) => speaker.name.trim().length > 0)
      .map((speaker) => ({
        name: speaker.name.trim(),
        title: speaker.title?.trim() || null,
        company: speaker.company?.trim() || null,
      })),
    content_origin: input.contentOrigin ?? 'admin',
    country_code: input.countryCode,
    content_status: input.contentStatus ?? 'published',
  };
}

function spotPayload(input: AdminSpotDirectInput): Record<string, unknown> {
  const categories = input.categories?.length ? input.categories : [input.subCategory];
  return {
    name: input.name,
    description: input.description,
    address: input.address,
    district: input.district,
    sub_category: input.subCategory,
    categories,
    phone: input.phone,
    website: input.website,
    logo_url: input.logoUrl,
    cover_image_url: input.coverImageUrl,
    gallery_images: input.galleryImages ?? [],
    opening_hours: input.openingHours,
    price_label: input.priceLabel,
    instagram_url: input.instagramUrl,
    facebook_url: input.facebookUrl,
    cta_url: input.ctaUrl,
    organizer_name: input.organizerName,
    content_origin: input.contentOrigin ?? 'admin',
    country_code: input.countryCode,
    content_status: input.contentStatus ?? 'published',
  };
}

function toolPayload(input: AdminToolDirectInput): Record<string, unknown> {
  const categories =
    input.categories?.length
      ? input.categories
      : input.toolCategory
        ? [input.toolCategory]
        : undefined;
  return {
    name: input.name,
    description: input.description,
    phone: input.phone,
    website: input.website,
    logo_url: input.logoUrl,
    cover_image_url: input.coverImageUrl,
    gallery_images: input.galleryImages ?? [],
    instagram_url: input.instagramUrl,
    facebook_url: input.facebookUrl,
    cta_url: input.ctaUrl,
    // RPC admin_create_tool_direct lit `categories` puis fallback `tool_category`.
    categories,
    tool_category: input.toolCategory,
    developer: input.developer,
    is_verified: input.isVerified ?? false,
    partnership_status: input.partnershipStatus,
    content_origin: input.contentOrigin ?? 'admin',
    country_code: input.countryCode,
    content_status: input.contentStatus ?? 'published',
  };
}

export async function createAdminEventDirect(input: AdminEventDirectInput): Promise<AdminDirectPublishResult> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, reason: 'no_supabase', table: 'events' };
  if (!(await isNetworkOnline())) return { ok: false, reason: 'offline', table: 'events' };

  const { data, error } = await supabase.rpc('admin_create_event_direct', {
    p_payload: eventPayload(input),
  });

  if (error) {
    console.warn('[AdminDirect] event:', error.message);
    return { ok: false, reason: error.message, table: 'events' };
  }

  return { ok: true, id: data ? String(data) : undefined, table: 'events' };
}

export async function createAdminEstablishmentDirect(input: AdminSpotDirectInput): Promise<AdminDirectPublishResult> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, reason: 'no_supabase', table: 'establishments' };
  if (!(await isNetworkOnline())) return { ok: false, reason: 'offline', table: 'establishments' };

  const { data, error } = await supabase.rpc('admin_create_establishment_direct', {
    p_payload: spotPayload(input),
  });

  if (error) {
    console.warn('[AdminDirect] establishment:', error.message);
    return { ok: false, reason: error.message, table: 'establishments' };
  }

  const establishmentId = data ? String(data) : undefined;
  if (establishmentId && input.openingHours) {
    await syncEstablishmentOpeningHours(establishmentId, input.openingHours);
  }

  return { ok: true, id: establishmentId, table: 'establishments' };
}

export async function createAdminToolDirect(input: AdminToolDirectInput): Promise<AdminDirectPublishResult> {
  if (!isSupabaseConfigured() || !supabase) return { ok: false, reason: 'no_supabase', table: 'tools' };
  if (!(await isNetworkOnline())) return { ok: false, reason: 'offline', table: 'tools' };

  const { data, error } = await supabase.rpc('admin_create_tool_direct', {
    p_payload: toolPayload(input),
  });

  if (error) {
    console.warn('[AdminDirect] tool:', error.message);
    return { ok: false, reason: error.message, table: 'tools' };
  }

  return { ok: true, id: data ? String(data) : undefined, table: 'tools' };
}
