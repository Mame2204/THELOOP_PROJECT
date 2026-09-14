import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  category: string;
  displayOrder: number;
  isActive: boolean;
  updatedAt: string;
}

export async function listActiveFaq(): Promise<FaqEntry[]> {
  if (!isSupabaseConfigured() || !supabase) return [];
  const { data, error } = await supabase
    .from('app_faq')
    .select('id, question, answer, category, display_order, is_active, updated_at')
    .eq('is_active', true)
    .order('display_order', { ascending: true });
  if (error || !data) {
    if (error) console.warn('[FAQ]', error.message);
    return [];
  }
  return data.map((row) => ({
    id: String(row.id),
    question: String(row.question),
    answer: String(row.answer),
    category: String(row.category ?? 'general'),
    displayOrder: Number(row.display_order ?? 0),
    isActive: row.is_active !== false,
    updatedAt: String(row.updated_at),
  }));
}
