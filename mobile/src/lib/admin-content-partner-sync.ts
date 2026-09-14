import { purgeBenefitCatalogLocalContentReferences } from '@/lib/benefit-catalog-store';
import { runContentCascadeCleanup } from '@/lib/content-cascade-cleanup';
import { purgePartnerBenefitOffersForContentIds } from '@/lib/partner-benefit-offers-store';
import {
  findPartnerSubmissionLocalIds,
  withdrawPartnerContentAfterAdminDelete,
} from '@/lib/partner-content-withdraw';

export type AdminContentRemovalMode = 'hidden' | 'removed';

/** Retire un contenu des vues partenaire (archivage, désactivation ou suppression). */
export async function syncPartnerViewsAfterAdminContentChange(
  kind: 'event' | 'spot' | 'tool',
  id: string,
  mode: AdminContentRemovalMode,
): Promise<void> {
  const cascadeKind = kind === 'tool' ? 'tool' : kind;
  const resolved = await findPartnerSubmissionLocalIds(cascadeKind, id);
  const allContentIds = [...new Set([...resolved.catalogIds, ...resolved.localIds, id])];

  if (mode === 'removed') {
    await withdrawPartnerContentAfterAdminDelete(cascadeKind, id);
  }

  for (const contentId of allContentIds) {
    await runContentCascadeCleanup(contentId, cascadeKind);
  }
  await purgePartnerBenefitOffersForContentIds(allContentIds);
  await purgeBenefitCatalogLocalContentReferences(allContentIds);
}
