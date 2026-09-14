import {
  isStoredNaLocation,
  isStoredOnlineLocation,
} from '@/lib/content-location-utils';
import { spotDistrictFromGuineaLabel } from '@/lib/guinea-locations';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Libellé quartier/ville passé à resolve_location_id (RPC Supabase). */
export function neighborhoodLabelForSupabase(
  address: string | null | undefined,
  district?: string | null,
  _fallbackName?: string | null,
): string | null {
  const addr = address?.trim() ?? '';
  if (addr && (isStoredOnlineLocation(addr) || isStoredNaLocation(addr))) return addr;
  const fromDistrict = district?.trim();
  if (fromDistrict && !isStoredOnlineLocation(fromDistrict) && !isStoredNaLocation(fromDistrict)) {
    return fromDistrict;
  }
  if (addr) {
    const quartier = spotDistrictFromGuineaLabel(addr);
    return quartier || null;
  }
  return null;
}

export async function resolveSupabaseLocationId(
  neighborhood: string | null | undefined,
  city = 'Conakry',
  country = 'Guinée',
): Promise<number | null> {
  const label = neighborhood?.trim();
  if (!label || !isSupabaseConfigured() || !supabase) return null;

  const { data, error } = await supabase.rpc('resolve_location_id', {
    p_neighborhood: label,
    p_city: city,
    p_country: country,
  });

  if (error) {
    console.warn('[LocationSync] resolve_location_id:', error.message);
    return null;
  }

  if (typeof data === 'number' && Number.isFinite(data)) return data;
  const parsed = Number(data);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function syncPublishedEventSubmissionLocation(
  eventId: string,
  venueName: string,
  venueAddress: string | null,
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  await supabase
    .from('partner_event_submissions')
    .update({
      venue_name: venueName.trim(),
      venue_address: venueAddress,
      updated_at: new Date().toISOString(),
    })
    .eq('published_event_id', eventId);
}

export async function syncPublishedSpotSubmissionLocation(
  contentId: string,
  kind: 'establishment' | 'tool',
  address: string,
  district: string | null,
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const patch = {
    address,
    district,
    updated_at: new Date().toISOString(),
  };
  if (kind === 'tool') {
    await supabase.from('partner_spot_submissions').update(patch).eq('published_tool_id', contentId);
    return;
  }
  await supabase.from('partner_spot_submissions').update(patch).eq('published_establishment_id', contentId);
}

/** ID catalogue `events` lié à un id staging (`evt-…`) ou UUID déjà publié. */
export async function resolvePublishedEventId(id: string): Promise<string | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  if (!id.startsWith('evt-')) {
    const { data: live } = await supabase.from('events').select('id').eq('id', id).maybeSingle();
    if (live?.id) return String(live.id);
  }
  const { data: submission } = await supabase
    .from('partner_event_submissions')
    .select('published_event_id')
    .eq('local_id', id)
    .maybeSingle();
  if (submission?.published_event_id) return String(submission.published_event_id);
  if (!id.startsWith('evt-')) {
    const { data: byPublished } = await supabase
      .from('partner_event_submissions')
      .select('published_event_id')
      .eq('published_event_id', id)
      .maybeSingle();
    if (byPublished?.published_event_id) return String(byPublished.published_event_id);
  }
  return null;
}

export type PublishedSpotTarget = {
  id: string;
  kind: 'establishment' | 'tool';
};

/** Cible catalogue pour un id staging (`spot-`/`tool-`) ou UUID publié. */
export async function resolvePublishedSpotTarget(id: string): Promise<PublishedSpotTarget | null> {
  if (!isSupabaseConfigured() || !supabase) return null;

  if (id.startsWith('tool-')) {
    const { data: submission } = await supabase
      .from('partner_spot_submissions')
      .select('published_tool_id')
      .eq('local_id', id)
      .maybeSingle();
    if (submission?.published_tool_id) {
      return { id: String(submission.published_tool_id), kind: 'tool' };
    }
    return null;
  }

  if (id.startsWith('spot-')) {
    const { data: submission } = await supabase
      .from('partner_spot_submissions')
      .select('published_establishment_id')
      .eq('local_id', id)
      .maybeSingle();
    if (submission?.published_establishment_id) {
      return { id: String(submission.published_establishment_id), kind: 'establishment' };
    }
    return null;
  }

  const { data: tool } = await supabase.from('tools').select('id').eq('id', id).maybeSingle();
  if (tool?.id) return { id: String(tool.id), kind: 'tool' };

  const { data: establishment } = await supabase
    .from('establishments')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (establishment?.id) return { id: String(establishment.id), kind: 'establishment' };

  return null;
}
