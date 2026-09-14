import type { NotificationAudience } from '@/lib/admin-notifications-store';
import type { BenefitPurpose } from '@/lib/benefit-catalog-store';
import { locationsMatchPrefectureMesh, normalizeLocationLabel, formatLocationPrefectureLabel } from '@/lib/guinea-locations';
import { loadCachedJson, saveCachedJson } from '@/lib/remote-settings-sync';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { AUDIENCE_LABELS } from '@/lib/notification-audience';
import { BENEFIT_PURPOSE_LABELS } from '@/lib/benefit-catalog-store';
import { GRANT_AUDIENCE_LABELS, type BenefitGrantAudience } from '@/lib/prime-benefits-store';
import type { UserRole } from '@/types';

export type AutomationJobType =
  | 'birthday_benefit'
  | 'birthday_greeting'
  | 'welcome_benefit'
  | 'member_of_month'
  | 'push_notification'
  | 'benefit_grant'
  | 'spot_stars';

export type AutomationJobStatus = 'active' | 'inactive' | 'archived';

export type AutomationJobSchedule = 'daily' | 'monthly' | 'yearly' | 'on_signup' | 'on_demand';

/** Portée audience notification (UI admin). */
export type AutomationAudienceScope = 'all' | 'roles' | 'individual';

export interface AutomationJobPayload {
  /** Libellé affiché si type personnalisé admin. */
  customTypeLabel?: string;
  /** Tous les comptes | par rôle | membres ciblés. */
  audienceScope?: AutomationAudienceScope;
  /** Membres registre ciblés (multi). */
  targetUserIds?: string[];
  catalogIds?: string[];
  /** Partenaire choisi par avantage catalogue (octroi automatisé). */
  partnerByCatalogId?: Record<string, string>;
  partnerDisplayNameByCatalogId?: Record<string, string>;
  benefitPurpose?: BenefitPurpose;
  validityDays?: number;
  grantBenefits?: boolean;
  noBenefitMessage?: string;
  notificationTitle?: string;
  notificationMessage?: string;
  notificationAudience?: NotificationAudience;
  /** Rôles cibles (multi-sélection) — prioritaire sur notificationAudience. */
  targetRoles?: UserRole[];
  targetPhones?: string[];
  targetEmails?: string[];
  favoriteEventCategories?: string[];
  favoriteSpotCategories?: string[];
  favoriteToolCategories?: string[];
  grantAudience?: BenefitGrantAudience;
  notifyAllMembers?: boolean;
  welcomeMessage?: string;
  birthdayTitle?: string;
}

export interface AutomationJob {
  id: string;
  name: string;
  jobType: AutomationJobType;
  status: AutomationJobStatus;
  schedule: AutomationJobSchedule;
  countryCode: string;
  city: string | null;
  payload: AutomationJobPayload;
  lastRunAt: string | null;
  lastRunCount: number | null;
  lastRunSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

const CACHE_KEY = 'loop_admin_automation_jobs_v1';

let memoryJobs: AutomationJob[] | null = null;

export async function peekAutomationJobs(): Promise<AutomationJob[]> {
  if (memoryJobs) return memoryJobs;
  const cached = await loadCachedJson<AutomationJob[]>(CACHE_KEY);
  memoryJobs = cached ?? [];
  return memoryJobs;
}

async function refreshAutomationJobsRemote(): Promise<void> {
  const remote = await fetchRemote();
  if (remote?.length) {
    memoryJobs = remote;
    await saveCachedJson(CACHE_KEY, remote);
  }
}

async function loadAll(forceRemote = false): Promise<AutomationJob[]> {
  if (!forceRemote && memoryJobs) {
    void refreshAutomationJobsRemote();
    return memoryJobs;
  }

  const cached = memoryJobs ?? (await loadCachedJson<AutomationJob[]>(CACHE_KEY));
  if (cached?.length && !forceRemote) {
    memoryJobs = cached;
    void refreshAutomationJobsRemote();
    return cached;
  }

  const remote = await fetchRemote();
  if (remote?.length) {
    memoryJobs = remote;
    await saveCachedJson(CACHE_KEY, remote);
    return remote;
  }

  memoryJobs = cached ?? [];
  return memoryJobs;
}

export const JOB_TYPE_LABELS: Record<AutomationJobType, string> = {
  birthday_benefit: 'Cadeau anniversaire (legacy)',
  birthday_greeting: 'Vœux anniversaire',
  welcome_benefit: 'Bienvenue (legacy)',
  member_of_month: 'Membre du mois (legacy)',
  push_notification: 'Notification',
  benefit_grant: 'Octroi avantages (legacy)',
  spot_stars: 'Calcul étoiles spots',
};

/** Types créables dans l'admin — notifications uniquement. */
export const NOTIFICATION_JOB_TYPES: AutomationJobType[] = [
  'push_notification',
  'birthday_greeting',
  'spot_stars',
];

export const AUDIENCE_SCOPE_LABELS: Record<AutomationAudienceScope, string> = {
  all: 'Tous les comptes',
  roles: 'Par rôle',
  individual: 'Membres ciblés',
};

/** Types hérités éventuels en base (affichage détail). */
const LEGACY_JOB_TYPE_LABELS: Record<string, string> = {
  birthday: 'Anniversaire (legacy)',
  welcome: 'Bienvenue (legacy)',
  push: 'Notification (legacy)',
  notification: 'Notification (legacy)',
};

export function getJobTypeLabel(jobType: string, customTypeLabel?: string | null): string {
  if (customTypeLabel?.trim()) return customTypeLabel.trim();
  return JOB_TYPE_LABELS[jobType as AutomationJobType] ?? LEGACY_JOB_TYPE_LABELS[jobType] ?? jobType;
}

export const JOB_SCHEDULE_LABELS: Record<AutomationJobSchedule, string> = {
  daily: 'Quotidien',
  monthly: 'Mensuel (1er)',
  yearly: 'Annuel',
  on_signup: "À l'inscription",
  on_demand: 'Manuel',
};

export const AUTOMATION_ROLE_OPTIONS: Array<{ id: UserRole; label: string }> = [
  { id: 'USER_FREE', label: 'Membres gratuits' },
  { id: 'USER_PRIME', label: 'Loop Prime' },
  { id: 'PARTNER', label: 'Partenaires' },
  { id: 'ADMIN', label: 'Administrateurs' },
];

export const JOB_STATUS_LABELS: Record<AutomationJobStatus, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  archived: 'Archivé',
};

export const DEFAULT_SCHEDULE: Record<AutomationJobType, AutomationJobSchedule> = {
  birthday_benefit: 'daily',
  birthday_greeting: 'daily',
  welcome_benefit: 'on_signup',
  member_of_month: 'monthly',
  push_notification: 'daily',
  benefit_grant: 'on_demand',
  spot_stars: 'daily',
};

/** Résumé lisible pour la modale détail (toujours au moins une ligne). */
export function formatAutomationJobDetailLines(job: AutomationJob): string[] {
  const p = job.payload;
  const lines: string[] = [
    `Type : ${getJobTypeLabel(job.jobType, p.customTypeLabel)}`,
    `Fréquence : ${JOB_SCHEDULE_LABELS[job.schedule] ?? job.schedule}`,
    `Zone : ${job.city?.trim() || 'Tout le pays'}`,
  ];

  if (job.jobType === 'birthday_greeting') {
    lines.push('Audience : anniversaires du jour (date de naissance profil)');
  } else if (job.jobType === 'spot_stars') {
    lines.push('Action : recalcul des étoiles des spots');
  } else if (p.audienceScope === 'individual' || p.targetUserIds?.length || p.targetPhones?.length || p.targetEmails?.length) {
    lines.push('Audience : membres ciblés');
    if (p.targetUserIds?.length) lines.push(`Membres sélectionnés : ${p.targetUserIds.length}`);
    if (p.targetPhones?.length) lines.push(`Téléphones : ${p.targetPhones.join(', ')}`);
    if (p.targetEmails?.length) lines.push(`E-mails : ${p.targetEmails.join(', ')}`);
  } else if (p.audienceScope === 'roles' || p.targetRoles?.length) {
    lines.push(
      `Audience : ${p.targetRoles?.length
        ? p.targetRoles.map((r) => AUTOMATION_ROLE_OPTIONS.find((o) => o.id === r)?.label ?? r).join(', ')
        : 'Par rôle (non défini)'}`,
    );
  } else if (p.notificationAudience) {
    lines.push(`Audience : ${AUDIENCE_LABELS[p.notificationAudience] ?? p.notificationAudience}`);
  } else if (p.grantAudience) {
    lines.push(`Audience (legacy) : ${GRANT_AUDIENCE_LABELS[p.grantAudience] ?? p.grantAudience}`);
  } else if (job.jobType === 'birthday_benefit') {
    lines.push('Audience : anniversaires du jour (legacy avantages)');
  } else if (job.jobType === 'welcome_benefit') {
    lines.push('Audience : nouveau membre à l\'inscription (legacy)');
  } else {
    lines.push('Audience : tous les comptes');
  }

  const favParts: string[] = [];
  if (p.favoriteEventCategories?.length) favParts.push(`évén. ${p.favoriteEventCategories.join(', ')}`);
  if (p.favoriteSpotCategories?.length) favParts.push(`spots ${p.favoriteSpotCategories.join(', ')}`);
  if (p.favoriteToolCategories?.length) favParts.push(`outils ${p.favoriteToolCategories.join(', ')}`);
  if (favParts.length) lines.push(`Favoris : ${favParts.join(' · ')}`);

  if (p.notificationTitle) lines.push(`Titre : ${p.notificationTitle}`);
  if (p.notificationMessage) lines.push(`Message : ${p.notificationMessage}`);
  if (p.welcomeMessage) lines.push(`Message bienvenue : ${p.welcomeMessage}`);
  if (p.birthdayTitle) lines.push(`Titre anniversaire : ${p.birthdayTitle}`);
  if (p.benefitPurpose) lines.push(`Finalité : ${BENEFIT_PURPOSE_LABELS[p.benefitPurpose] ?? p.benefitPurpose}`);
  if (p.validityDays != null) lines.push(`Validité avantage : ${p.validityDays} jours`);
  if (p.catalogIds?.length) lines.push(`Avantages catalogue : ${p.catalogIds.length} sélectionné(s)`);
  if (p.grantBenefits === false) lines.push('Octroi avantage : non (message seul)');
  if (p.noBenefitMessage) lines.push(`Sans avantage ville : ${p.noBenefitMessage}`);
  if (p.notifyAllMembers != null) {
    lines.push(p.notifyAllMembers ? 'Annonce publique : oui' : 'Annonce publique : gagnant seul');
  }

  if (lines.length <= 3 && job.jobType === 'spot_stars') {
    lines.push('Aucun paramètre message — job technique quotidien.');
  }

  return lines;
}

type DbRow = {
  id: string;
  name: string;
  job_type: AutomationJobType;
  status: AutomationJobStatus;
  schedule: AutomationJobSchedule;
  country_code: string;
  city: string | null;
  payload: AutomationJobPayload;
  last_run_at: string | null;
  last_run_count: number | null;
  last_run_summary: string | null;
  created_at: string;
  updated_at: string;
};

function rowToJob(row: DbRow): AutomationJob {
  return {
    id: row.id,
    name: row.name,
    jobType: row.job_type,
    status: row.status,
    schedule: row.schedule,
    countryCode: row.country_code,
    city: row.city,
    payload: (row.payload ?? {}) as AutomationJobPayload,
    lastRunAt: row.last_run_at,
    lastRunCount: row.last_run_count,
    lastRunSummary: row.last_run_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function jobToRow(job: AutomationJob): DbRow {
  return {
    id: job.id,
    name: job.name,
    job_type: job.jobType,
    status: job.status,
    schedule: job.schedule,
    country_code: job.countryCode,
    city: job.city,
    payload: job.payload,
    last_run_at: job.lastRunAt,
    last_run_count: job.lastRunCount,
    last_run_summary: job.lastRunSummary,
    created_at: job.createdAt,
    updated_at: job.updatedAt,
  };
}

async function fetchRemote(): Promise<AutomationJob[] | null> {
  if (!isSupabaseConfigured() || !supabase) return null;
  const { data, error } = await supabase
    .from('admin_automation_jobs')
    .select('id, name, job_type, status, schedule, country_code, city, payload, last_run_at, last_run_count, last_run_summary, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error || !data?.length) return null;
  return (data as DbRow[]).map(rowToJob);
}

async function upsertRemote(job: AutomationJob): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const row = jobToRow(job);
  const { error } = await supabase.from('admin_automation_jobs').upsert({
    id: row.id,
    name: row.name,
    job_type: row.job_type,
    status: row.status,
    schedule: row.schedule,
    country_code: row.country_code,
    city: row.city,
    payload: row.payload,
    last_run_at: row.last_run_at,
    last_run_count: row.last_run_count,
    last_run_summary: row.last_run_summary,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
  if (error) console.warn('[AutomationJobs] upsert:', error.message);
}

async function deleteRemote(id: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;
  const { error } = await supabase.from('admin_automation_jobs').delete().eq('id', id);
  if (error) console.warn('[AutomationJobs] delete:', error.message);
}

export function normalizeJobCity(value: string | null | undefined): string {
  return normalizeLocationLabel(value);
}

export function userMatchesJobGeo(
  user: { countryCode?: string | null; city?: string | null },
  job: Pick<AutomationJob, 'countryCode' | 'city'>,
): boolean {
  if (job.countryCode && user.countryCode && user.countryCode !== job.countryCode) return false;
  if (job.city?.trim()) {
    return locationsMatchPrefectureMesh(user.city, job.city);
  }
  return true;
}

export function formatCatalogGeoLabel(item: { city?: string | null }): string {
  const label = formatLocationPrefectureLabel(item.city);
  return label ? label : 'Tout le pays / en ligne';
}

/** Avantage national (livraison, en ligne) — pas de ville catalogue. */
export function isNationwideCatalogItem(item: { city?: string | null }): boolean {
  return !item.city?.trim();
}

/**
 * Croise la ville profil membre et la ville cible de l'avantage.
 * @deprecated Préférer benefitGeoMatchesUser — ne tient pas compte de la geo spot/offre.
 */
export function catalogMatchesUserCity(
  item: { countryCode?: string | null; city?: string | null },
  userCity?: string | null,
  countryCode?: string | null,
): boolean {
  if (countryCode && item.countryCode && item.countryCode !== countryCode) return false;
  if (!item.city?.trim()) return true;
  if (!userCity?.trim()) return false;
  return locationsMatchPrefectureMesh(userCity, item.city);
}

/** Filtre catalogue admin : zone du job vs ville de l'avantage (sans profil membre). */
export function catalogMatchesJobZone(
  item: { countryCode?: string | null; city?: string | null },
  job: Pick<AutomationJob, 'countryCode' | 'city'>,
): boolean {
  if (item.countryCode && item.countryCode !== job.countryCode) return false;
  if (!job.city?.trim()) return true;
  if (!item.city?.trim()) return true;
  return locationsMatchPrefectureMesh(item.city, job.city);
}

export function catalogMatchesJobGeo(
  item: { countryCode?: string | null; city?: string | null },
  job: Pick<AutomationJob, 'countryCode' | 'city'>,
  userCity?: string | null,
): boolean {
  if (item.countryCode && item.countryCode !== job.countryCode) return false;
  if (job.city?.trim()) {
    if (!userCity?.trim() || !locationsMatchPrefectureMesh(userCity, job.city)) return false;
  }
  if (item.city?.trim()) {
    if (!userCity?.trim()) return false;
    return locationsMatchPrefectureMesh(userCity, item.city);
  }
  return true;
}

export async function listAutomationJobs(options?: {
  status?: AutomationJobStatus | AutomationJobStatus[];
  includeArchived?: boolean;
  countryCode?: string;
}): Promise<AutomationJob[]> {
  let jobs = await loadAll();
  if (!options?.includeArchived) {
    jobs = jobs.filter((j) => j.status !== 'archived');
  }
  if (options?.countryCode) {
    jobs = jobs.filter((j) => j.countryCode === options.countryCode);
  }
  if (options?.status) {
    const statuses = Array.isArray(options.status) ? options.status : [options.status];
    jobs = jobs.filter((j) => statuses.includes(j.status));
  }
  return jobs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAutomationJob(id: string): Promise<AutomationJob | null> {
  const jobs = await loadAll();
  return jobs.find((j) => j.id === id) ?? null;
}

export async function listActiveAutomationJobs(countryCode?: string): Promise<AutomationJob[]> {
  return listAutomationJobs({ status: 'active', countryCode });
}

export async function createAutomationJob(input: {
  name: string;
  jobType: AutomationJobType;
  countryCode: string;
  city?: string | null;
  schedule?: AutomationJobSchedule;
  payload?: AutomationJobPayload;
  status?: AutomationJobStatus;
}): Promise<AutomationJob> {
  const jobs = await loadAll();
  const now = new Date().toISOString();
  const entry: AutomationJob = {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim(),
    jobType: input.jobType,
    status: input.status ?? 'inactive',
    schedule: input.schedule ?? DEFAULT_SCHEDULE[input.jobType],
    countryCode: input.countryCode,
    city: input.city?.trim() ? input.city.trim() : null,
    payload: input.payload ?? {},
    lastRunAt: null,
    lastRunCount: null,
    lastRunSummary: null,
    createdAt: now,
    updatedAt: now,
  };
  jobs.unshift(entry);
  await upsertRemote(entry);
  await saveCachedJson(CACHE_KEY, jobs);
  return entry;
}

export async function updateAutomationJob(
  id: string,
  patch: Partial<Pick<AutomationJob, 'name' | 'status' | 'schedule' | 'city' | 'payload' | 'countryCode'>>,
): Promise<AutomationJob | null> {
  const jobs = await loadAll();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx < 0) return null;
  jobs[idx] = {
    ...jobs[idx],
    ...patch,
    city: patch.city !== undefined ? (patch.city?.trim() ? patch.city.trim() : null) : jobs[idx].city,
    payload: patch.payload !== undefined ? patch.payload : jobs[idx].payload,
    updatedAt: new Date().toISOString(),
  };
  await upsertRemote(jobs[idx]);
  await saveCachedJson(CACHE_KEY, jobs);
  return jobs[idx];
}

export async function setAutomationJobStatus(id: string, status: AutomationJobStatus): Promise<void> {
  await updateAutomationJob(id, { status });
}

export async function archiveAutomationJob(id: string): Promise<void> {
  await setAutomationJobStatus(id, 'archived');
}

export async function deleteAutomationJob(id: string): Promise<boolean> {
  const jobs = await loadAll();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx < 0) return false;
  jobs.splice(idx, 1);
  memoryJobs = jobs;
  await saveCachedJson(CACHE_KEY, jobs);
  await deleteRemote(id);
  return true;
}

export async function recordAutomationJobRun(
  id: string,
  count: number,
  summary: string,
): Promise<void> {
  const jobs = await loadAll();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx < 0) return;
  jobs[idx] = {
    ...jobs[idx],
    lastRunAt: new Date().toISOString(),
    lastRunCount: count,
    lastRunSummary: summary,
    updatedAt: new Date().toISOString(),
  };
  await upsertRemote(jobs[idx]);
  await saveCachedJson(CACHE_KEY, jobs);
}
