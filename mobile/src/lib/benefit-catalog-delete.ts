import { deleteBenefitCatalogItem, type BenefitCatalogItem } from '@/lib/benefit-catalog-store';
import { appendUserNotification } from '@/lib/user-notifications-store';

export interface CatalogGrantSummary {
  grantCount: number;
  userIds: string[];
  beneficiaries: Array<{ userId: string; displayName: string }>;
}

export async function summarizeCatalogGrants(catalogId: string): Promise<CatalogGrantSummary> {
  const { listAllPrimeBenefits } = await import('@/lib/prime-benefits-store');
  const all = await listAllPrimeBenefits();
  const related = all.filter((b) => b.catalogId === catalogId);
  const userIds = [...new Set(related.map((b) => b.userId).filter(Boolean))];
  const beneficiaries: CatalogGrantSummary['beneficiaries'] = [];

  for (const userId of userIds) {
    const row = related.find((b) => b.userId === userId);
    beneficiaries.push({
      userId,
      displayName: row?.userPhone ?? userId.slice(0, 8),
    });
  }

  return {
    grantCount: related.length,
    userIds,
    beneficiaries,
  };
}

export function formatBenefitDeleteWarning(
  item: BenefitCatalogItem,
  summary: CatalogGrantSummary,
): string {
  if (summary.grantCount === 0) {
    return [
      `Supprimer définitivement « ${item.title} » ?`,
      '',
      'Conséquences :',
      '• Retrait du catalogue actif',
      '• Suppression des offres partenaires liées',
      '• Aucun octroi membre existant',
    ].join('\n');
  }

  return [
    `Supprimer « ${item.title} » malgré ${summary.grantCount} octroi(s) existant(s) ?`,
    '',
    'Conséquences :',
    `• ${summary.userIds.length} membre(s) perdront ce privilège`,
    '• Les octrois en cours seront supprimés en cascade',
    '• Cette action est irréversible',
  ].join('\n');
}

export async function purgeBenefitsForCatalog(catalogId: string): Promise<number> {
  const { deleteAllBenefitsForCatalog } = await import('@/lib/prime-benefits-store');
  return deleteAllBenefitsForCatalog(catalogId);
}

export async function sendBenefitRemovalApologies(
  item: BenefitCatalogItem,
  userIds: string[],
): Promise<void> {
  await Promise.all(
    userIds.map((userId) =>
      appendUserNotification(userId, {
        title: 'Privilège retiré',
        message: `Nous sommes désolés : le privilège « ${item.title} » n'est plus disponible sur THE LOOP. Contactez le service clientèle si vous avez des questions.`,
        audience: 'members',
      }),
    ),
  );
}

export async function deleteBenefitCatalogCascade(
  catalogId: string,
  options?: { sendApology?: boolean },
): Promise<{ ok: boolean; removedGrants: number; error?: string }> {
  const { listBenefitCatalog } = await import('@/lib/benefit-catalog-store');
  const catalog = await listBenefitCatalog();
  const item = catalog.find((c) => c.id === catalogId);
  if (!item) return { ok: false, removedGrants: 0, error: 'Privilège introuvable.' };

  const summary = await summarizeCatalogGrants(catalogId);
  if (options?.sendApology && summary.userIds.length > 0) {
    await sendBenefitRemovalApologies(item, summary.userIds);
  }

  const removedGrants = await purgeBenefitsForCatalog(catalogId);

  try {
    const offersStore = await import('@/lib/partner-benefit-offers-store');
    if (typeof offersStore.deletePartnerBenefitOffersForCatalog === 'function') {
      await offersStore.deletePartnerBenefitOffersForCatalog(catalogId);
    }
  } catch {
    /* optionnel */
  }

  const deleted = await deleteBenefitCatalogItem(catalogId);
  if (!deleted) return { ok: false, removedGrants, error: 'Suppression catalogue impossible.' };
  return { ok: true, removedGrants };
}
