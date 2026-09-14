import {
  isPartnerAssociatedBenefit,
  isTheLoopLinkedBenefit,
  listBenefitCatalog,
  type BenefitCatalogItem,
  type BenefitOfferingPartner,
  type BenefitPurpose,
} from '@/lib/benefit-catalog-store';
import {
  setAutomationJobStatus,
  type AutomationJob,
  type AutomationJobType,
} from '@/lib/admin-automation-jobs-store';
import {
  benefitGeoMatchesJobUser,
  benefitGeoMatchesJobZone,
  resolveBenefitGeoFromOffering,
} from '@/lib/benefit-geo';
import { appendUserNotification } from '@/lib/user-notifications-store';

const BENEFIT_JOB_TYPES: AutomationJobType[] = [
  'birthday_benefit',
  'welcome_benefit',
  'member_of_month',
  'benefit_grant',
];

export interface JobCatalogValidation {
  ok: boolean;
  needsBenefits: boolean;
  inactiveIds: string[];
  missingIds: string[];
  unvalidatedPartnerIds: string[];
  activeCount: number;
}

export interface GrantableCatalogEntry {
  item: BenefitCatalogItem;
  partnerId: string;
  partnerDisplayName: string;
  contentId?: string | null;
  contentType?: BenefitOfferingPartner['contentType'];
  contentTitle?: string | null;
  geoCountryCode?: string | null;
  geoLocationLabel?: string | null;
}

export function jobGrantsBenefits(job: AutomationJob): boolean {
  if (!BENEFIT_JOB_TYPES.includes(job.jobType)) return false;
  return job.payload.grantBenefits !== false;
}

export function jobNeedsCatalogValidation(job: AutomationJob): boolean {
  return BENEFIT_JOB_TYPES.includes(job.jobType) && jobGrantsBenefits(job);
}

/** Avantages uniques ayant au moins une offre partenaire validée. */
export function uniqueGrantableBenefits(offerings: GrantableCatalogEntry[]): BenefitCatalogItem[] {
  const seen = new Set<string>();
  const out: BenefitCatalogItem[] = [];
  for (const entry of offerings) {
    if (seen.has(entry.item.id)) continue;
    seen.add(entry.item.id);
    out.push(entry.item);
  }
  return out;
}

/** Offres partenaires validées pour un avantage catalogue. */
export function offeringsForBenefit(
  offerings: GrantableCatalogEntry[],
  catalogId: string,
): GrantableCatalogEntry[] {
  return offerings.filter((o) => o.item.id === catalogId);
}

function offeringPartnerKey(partnerId: string, displayName: string): string {
  return `${partnerId}::${displayName.trim().toLowerCase()}`;
}

/** Toutes les combinaisons avantage actif × partenaire validé. */
export async function listAutomationGrantableCatalog(options?: {
  countryCode?: string;
  benefitPurpose?: BenefitPurpose;
  job?: Pick<AutomationJob, 'countryCode' | 'city'>;
}): Promise<GrantableCatalogEntry[]> {
  const catalog = await listBenefitCatalog(true);
  const result: GrantableCatalogEntry[] = [];

  for (const item of catalog) {
    if (!item.isActive) continue;
    if (options?.benefitPurpose && item.benefitPurpose !== options.benefitPurpose) continue;
    if (options?.countryCode && item.countryCode && item.countryCode !== options.countryCode) continue;
    if (options?.countryCode && item.countryCode && item.countryCode !== options.countryCode) continue;

    if (!isPartnerAssociatedBenefit(item)) continue;

    for (const offering of item.offeringPartners ?? []) {
      const displayName = offering.displayName?.trim();
      if (!displayName) continue;
      // Catalogue actif = déjà validé côté serveur (partenaire ou THE LOOP direct)
      const geo = await resolveBenefitGeoFromOffering(item, offering);
      if (options?.job && !benefitGeoMatchesJobZone(geo, options.job)) continue;
      result.push({
        item,
        partnerId: offering.partnerId,
        partnerDisplayName: displayName,
        contentId: offering.contentId ?? null,
        contentType: offering.contentType ?? null,
        contentTitle: offering.contentTitle ?? null,
        geoCountryCode: geo.countryCode,
        geoLocationLabel: geo.locationLabel,
      });
    }
  }

  return result;
}

/** Avantages catalogue actifs, associés à un partenaire (ou THE LOOP + lieu) et validés si requis. */
export async function countValidatedActiveCatalogBenefits(options?: {
  countryCode?: string;
  theLoopOnly?: boolean;
}): Promise<number> {
  const items = uniqueGrantableBenefits(
    await listAutomationGrantableCatalog({ countryCode: options?.countryCode }),
  );
  if (!options?.theLoopOnly) return items.length;
  return items.filter((item) => isTheLoopLinkedBenefit(item)).length;
}

export function pickGrantableEntries(
  offerings: GrantableCatalogEntry[],
  catalogIds: string[],
  partnerByCatalogId?: Record<string, string>,
  partnerDisplayNameByCatalogId?: Record<string, string>,
): GrantableCatalogEntry[] {
  const ids = catalogIds.length > 0 ? catalogIds : [...new Set(offerings.map((o) => o.item.id))];
  const picked: GrantableCatalogEntry[] = [];

  for (const id of ids) {
    const options = offeringsForBenefit(offerings, id);
    if (!options.length) continue;

    const wantPartnerId = partnerByCatalogId?.[id];
    const wantName = partnerDisplayNameByCatalogId?.[id]?.trim();
    let match = options[0];

    if (wantPartnerId) {
      match =
        options.find(
          (o) =>
            o.partnerId === wantPartnerId &&
            (!wantName || o.partnerDisplayName.trim() === wantName),
        ) ??
        options.find((o) => o.partnerId === wantPartnerId) ??
        options[0];
    }

    picked.push({
      ...match,
      item: match.item,
      partnerId: match.partnerId,
      partnerDisplayName: wantName || match.partnerDisplayName,
    });
  }

  return picked;
}

async function resolveGrantableIds(
  catalogIds: string[],
  job?: AutomationJob,
): Promise<{
  grantable: GrantableCatalogEntry[];
  inactiveIds: string[];
  missingIds: string[];
  unvalidatedPartnerIds: string[];
}> {
  const grantableAll = await listAutomationGrantableCatalog(
    job
      ? {
          countryCode: job.countryCode,
          benefitPurpose: job.payload.benefitPurpose,
          job,
        }
      : undefined,
  );

  const inactiveIds: string[] = [];
  const missingIds: string[] = [];
  const unvalidatedPartnerIds: string[] = [];

  const catalog = await listBenefitCatalog();

  for (const id of catalogIds) {
    const item = catalog.find((c) => c.id === id);
    if (!item) {
      missingIds.push(id);
      continue;
    }
    if (!item.isActive) {
      inactiveIds.push(id);
      continue;
    }
    const options = offeringsForBenefit(grantableAll, id);
    if (!options.length) {
      unvalidatedPartnerIds.push(id);
      continue;
    }

    const wantPartnerId = job?.payload.partnerByCatalogId?.[id];
    if (wantPartnerId && !options.some((o) => o.partnerId === wantPartnerId)) {
      unvalidatedPartnerIds.push(id);
    }
  }

  const grantable = job
    ? pickGrantableEntries(
        grantableAll,
        catalogIds,
        job.payload.partnerByCatalogId,
        job.payload.partnerDisplayNameByCatalogId,
      )
    : pickGrantableEntries(grantableAll, catalogIds);

  return { grantable, inactiveIds, missingIds, unvalidatedPartnerIds };
}

export async function validateJobCatalog(job: AutomationJob): Promise<JobCatalogValidation> {
  const empty: JobCatalogValidation = {
    ok: true,
    needsBenefits: false,
    inactiveIds: [],
    missingIds: [],
    unvalidatedPartnerIds: [],
    activeCount: 0,
  };

  if (!jobNeedsCatalogValidation(job)) return empty;

  const catalogIds = job.payload.catalogIds ?? [];

  if (catalogIds.length === 0) {
    const matching = await listAutomationGrantableCatalog({
      countryCode: job.countryCode,
      benefitPurpose: job.payload.benefitPurpose,
      job,
    });
    const unique = uniqueGrantableBenefits(matching);
    return {
      ok: unique.length > 0,
      needsBenefits: true,
      inactiveIds: [],
      missingIds: [],
      unvalidatedPartnerIds: [],
      activeCount: unique.length,
    };
  }

  const resolved = await resolveGrantableIds(catalogIds, job);
  return {
    ok: resolved.grantable.length > 0 && resolved.unvalidatedPartnerIds.length === 0,
    needsBenefits: true,
    inactiveIds: resolved.inactiveIds,
    missingIds: resolved.missingIds,
    unvalidatedPartnerIds: resolved.unvalidatedPartnerIds,
    activeCount: resolved.grantable.length,
  };
}

export async function resolveGrantableCatalogForJob(
  job: AutomationJob,
  userCity?: string | null,
): Promise<GrantableCatalogEntry[]> {
  const offerings = await listAutomationGrantableCatalog({
    countryCode: job.countryCode,
    benefitPurpose: job.payload.benefitPurpose,
    job,
  });

  const picked = pickGrantableEntries(
    offerings,
    job.payload.catalogIds ?? [],
    job.payload.partnerByCatalogId,
    job.payload.partnerDisplayNameByCatalogId,
  );

  if (!userCity?.trim()) return picked;

  return picked.filter((entry) => benefitGeoMatchesJobUser(
    {
      countryCode: entry.geoCountryCode ?? entry.item.countryCode ?? null,
      locationLabel: entry.geoLocationLabel ?? entry.item.city ?? null,
    },
    job,
    userCity,
  ));
}

export async function deactivateJobForInvalidCatalog(
  job: AutomationJob,
  validation: JobCatalogValidation,
): Promise<void> {
  if (job.status !== 'active') return;

  await setAutomationJobStatus(job.id, 'inactive');

  const invalid = [
    ...validation.inactiveIds,
    ...validation.missingIds,
    ...validation.unvalidatedPartnerIds,
  ];
  const detail =
    invalid.length > 0
      ? `Avantage(s) ou partenaire(s) invalide(s) : ${invalid.join(', ')}.`
      : 'Aucun avantage actif et validé par un partenaire pour ce job.';

  await appendUserNotification('admin-demo', {
    title: 'Job automatique désactivé',
    message:
      `Le job « ${job.name} » a été désactivé. ${detail} ` +
      'Sélectionnez un autre avantage / partenaire dans le catalogue puis réactivez le job.',
    audience: 'admin',
  });
}

export function defaultNoBenefitMessage(job: AutomationJob): string {
  if (job.jobType === 'birthday_benefit') {
    return (
      "Joyeux anniversaire ! On n'est pas encore très présents dans ta ville, mais on arrive bientôt. " +
      'En attendant, découvre notre section Outils !'
    );
  }
  if (job.jobType === 'welcome_benefit') {
    return 'Bienvenue dans THE LOOP ! Découvre nos outils en attendant les partenaires de ta ville.';
  }
  if (job.jobType === 'member_of_month') {
    return 'Félicitations pour ton engagement ce mois-ci !';
  }
  return 'Information THE LOOP — merci de faire partie de la communauté.';
}

export { offeringPartnerKey };
