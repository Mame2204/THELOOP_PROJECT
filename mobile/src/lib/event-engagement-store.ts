import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { bumpEventClickCountInCache } from '@/lib/content-store';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Enregistre une ouverture de fiche événement (insights admin). */
export async function recordEventClick(eventId: string): Promise<number> {
  if (!isSupabaseConfigured() || !supabase || !UUID_RE.test(eventId)) {
    return 0;
  }

  const { error } = await supabase.rpc('increment_event_click', { p_event_id: eventId });
  if (error) {
    console.warn('[EventEngagement] increment:', error.message);
    await bumpEventClickCountInCache(eventId);
    return 0;
  }

  const { data } = await supabase
    .from('events')
    .select('click_count')
    .eq('id', eventId)
    .maybeSingle();

  const count = Number(data?.click_count ?? 0);
  await bumpEventClickCountInCache(eventId, count > 0 ? count : undefined);
  return count > 0 ? count : 1;
}
