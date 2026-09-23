import {
  deactivateJobForInvalidCatalog,
  defaultNoBenefitMessage,
  jobGrantsBenefits,
  resolveGrantableCatalogForJob,
  type GrantableCatalogEntry,
  validateJobCatalog,
} from '@/lib/admin-automation-benefits';
import {
  benefitGeoMatchesJobUser,
  geoTargetFromGrantableEntry,
} from '@/lib/benefit-geo';
import {
  getAutomationJob,
  listActiveAutomationJobs,
  recordAutomationJobRun,
  userMatchesJobGeo,
  type AutomationJob,
} from '@/lib/admin-automation-jobs-store';
import * as Crypto from 'expo-crypto';
import { ensurePushCampaignDraft, recordSentPushCampaign } from '@/lib/admin-notifications-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  distributeNotification,
  appendUserNotification,
  filterUsersMatchingFavoriteCategories,
  listUserNotifications,
} from '@/lib/user-notifications-store';
import { grantPrimeBenefits, listBenefitGrantRecipientTargets } from '@/lib/prime-benefits-store';
import { processDailySpotStarCalculation } from '@/lib/spot-stars-store';
import { listRegistryUsers, type RegistryUser } from '@/lib/user-registry-store';
import { loadDemoFavorites } from '@/lib/demo-auth';
import type { HomeLocation } from '@/lib/demo-data';
import type { UserRole } from '@/types';

export interface AutomationRunnerContext {
  getHomeLocations: () => HomeLocation[];
}

export interface AutomationRunResult {
  jobId: string;
  jobName: string;
  count: number;
  summary: string;
  skipped?: boolean;
}

function birthdayLogKey(jobId: string): string {
  return `loop_job_birthday_log_${jobId}`;
}

interface BirthdayGrantLog {
  userId: string;
  year: number;
  grantedAt: string;
}

async function loadBirthdayLog(jobId: string): Promise<BirthdayGrantLog[]> {
  try {
    const raw = await AsyncStorage.getItem(birthdayLogKey(jobId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BirthdayGrantLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveBirthdayLog(jobId: string, entries: BirthdayGrantLog[]): Promise<void> {
  await AsyncStorage.setItem(birthdayLogKey(jobId), JSON.stringify(entries));
}

function isBirthdayToday(birthDate: string | null | undefined, date = new Date()): boolean {
  if (!birthDate) return false;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return false;
  return d.getDate() === date.getDate() && d.getMonth() === date.getMonth();
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function shouldRunScheduledJob(job: AutomationJob, now = new Date()): boolean {
  if (job.schedule === 'on_signup' || job.schedule === 'on_demand') return false;
  if (!job.lastRunAt) return true;
  const last = new Date(job.lastRunAt);
  if (job.schedule === 'daily') return !isSameDay(last, now);
  if (job.schedule === 'monthly') {
    if (now.getDate() !== 1) return false;
    return !isSameMonth(last, now);
  }
  if (job.schedule === 'yearly') {
    return last.getFullYear() !== now.getFullYear();
  }
  return true;
}

function resolveCityBenefitsForUser(
  items: GrantableCatalogEntry[],
  job: AutomationJob,
  user: Pick<RegistryUser, 'countryCode' | 'city'>,
): GrantableCatalogEntry[] {
  return items.filter((entry) =>
    benefitGeoMatchesJobUser(geoTargetFromGrantableEntry(entry), job, user.city),
  );
}

async function sendNoBenefitMessage(
  job: AutomationJob,
  user: Pick<RegistryUser, 'id' | 'phoneNumber' | 'firstName'>,
  title: string,
): Promise<void> {
  const message = job.payload.noBenefitMessage?.trim() || defaultNoBenefitMessage(job);
  const name = user.firstName?.trim();
  const body = name ? message.replace(/\{name\}/gi, name) : message;

  if (user.phoneNumber) {
    await distributeNotification({
      title,
      message: body,
      audience: 'individual',
      targetPhone: user.phoneNumber,
    });
    return;
  }

  await appendUserNotification(user.id, {
    title,
    message: body,
    audience: 'individual',
  });
}

async function grantJobBenefits(
  job: AutomationJob,
  user: Pick<RegistryUser, 'phoneNumber' | 'countryCode' | 'city'>,
  entries: GrantableCatalogEntry[],
  validityDays?: number,
): Promise<void> {
  if (entries.length === 0) return;
  const validity = validityDays ?? job.payload.validityDays ?? entries[0].item.defaultValidityDays ?? 30;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + validity);

  const partnerByCatalogId: Record<string, string> = {};
  const partnerDisplayNameByCatalogId: Record<string, string> = {};
  for (const entry of entries) {
    partnerByCatalogId[entry.item.id] = entry.partnerId;
    partnerDisplayNameByCatalogId[entry.item.id] = entry.partnerDisplayName;
  }

  await grantPrimeBenefits({
    catalogIds: entries.map((e) => e.item.id),
    partnerByCatalogId,
    partnerDisplayNameByCatalogId,
    audience: 'individual',
    targetPhones: user.phoneNumber ?? undefined,
    expiresAt: expiresAt.toISOString(),
    grantedBy: `job:${job.id}`,
    grantCountryCode: user.countryCode ?? job.countryCode,
    grantCity: user.city ?? job.city,
  });
}

async function ensureJobCatalogReady(job: AutomationJob): Promise<AutomationRunResult | null> {
  const validation = await validateJobCatalog(job);
  if (!validation.needsBenefits || validation.ok) return null;

  await deactivateJobForInvalidCatalog(job, validation);
  return {
    jobId: job.id,
    jobName: job.name,
    count: 0,
    summary: 'Avantage(s) catalogue invalide(s) — job désactivé, admin notifié',
    skipped: true,
  };
}

async function runBirthdayJob(job: AutomationJob, date = new Date()): Promise<number> {
  const users = await listRegistryUsers();
  const log = await loadBirthdayLog(job.id);
  const year = date.getFullYear();
  const grantBenefits = jobGrantsBenefits(job);
  const title = job.payload.birthdayTitle?.trim() || 'Joyeux anniversaire ! 🎂';
  let processed = 0;

  for (const user of users) {
    if (!isBirthdayToday(user.birthDate, date)) continue;
    if (!userMatchesJobGeo(user, job)) continue;
    if (log.some((e) => e.userId === user.id && e.year === year)) continue;

    const cityItems = grantBenefits
      ? resolveCityBenefitsForUser(await resolveGrantableCatalogForJob(job, user.city), job, user)
      : [];

    if (grantBenefits && cityItems.length > 0) {
      await grantJobBenefits(job, user, cityItems);
    } else {
      await sendNoBenefitMessage(job, user, title);
    }

    log.push({ userId: user.id, year, grantedAt: date.toISOString() });
    processed += 1;
  }

  await saveBirthdayLog(job.id, log);
  return processed;
}

const WELCOME_AUTOMATION_USERS_KEY = 'loop_welcome_automation_done_v1';

async function loadWelcomeAutomationDone(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(WELCOME_AUTOMATION_USERS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

async function markWelcomeAutomationDone(userId: string): Promise<void> {
  const set = await loadWelcomeAutomationDone();
  if (set.has(userId)) return;
  set.add(userId);
  await AsyncStorage.setItem(WELCOME_AUTOMATION_USERS_KEY, JSON.stringify([...set].slice(-800)));
}

async function userAlreadyWelcomedByAutomation(userId: string): Promise<boolean> {
  const done = await loadWelcomeAutomationDone();
  if (done.has(userId)) return true;
  const inbox = await listUserNotifications(userId, null, { force: false });
  return inbox.some((n) => n.title.trim().startsWith('Bienvenue'));
}

async function runWelcomeJobForUser(job: AutomationJob, user: RegistryUser): Promise<number> {
  if (!userMatchesJobGeo(user, job)) return 0;
  if (await userAlreadyWelcomedByAutomation(user.id)) return 0;

  const name = user.firstName?.trim() || 'Membre';
  const customMessage = job.payload.welcomeMessage?.trim();
  const defaultMessage =
    'Ton compte THE LOOP est actif. Découvre les événements, spots et outils près de toi. ' +
    'Tu peux à tout moment mettre à jour ton profil en cliquant sur le petit bonhomme en bas à droite.';

  await appendUserNotification(user.id, {
    title: `Bienvenue ${name} !`,
    message: customMessage || defaultMessage,
    audience: 'individual',
  });
  await markWelcomeAutomationDone(user.id);
  const count = 1;

  if (!jobGrantsBenefits(job)) return count;

  const cityItems = resolveCityBenefitsForUser(
    await resolveGrantableCatalogForJob(job, user.city),
    job,
    user,
  );

  if (cityItems.length > 0) {
    await grantJobBenefits(job, user, cityItems);
  }

  return count;
}

export async function processWelcomeAutomationForUser(
  user: Pick<RegistryUser, 'id' | 'phoneNumber' | 'countryCode' | 'city' | 'firstName' | 'role'>,
): Promise<number> {
  if (user.role === 'USER_ANONYMOUS' || user.role === 'ADMIN') return 0;
  const jobs = (await listActiveAutomationJobs()).filter((j) => j.jobType === 'welcome_benefit');
  if (jobs.length === 0) return 0;

  let total = 0;
  for (const job of jobs) {
    const blocked = await ensureJobCatalogReady(job);
    if (blocked) continue;

    const count = await runWelcomeJobForUser(job, user as RegistryUser);
    if (count > 0) {
      await recordAutomationJobRun(job.id, count, `Bienvenue — ${user.firstName ?? user.id}`);
      total += count;
    }
  }
  return total;
}

async function scoreMemberEngagement(userId: string): Promise<number> {
  const fav = await loadDemoFavorites(userId);
  return fav.events.length + fav.locations.length;
}

async function runMemberOfMonthJob(job: AutomationJob): Promise<number> {
  const users = await listRegistryUsers();
  const candidates = users.filter(
    (u) =>
      u.role !== 'ADMIN' &&
      u.role !== 'USER_ANONYMOUS' &&
      u.role !== 'PARTNER' &&
      userMatchesJobGeo(u, job) &&
      u.phoneNumber,
  );

  if (candidates.length === 0) return 0;

  let winner = candidates[0];
  let bestScore = -1;
  for (const user of candidates) {
    const score = await scoreMemberEngagement(user.id);
    if (score > bestScore) {
      bestScore = score;
      winner = user;
    }
  }

  const winnerName = [winner.firstName, winner.lastName].filter(Boolean).join(' ') || 'Membre';
  const grantBenefits = jobGrantsBenefits(job);

  if (grantBenefits) {
    const cityItems = resolveCityBenefitsForUser(
      await resolveGrantableCatalogForJob(job, winner.city),
      job,
      winner,
    );
    if (cityItems.length > 0) {
      await grantJobBenefits(job, winner, cityItems);
    }
  }

  const congratsMessage =
    job.payload.noBenefitMessage?.trim() ||
    `Félicitations ${winnerName} ! Tu es le membre du mois${job.city ? ` à ${job.city}` : ''}.`;

  await appendUserNotification(winner.id, {
    title: 'Membre du mois THE LOOP',
    message: congratsMessage,
    audience: 'individual',
  });

  if (job.payload.notifyAllMembers) {
    const cityLabel = job.city ?? winner.city ?? 'ta ville';
    await distributeNotification({
      title: 'Membre du mois',
      message: `${winnerName} est le membre du mois THE LOOP${job.city ? ` à ${cityLabel}` : ''}. Bravo !`,
      audience: 'members',
      countryCode: job.countryCode,
      city: job.city ?? undefined,
    });
  }

  return 1;
}

async function runBirthdayGreetingJob(job: AutomationJob, date = new Date()): Promise<number> {
  const users = await listRegistryUsers();
  const log = await loadBirthdayLog(job.id);
  const year = date.getFullYear();
  const title = job.payload.birthdayTitle?.trim() || job.payload.notificationTitle?.trim() || 'Joyeux anniversaire ! 🎂';
  const defaultBody =
    job.payload.notificationMessage?.trim() ||
    job.payload.welcomeMessage?.trim() ||
    'Toute l\'équipe THE LOOP te souhaite une excellente journée !';
  let processed = 0;

  for (const user of users) {
    if (!isBirthdayToday(user.birthDate, date)) continue;
    if (!userMatchesJobGeo(user, job)) continue;
    if (log.some((e) => e.userId === user.id && e.year === year)) continue;

    const name = user.firstName?.trim();
    const body = name ? defaultBody.replace(/\{name\}/gi, name) : defaultBody;

    if (user.phoneNumber) {
      await distributeNotification({
        title,
        message: body,
        audience: 'individual',
        targetPhone: user.phoneNumber,
        countryCode: job.countryCode,
        city: job.city ?? undefined,
      });
    } else {
      await appendUserNotification(user.id, {
        title,
        message: body,
        audience: 'individual',
      });
    }

    log.push({ userId: user.id, year, grantedAt: date.toISOString() });
    processed += 1;
  }

  await saveBirthdayLog(job.id, log);
  return processed;
}

function userMatchesTargetRoles(user: RegistryUser, roles: UserRole[]): boolean {
  if (!roles.length) return true;
  return roles.includes(user.role);
}

async function filterRecipientsByFavorites(
  recipients: RegistryUser[],
  job: AutomationJob,
): Promise<RegistryUser[]> {
  return filterUsersMatchingFavoriteCategories(
    recipients,
    job.payload.favoriteEventCategories ?? [],
    job.payload.favoriteSpotCategories ?? [],
    job.payload.favoriteToolCategories ?? [],
  );
}

async function runPushNotificationJob(job: AutomationJob): Promise<number> {
  const title = job.payload.notificationTitle?.trim();
  const message = job.payload.notificationMessage?.trim();
  if (!title || !message) return 0;

  const scope = job.payload.audienceScope;
  const targetRoles = job.payload.targetRoles ?? [];
  const targetUserIds = job.payload.targetUserIds ?? [];
  const targetPhones = job.payload.targetPhones ?? [];
  const targetEmails = (job.payload.targetEmails ?? []).map((e) => e.toLowerCase());
  const hasFavFilter =
    (job.payload.favoriteEventCategories?.length ?? 0) > 0 ||
    (job.payload.favoriteSpotCategories?.length ?? 0) > 0 ||
    (job.payload.favoriteToolCategories?.length ?? 0) > 0;

  const useIndividual =
    scope === 'individual' ||
    targetUserIds.length > 0 ||
    targetPhones.length > 0 ||
    targetEmails.length > 0;
  const useRoles = scope === 'roles' || (scope !== 'individual' && targetRoles.length > 0);

  if (useIndividual || useRoles) {
    const users = await listRegistryUsers();
    let recipients = users.filter(
      (u) => u.role !== 'USER_ANONYMOUS' && userMatchesJobGeo(u, job),
    );

    if (useIndividual) {
      const idSet = new Set(targetUserIds);
      recipients = recipients.filter(
        (u) =>
          idSet.has(u.id) ||
          (targetPhones.length > 0 &&
            u.phoneNumber &&
            targetPhones.some((p) => u.phoneNumber?.includes(p.replace(/\s/g, '')))) ||
          (targetEmails.length > 0 &&
            u.email &&
            targetEmails.includes(u.email.trim().toLowerCase())),
      );
    } else if (useRoles) {
      recipients = recipients.filter((u) => userMatchesTargetRoles(u, targetRoles));
    }

    if (hasFavFilter) {
      recipients = await filterRecipientsByFavorites(recipients, job);
    }

    let count = 0;
    for (const user of recipients) {
      await appendUserNotification(user.id, { title, message, audience: 'individual' });
      count += 1;
    }
    return count;
  }

  const audience = hasFavFilter ? 'favorites' : scope === 'all' ? 'all' : (job.payload.notificationAudience ?? 'members');
  const now = new Date().toISOString();
  const campaignId = Crypto.randomUUID();

  await ensurePushCampaignDraft({
    id: campaignId,
    title,
    message,
    audience,
    targetPhone: null,
    favoriteEventCategories: (job.payload.favoriteEventCategories ?? []) as never[],
    favoriteSpotCategories: (job.payload.favoriteSpotCategories ?? []) as never[],
    favoriteToolCategories: job.payload.favoriteToolCategories ?? [],
    countryCode: job.countryCode,
    scheduledAt: null,
    sentAt: null,
    status: 'draft',
    recipientCount: 0,
    createdAt: now,
  });

  const count = await distributeNotification({
    title,
    message,
    audience,
    favoriteEventCategories: (job.payload.favoriteEventCategories ?? []) as never[],
    favoriteSpotCategories: (job.payload.favoriteSpotCategories ?? []) as never[],
    favoriteToolCategories: job.payload.favoriteToolCategories ?? [],
    countryCode: job.countryCode,
    city: job.city ?? undefined,
    campaignId,
  });

  if (count > 0) {
    await recordSentPushCampaign({
      id: campaignId,
      title,
      message,
      audience,
      countryCode: job.countryCode,
      city: job.city,
      recipientCount: count,
    });
  }

  return count;
}

async function runBenefitGrantJob(job: AutomationJob): Promise<number> {
  if (!jobGrantsBenefits(job)) return 0;

  const grantableAll = await resolveGrantableCatalogForJob(job);
  const catalogIdFilter = job.payload.catalogIds?.length ? new Set(job.payload.catalogIds) : null;
  const grantableBase = catalogIdFilter
    ? grantableAll.filter((g) => catalogIdFilter.has(g.item.id))
    : grantableAll;

  if (grantableBase.length === 0) return 0;

  const users = await listRegistryUsers();
  const targets = await listBenefitGrantRecipientTargets(
    job.payload.grantAudience ?? 'members',
    undefined,
    job.countryCode,
    job.city,
  );

  let total = 0;
  for (const target of targets) {
    const user = users.find((u) => u.id === target.userId);
    const userCity = user?.city ?? null;
    const entries = resolveCityBenefitsForUser(grantableBase, job, {
      countryCode: user?.countryCode ?? job.countryCode,
      city: userCity,
    });
    if (entries.length === 0) continue;

    await grantJobBenefits(
      job,
      {
        phoneNumber: target.phone ?? user?.phoneNumber ?? null,
        countryCode: user?.countryCode ?? job.countryCode,
        city: userCity,
      },
      entries,
    );
    total += entries.length;
  }

  return total;
}

async function runSpotStarsJob(job: AutomationJob, ctx: AutomationRunnerContext): Promise<number> {
  await processDailySpotStarCalculation(job.countryCode, ctx.getHomeLocations());
  return 1;
}

async function executeJob(job: AutomationJob, ctx: AutomationRunnerContext, now = new Date()): Promise<AutomationRunResult> {
  if (['birthday_benefit', 'member_of_month', 'benefit_grant'].includes(job.jobType)) {
    const blocked = await ensureJobCatalogReady(job);
    if (blocked) return blocked;
  }

  let count = 0;
  let summary = 'Aucune action';

  switch (job.jobType) {
    case 'birthday_benefit':
      count = await runBirthdayJob(job, now);
      summary = `${count} anniversaire(s) traité(s)`;
      break;
    case 'birthday_greeting':
      count = await runBirthdayGreetingJob(job, now);
      summary = `${count} vœu(x) anniversaire envoyé(s)`;
      break;
    case 'member_of_month':
      count = await runMemberOfMonthJob(job);
      summary = count > 0 ? 'Membre du mois désigné' : 'Aucun candidat';
      break;
    case 'push_notification':
      count = await runPushNotificationJob(job);
      summary = `${count} notification(s) envoyée(s)`;
      break;
    case 'benefit_grant':
      count = await runBenefitGrantJob(job);
      summary = `${count} avantage(s) octroyé(s)`;
      break;
    case 'spot_stars':
      count = await runSpotStarsJob(job, ctx);
      summary = 'Calcul étoiles exécuté';
      break;
    case 'welcome_benefit':
      return { jobId: job.id, jobName: job.name, count: 0, summary: "Déclenché à l'inscription", skipped: true };
    default:
      summary = 'Type non géré';
  }

  if (count > 0) {
    await recordAutomationJobRun(job.id, count, summary);
  }

  return { jobId: job.id, jobName: job.name, count, summary };
}

export async function runAutomationJobNow(
  jobId: string,
  ctx: AutomationRunnerContext,
  options?: { force?: boolean },
): Promise<AutomationRunResult | null> {
  const job = await getAutomationJob(jobId);
  if (!job || job.status === 'archived') return null;
  if (job.status !== 'active' && !options?.force) return null;
  return executeJob(job, ctx);
}

export async function processActiveAutomationJobs(
  countryCode: string,
  ctx: AutomationRunnerContext,
  now = new Date(),
): Promise<AutomationRunResult[]> {
  const jobs = (await listActiveAutomationJobs(countryCode)).filter((j) => j.jobType !== 'welcome_benefit');
  const results: AutomationRunResult[] = [];

  for (const job of jobs) {
    if (!shouldRunScheduledJob(job, now)) {
      results.push({ jobId: job.id, jobName: job.name, count: 0, summary: 'Déjà exécuté', skipped: true });
      continue;
    }
    results.push(await executeJob(job, ctx, now));
  }

  return results;
}

export async function validateJobBeforeActivation(job: AutomationJob): Promise<string | null> {
  if (job.jobType === 'push_notification') {
    if (!job.payload.notificationTitle?.trim() || !job.payload.notificationMessage?.trim()) {
      return 'Renseignez le titre et le message de la notification.';
    }
  }
  if (job.jobType === 'birthday_greeting') {
    const hasMsg =
      job.payload.notificationMessage?.trim() ||
      job.payload.birthdayTitle?.trim();
    if (!hasMsg) return 'Renseignez au moins un titre ou un message pour les vœux anniversaire.';
  }
  if (job.jobType === 'push_notification' && job.payload.audienceScope === 'individual') {
    const hasTarget =
      (job.payload.targetUserIds?.length ?? 0) > 0 ||
      (job.payload.targetPhones?.length ?? 0) > 0 ||
      (job.payload.targetEmails?.length ?? 0) > 0;
    if (!hasTarget) return 'Sélectionnez au moins un membre, un téléphone ou un e-mail.';
  }
  if (job.jobType === 'push_notification' && job.payload.audienceScope === 'roles') {
    if (!(job.payload.targetRoles?.length ?? 0)) return 'Sélectionnez au moins un rôle.';
  }

  const validation = await validateJobCatalog(job);
  if (!validation.needsBenefits || validation.ok) return null;
  if (validation.inactiveIds.length > 0 || validation.missingIds.length > 0) {
    return 'Les avantages sélectionnés ne sont plus actifs. Choisissez d\'autres avantages avant d\'activer le job.';
  }
  if (validation.unvalidatedPartnerIds.length > 0) {
    return 'Certains avantages ne sont pas validés par leur partenaire. Retirez-les ou attendez la validation.';
  }
  return 'Aucun avantage actif et validé par un partenaire pour ce job.';
}
