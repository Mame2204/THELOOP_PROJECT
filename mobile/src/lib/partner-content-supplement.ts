import type { StagingEvent, StagingSpot } from '@/lib/partner-staging-store';
import { fetchLivePartnerCatalogIds, resolvePartnerQueryUserId } from '@/lib/partner-catalog-ids';
import { isNetworkOnline } from '@/lib/offline-store';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

function eventAlreadyListed(existing: StagingEvent[], catalogId: string): boolean {
  return existing.some(
    (e) => e.id === catalogId || e.publishedEventId === catalogId || e.id === `catalog-event-${catalogId}`,
  );
}

function spotAlreadyListed(existing: StagingSpot[], catalogId: string): boolean {
  return existing.some(
    (s) =>
      s.id === catalogId
      || s.publishedEstablishmentId === catalogId
      || s.publishedToolId === catalogId
      || s.id === `catalog-spot-${catalogId}`
      || s.id === `catalog-tool-${catalogId}`,
  );
}

/** Ajoute le catalogue publié du partenaire absent des soumissions (transfert admin, sync partielle). */
export async function supplementPartnerEventsFromCatalog(
  existing: StagingEvent[],
  partnerUserId: string,
  partnerName: string,
): Promise<StagingEvent[]> {
  const userId = await resolvePartnerQueryUserId(partnerUserId, partnerName);
  if (!userId || !isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) {
    return existing;
  }

  const liveIds = await fetchLivePartnerCatalogIds(userId, partnerName, 'workspace');
  const missingIds = [...liveIds].filter((id) => !eventAlreadyListed(existing, id)).slice(0, 30);
  if (!missingIds.length) return existing;

  const { data, error } = await supabase
    .from('events')
    .select(
      'id, title, description, start_date, end_date, custom_location_name, organizer_name, country_code, banner_url, created_at',
    )
    .in('id', missingIds)
    .eq('content_status', 'published')
    .eq('is_active', true);

  if (error || !data?.length) return existing;

  const now = new Date().toISOString();
  const extras: StagingEvent[] = [];

  for (const row of data) {
    const catalogId = String(row.id);
    if (eventAlreadyListed(existing, catalogId)) continue;
    extras.push({
      id: `catalog-event-${catalogId}`,
      partnerId: userId,
      partnerName,
      title: String(row.title ?? 'Événement'),
      description: String(row.description ?? ''),
      program: null,
      category: 'corporate',
      categories: ['corporate'],
      startsAt: String(row.start_date ?? now),
      endsAt: row.end_date ? String(row.end_date) : null,
      venueName: row.custom_location_name ? String(row.custom_location_name) : '',
      venueAddress: null,
      spotId: null,
      entryPrice: null,
      currency: 'GNF',
      infoUrl: null,
      instagramUrl: null,
      facebookUrl: null,
      websiteUrl: null,
      coverImageUrl: row.banner_url ? String(row.banner_url) : null,
      status: 'approved',
      organizerName: row.organizer_name ? String(row.organizer_name) : partnerName,
      contentOrigin: 'partner',
      masterId: userId,
      countryCode: String(row.country_code ?? 'GN'),
      publishedEventId: catalogId,
      createdAt: row.created_at ? String(row.created_at) : now,
      updatedAt: row.created_at ? String(row.created_at) : now,
    });
  }

  return extras.length ? [...existing, ...extras] : existing;
}

/** Ajoute spots/outils publiés absents des soumissions (transfert admin, sync partielle). */
export async function supplementPartnerSpotsFromCatalog(
  existing: StagingSpot[],
  partnerUserId: string,
  partnerName: string,
): Promise<StagingSpot[]> {
  const userId = await resolvePartnerQueryUserId(partnerUserId, partnerName);
  if (!userId || !isSupabaseConfigured() || !supabase || !(await isNetworkOnline())) {
    return existing;
  }

  const liveIds = await fetchLivePartnerCatalogIds(userId, partnerName, 'workspace');
  const missingIds = [...liveIds].filter((id) => !spotAlreadyListed(existing, id)).slice(0, 30);
  if (!missingIds.length) return existing;

  const [estRes, toolRes] = await Promise.all([
    supabase
      .from('establishments')
      .select('id, name, description, country_code, created_at')
      .in('id', missingIds)
      .eq('content_status', 'published')
      .eq('is_active', true),
    supabase
      .from('tools')
      .select('id, name, description, country_code, logo_url, updated_at, created_at')
      .in('id', missingIds)
      .eq('content_status', 'published')
      .eq('is_active', true),
  ]);

  const now = new Date().toISOString();
  const extras: StagingSpot[] = [];

  for (const row of estRes.data ?? []) {
    const catalogId = String(row.id);
    if (spotAlreadyListed(existing, catalogId)) continue;
    extras.push({
      id: `catalog-spot-${catalogId}`,
      partnerId: userId,
      partnerName,
      name: String(row.name ?? 'Spot'),
      description: String(row.description ?? ''),
      address: '',
      district: null,
      subCategory: 'fine_dining',
      categories: ['fine_dining'],
      phone: null,
      website: null,
      openingHours: null,
      priceLabel: null,
      instagramUrl: null,
      facebookUrl: null,
      ctaUrl: null,
      galleryImages: [],
      coverImageUrl: null,
      status: 'approved',
      organizerName: partnerName,
      contentOrigin: 'partner',
      countryCode: String(row.country_code ?? 'GN'),
      publishedEstablishmentId: catalogId,
      publishedToolId: null,
      createdAt: row.created_at ? String(row.created_at) : now,
      updatedAt: row.created_at ? String(row.created_at) : now,
    });
  }

  for (const row of toolRes.data ?? []) {
    const catalogId = String(row.id);
    if (spotAlreadyListed(existing, catalogId)) continue;
    extras.push({
      id: `catalog-tool-${catalogId}`,
      partnerId: userId,
      partnerName,
      name: String(row.name ?? 'Outil'),
      description: String(row.description ?? ''),
      address: '',
      district: null,
      subCategory: 'tools',
      categories: ['tools'],
      phone: null,
      website: null,
      openingHours: null,
      priceLabel: null,
      instagramUrl: null,
      facebookUrl: null,
      ctaUrl: null,
      galleryImages: [],
      coverImageUrl: row.logo_url ? String(row.logo_url) : null,
      status: 'approved',
      organizerName: partnerName,
      contentOrigin: 'partner',
      countryCode: String(row.country_code ?? 'GN'),
      publishedEstablishmentId: null,
      publishedToolId: catalogId,
      createdAt: row.created_at ? String(row.created_at) : now,
      updatedAt: row.updated_at ? String(row.updated_at) : now,
    });
  }

  return extras.length ? [...existing, ...extras] : existing;
}
