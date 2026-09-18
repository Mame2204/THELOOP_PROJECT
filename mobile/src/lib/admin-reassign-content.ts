import {
  getStagingEventById,
  getStagingSpotById,
  mergeStagingEvent,
  mergeStagingSpot,
  type StagingSpot,
} from '@/lib/partner-staging-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { ContentOrigin } from '@/lib/content-origin';

export type ReassignContentKind = 'event' | 'spot' | 'tool';

export const TEAM_CONTENT_OWNER_ID = '__team__';

export interface ContentOwnerInfo {
  ownerUserId: string | null;
  displayName: string | null;
  email: string | null;
  company: string | null;
  userRole: string | null;
  contentOrigin: ContentOrigin | null;
}

export interface ReassignContentResult {
  ok: boolean;
  error?: string;
  ownerUserId?: string;
  partnerName?: string;
  contentOrigin?: ContentOrigin;
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export async function getContentOwner(
  kind: ReassignContentKind,
  contentId: string,
): Promise<ContentOwnerInfo | null> {
  if (!isUuid(contentId) || !isSupabaseConfigured() || !supabase) {
    const staging = kind === 'event'
      ? await getStagingEventById(contentId)
      : await getStagingSpotById(contentId);
    if (!staging) return null;
    return {
      ownerUserId: staging.partnerId === 'admin' ? null : staging.partnerId,
      displayName: staging.partnerName,
      email: null,
      company: staging.partnerName,
      userRole: staging.partnerId === 'admin' ? 'admin' : 'partner',
      contentOrigin:
        'contentOrigin' in staging && (staging.contentOrigin === 'admin' || staging.contentOrigin === 'loop' || staging.contentOrigin === 'partner')
          ? staging.contentOrigin
          : null,
    };
  }

  const { data, error } = await supabase.rpc('admin_get_content_owner', {
    p_kind: kind,
    p_content_id: contentId,
  });

  if (error) {
    console.warn('[Reassign] get owner:', error.message);
    return null;
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const origin = payload.content_origin;
  return {
    ownerUserId: payload.owner_user_id ? String(payload.owner_user_id) : null,
    displayName: payload.display_name ? String(payload.display_name) : null,
    email: payload.email ? String(payload.email) : null,
    company: payload.company ? String(payload.company) : null,
    userRole: payload.user_role ? String(payload.user_role) : null,
    contentOrigin:
      origin === 'admin' || origin === 'loop' || origin === 'partner'
        ? origin
        : null,
  };
}

async function syncLocalStagingOwner(
  kind: ReassignContentKind,
  contentId: string,
  partnerUserId: string | null,
  partnerName: string,
  contentOrigin: ContentOrigin,
): Promise<void> {
  const ownerId = partnerUserId ?? 'admin';

  if (kind === 'event') {
    const existing = await getStagingEventById(contentId);
    if (existing) {
      await mergeStagingEvent({
        ...existing,
        partnerId: ownerId,
        partnerName,
        masterId: ownerId,
        contentOrigin,
        updatedAt: new Date().toISOString(),
      });
    }
    return;
  }

  const existing = await getStagingSpotById(contentId);
  if (existing) {
    await mergeStagingSpot({
      ...existing,
      partnerId: ownerId,
      partnerName,
      contentOrigin,
      updatedAt: new Date().toISOString(),
    } as StagingSpot);
  }
}

/**
 * Transfère la gestion d'un contenu à un compte partenaire,
 * ou reprend la gestion côté équipe (partnerUserId = null).
 */
export async function reassignContentOwner(
  kind: ReassignContentKind,
  contentId: string,
  partnerUserId: string | null,
  options?: { partnerDisplayName?: string },
): Promise<ReassignContentResult> {
  const displayName = options?.partnerDisplayName?.trim() || (partnerUserId ? 'Partenaire' : 'THE LOOP');

  // Contenu staging local uniquement
  if (!isUuid(contentId)) {
    await syncLocalStagingOwner(
      kind,
      contentId,
      partnerUserId,
      displayName,
      partnerUserId ? 'partner' : 'admin',
    );
    return {
      ok: true,
      ownerUserId: partnerUserId ?? undefined,
      partnerName: displayName,
      contentOrigin: partnerUserId ? 'partner' : 'admin',
    };
  }

  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: 'Supabase non configuré.' };
  }

  const { data, error } = await supabase.rpc('admin_reassign_content_owner', {
    p_kind: kind,
    p_content_id: contentId,
    p_partner_user_id: partnerUserId,
  });

  if (error) {
    const msg = error.message ?? 'transfert_impossible';
    if (/partner_not_found/i.test(msg)) return { ok: false, error: 'Compte partenaire introuvable.' };
    if (/user_not_partner/i.test(msg)) return { ok: false, error: 'Ce compte n\'est pas un partenaire.' };
    if (/content_not_found/i.test(msg)) return { ok: false, error: 'Contenu introuvable.' };
    if (/admin_required/i.test(msg)) return { ok: false, error: 'Droits administrateur requis.' };
    console.warn('[Reassign]', msg);
    return { ok: false, error: 'Transfert impossible. Réessayez.' };
  }

  const payload = (data ?? {}) as Record<string, unknown>;
  const originRaw = payload.content_origin;
  const contentOrigin: ContentOrigin =
    originRaw === 'loop' || originRaw === 'admin' || originRaw === 'partner'
      ? originRaw
      : partnerUserId
        ? 'partner'
        : 'admin';
  const ownerUserId = payload.owner_user_id ? String(payload.owner_user_id) : partnerUserId;
  const partnerName = payload.partner_name ? String(payload.partner_name) : displayName;

  await syncLocalStagingOwner(kind, contentId, ownerUserId, partnerName, contentOrigin);

  if (partnerUserId && isUuid(contentId)) {
    await ensurePartnerStagingMirror(kind, contentId, partnerUserId, partnerName, contentOrigin);
  }

  try {
    const { invalidatePartnerCatalogIdsCache } = await import('@/lib/partner-catalog-ids');
    invalidatePartnerCatalogIdsCache();
  } catch {
    /* noop */
  }

  try {
    const { invalidateBenefitCatalogCache } = await import('@/lib/benefit-catalog-store');
    invalidateBenefitCatalogCache();
  } catch {
    /* noop */
  }

  return {
    ok: true,
    ownerUserId: ownerUserId ?? undefined,
    partnerName,
    contentOrigin,
  };
}

async function ensurePartnerStagingMirror(
  kind: ReassignContentKind,
  contentId: string,
  partnerUserId: string,
  partnerName: string,
  contentOrigin: ContentOrigin,
): Promise<void> {
  if (kind === 'event') {
    const existing = await getStagingEventById(contentId);
    if (existing) {
      await mergeStagingEvent({
        ...existing,
        partnerId: partnerUserId,
        partnerName,
        masterId: partnerUserId,
        contentOrigin,
        status: 'approved',
        publishedEventId: existing.publishedEventId ?? contentId,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (!isSupabaseConfigured() || !supabase) return;
    const { data } = await supabase
      .from('events')
      .select('id, title, description, start_date, end_date, banner_url, organizer_name, country_code, created_at, custom_location_name')
      .eq('id', contentId)
      .maybeSingle();
    if (!data) return;
    await mergeStagingEvent({
      id: `transfer-${contentId}`,
      partnerId: partnerUserId,
      partnerName,
      masterId: partnerUserId,
      title: String(data.title ?? 'Événement'),
      description: String(data.description ?? ''),
      program: null,
      category: 'corporate',
      categories: ['corporate'],
      startsAt: String(data.start_date ?? new Date().toISOString()),
      endsAt: data.end_date ? String(data.end_date) : null,
      venueName: data.custom_location_name ? String(data.custom_location_name) : '',
      venueAddress: null,
      spotId: null,
      entryPrice: null,
      currency: 'GNF',
      infoUrl: null,
      instagramUrl: null,
      facebookUrl: null,
      websiteUrl: null,
      coverImageUrl: data.banner_url ? String(data.banner_url) : null,
      status: 'approved',
      organizerName: data.organizer_name ? String(data.organizer_name) : partnerName,
      contentOrigin,
      countryCode: String(data.country_code ?? 'GN'),
      publishedEventId: contentId,
      createdAt: String(data.created_at ?? new Date().toISOString()),
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const existing = await getStagingSpotById(contentId);
  if (existing) {
    await mergeStagingSpot({
      ...existing,
      partnerId: partnerUserId,
      partnerName,
      contentOrigin,
      status: 'approved',
      publishedEstablishmentId:
        kind === 'spot'
          ? (existing.publishedEstablishmentId ?? contentId)
          : existing.publishedEstablishmentId,
      publishedToolId:
        kind === 'tool'
          ? (existing.publishedToolId ?? contentId)
          : existing.publishedToolId,
      updatedAt: new Date().toISOString(),
    } as StagingSpot);
    return;
  }

  if (!isSupabaseConfigured() || !supabase) return;

  if (kind === 'tool') {
    const { data } = await supabase
      .from('tools')
      .select('id, name, description, logo_url, country_code, category_slugs, developer, created_at')
      .eq('id', contentId)
      .maybeSingle();
    if (!data) return;
    await mergeStagingSpot({
      id: `transfer-tool-${contentId}`,
      partnerId: partnerUserId,
      partnerName,
      name: String(data.name ?? 'Outil'),
      address: 'En ligne',
      district: null,
      description: String(data.description ?? ''),
      subCategory: 'tools',
      categories: ['tools'],
      phone: null,
      website: null,
      logoUrl: data.logo_url ? String(data.logo_url) : null,
      toolCategory: Array.isArray(data.category_slugs) && data.category_slugs[0]
        ? String(data.category_slugs[0])
        : null,
      developer: data.developer ? String(data.developer) : null,
      isVerified: false,
      partnershipStatus: 'active',
      openingHours: null,
      priceLabel: null,
      instagramUrl: null,
      facebookUrl: null,
      ctaUrl: null,
      galleryImages: [],
      coverImageUrl: data.logo_url ? String(data.logo_url) : null,
      status: 'approved',
      organizerName: partnerName,
      contentOrigin,
      countryCode: String(data.country_code ?? 'GN'),
      publishedEstablishmentId: null,
      publishedToolId: contentId,
      createdAt: String(data.created_at ?? new Date().toISOString()),
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const { data } = await supabase
    .from('establishments')
    .select('id, name, description, phone_contact, country_code, price_indicator, created_at')
    .eq('id', contentId)
    .maybeSingle();
  if (!data) return;
  await mergeStagingSpot({
    id: `transfer-spot-${contentId}`,
    partnerId: partnerUserId,
    partnerName,
    name: String(data.name ?? 'Spot'),
    address: '',
    district: null,
    description: String(data.description ?? ''),
    subCategory: 'fine_dining',
    categories: ['fine_dining'],
    phone: data.phone_contact ? String(data.phone_contact) : null,
    website: null,
    openingHours: null,
    priceLabel: data.price_indicator ? String(data.price_indicator) : null,
    instagramUrl: null,
    facebookUrl: null,
    ctaUrl: null,
    galleryImages: [],
    coverImageUrl: null,
    status: 'approved',
    organizerName: partnerName,
    contentOrigin,
    countryCode: String(data.country_code ?? 'GN'),
    publishedEstablishmentId: contentId,
    publishedToolId: null,
    createdAt: String(data.created_at ?? new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  });
}
