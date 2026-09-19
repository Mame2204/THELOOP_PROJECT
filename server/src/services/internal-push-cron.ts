import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { config } from '../config.js';
import { runScheduledPushCampaigns } from './cron-runner.js';
import { runStuckPaymentReconciliation } from './payment-reconcile-cron.js';
import { runPassExpiry } from './pass-expiry-cron.js';

let started = false;

/** Planificateur in-process : push planifiés sans cron HTTP externe. */
export function startInternalPushCron(): void {
  if (started || !config.internalPushCronEnabled) return;
  started = true;

  const intervalMs = config.pushCronIntervalMinutes * 60 * 1000;

  const tick = async (): Promise<void> => {
    try {
      const supabase = getSupabaseAdmin();
      const push = await runScheduledPushCampaigns(supabase);
      const payments = await runStuckPaymentReconciliation(supabase);
      const passes = await runPassExpiry(supabase);
      if (
        push.pushCampaignsSent > 0 ||
        push.errors.length > 0 ||
        payments.reconciled > 0 ||
        payments.errors.length > 0 ||
        passes.expiredGrants > 0 ||
        passes.activatedGrants > 0 ||
        passes.demotedUsers > 0 ||
        passes.errors.length > 0
      ) {
        console.log('[cron]', JSON.stringify({ push, payments, passes }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[push-cron]', message);
    }
  };

  // Premier passage après 1 min (laisse le serveur finir son boot Render).
  setTimeout(() => void tick(), 60_000);
  setInterval(() => void tick(), intervalMs);

  console.log(
    `[push-cron] Planificateur interne actif — toutes les ${config.pushCronIntervalMinutes} min`,
  );
}
