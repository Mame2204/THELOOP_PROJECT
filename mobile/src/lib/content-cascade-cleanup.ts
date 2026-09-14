import { isSupabaseConfigured, supabase } from '@/lib/supabase';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export interface ContentDeleteImpact {
  kind: 'event' | 'spot' | 'tool';
  title: string;
  consequences: string[];
}

export function buildContentDeleteImpact(
  kind: 'event' | 'spot' | 'tool',
  title: string,
): ContentDeleteImpact {
  const label = kind === 'event' ? 'événement' : kind === 'tool' ? 'outil' : 'spot';
  return {
    kind,
    title,
    consequences: [
      `Le ${label} « ${title} » sera retiré de toutes les listes publiques et partenaires.`,
      'Les favoris et notes associés seront supprimés.',
      'Les parcours contenant cette étape seront masqués automatiquement.',
      'Les avantages Prime liés à ce lieu seront retirés du catalogue actif.',
      'Cette action est irréversible.',
    ],
  };
}

export function formatCascadeDeleteMessage(impact: ContentDeleteImpact): string {
  return [
    `Supprimer définitivement « ${impact.title} » ?`,
    '',
    'Conséquences :',
    ...impact.consequences.map((line) => `• ${line}`),
  ].join('\n');
}

async function unpublishWalksReferencingContent(
  contentId: string,
  targetType: 'event' | 'spot' | 'tool',
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  const { data, error } = await supabase.from('loop_walks').select('id, steps, is_published').limit(15);
  if (error || !data?.length) return;

  for (const row of data) {
    const steps = Array.isArray(row.steps) ? row.steps : [];
    const references = steps.some((step) => {
      if (!step || typeof step !== 'object') return false;
      const s = step as Record<string, unknown>;
      const type = String(s.targetType ?? s.target_type ?? '');
      const id = String(s.targetId ?? s.target_id ?? '');
      return type === targetType && id === contentId;
    });
    if (references && row.is_published !== false) {
      await supabase
        .from('loop_walks')
        .update({ is_published: false, updated_at: new Date().toISOString() })
        .eq('id', row.id);
    }
  }
}

async function purgeBenefitCatalogContentReferencesRemote(contentIds: string[]): Promise<void> {
  const uuids = contentIds.filter(isUuid);
  if (!uuids.length || !isSupabaseConfigured() || !supabase) return;

  const { error } = await supabase.rpc('admin_purge_benefit_catalog_content_refs', {
    p_content_ids: uuids,
  });
  if (!error) return;
  if (/does not exist|could not find|schema cache/i.test(error.message)) {
    await purgeBenefitCatalogContentReferencesLegacy(contentIds);
    return;
  }
  console.warn('[ContentCascade] purge benefit_catalog RPC:', error.message);
}

async function purgeBenefitCatalogContentReferencesLegacy(contentIds: string[]): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const targets = new Set(contentIds.filter(Boolean));

  const { data, error } = await supabase.from('benefit_catalog').select('id, offering_partners, is_active').limit(15);
  if (error || !data?.length) return;

  for (const row of data) {
    const offerings = Array.isArray(row.offering_partners) ? row.offering_partners : [];
    const filtered = offerings.filter((entry) => {
      if (!entry || typeof entry !== 'object') return true;
      const o = entry as Record<string, unknown>;
      return !targets.has(String(o.contentId ?? ''));
    });
    if (filtered.length !== offerings.length) {
      await supabase
        .from('benefit_catalog')
        .update({
          offering_partners: filtered,
          is_active: filtered.length > 0 ? row.is_active : false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
    }
  }
}

async function purgeBenefitCatalogContentReferences(contentId: string): Promise<void> {
  await purgeBenefitCatalogContentReferencesRemote([contentId]);
}

/** Nettoyage après suppression définitive d'un contenu publié. */
export async function runContentCascadeCleanup(
  contentId: string,
  kind: 'event' | 'spot' | 'tool',
): Promise<void> {
  const targetType = kind === 'tool' ? 'tool' : kind === 'event' ? 'event' : 'spot';
  await Promise.all([
    unpublishWalksReferencingContent(contentId, targetType),
    purgeBenefitCatalogContentReferences(contentId),
  ]);
}
