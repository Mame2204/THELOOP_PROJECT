import { hydrateScoped, peekScoped, scopedStorageKey } from '@/lib/swr-cache';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type ContentPageKey = 'a_propos' | 'comment_ca_marche' | 'devenir_partenaire' | 'contact' | (string & {});

export interface ContentPage {
  key: string;
  title: string;
  body: string;
  updatedAt: string;
}

const CACHE = 'loop_content_pages_v1';

export async function getContentPage(key: string): Promise<ContentPage | null> {
  const diskKey = scopedStorageKey(CACHE, key);
  const cached = await peekScoped<ContentPage>(key, diskKey);
  if (cached) return cached;

  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from('app_content_pages')
    .select('key, title, body, updated_at')
    .eq('key', key)
    .maybeSingle();
  if (error || !data) {
    if (error) console.warn('[ContentPages]', error.message);
    return null;
  }
  const page: ContentPage = {
    key: String(data.key),
    title: String(data.title),
    body: String(data.body),
    updatedAt: String(data.updated_at),
  };
  await hydrateScoped(key, diskKey, page);
  return page;
}

export async function listContentPages(): Promise<ContentPage[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from('app_content_pages')
    .select('key, title, body, updated_at')
    .order('key', { ascending: true });
  if (error || !data) {
    if (error) console.warn('[ContentPages] list:', error.message);
    return [];
  }
  return data.map((row) => ({
    key: String(row.key),
    title: String(row.title),
    body: String(row.body),
    updatedAt: String(row.updated_at),
  }));
}
