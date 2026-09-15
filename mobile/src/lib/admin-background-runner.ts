import { processActiveAutomationJobs } from '@/lib/admin-automation-runner';
import { processDueScheduledNotifications } from '@/lib/admin-notifications-store';
import { processDueScheduledBenefitGrants } from '@/lib/prime-benefits-store';
import type { HomeLocation } from '@/lib/demo-data';

let lastRunAt = 0;
const MIN_INTERVAL_MS = 45_000;

/** Jobs planifiés (automatisations, push, octrois) — exécution légère côté admin mobile. */
export async function runAdminBackgroundJobs(
  countryCode: string,
  getHomeLocations: () => HomeLocation[],
): Promise<void> {
  const now = Date.now();
  if (now - lastRunAt < MIN_INTERVAL_MS) return;
  lastRunAt = now;

  try {
    await processActiveAutomationJobs(countryCode, { getHomeLocations });
    await processDueScheduledNotifications();
    await processDueScheduledBenefitGrants();
  } catch (err) {
    console.warn('[admin-runner]', err instanceof Error ? err.message : err);
  }
}
