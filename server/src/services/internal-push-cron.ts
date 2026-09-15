import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { config } from '../config.js';
import { runScheduledPushCampaigns } from './cron-runner.js';

let started = false;

/** Planificateur in-process : push planifiés sans cron HTTP externe. */
export function startInternalPushCron(): void {
  if (started || !config.internalPushCronEnabled) return;
  started = true;

  const intervalMs = config.pushCronIntervalMinutes * 60 * 1000;

  const tick = async (): Promise<void> => {
    try {
      const result = await runScheduledPushCampaigns(getSupabaseAdmin());
      if (result.pushCampaignsSent > 0 || result.errors.length > 0) {
        console.log('[push-cron]', JSON.stringify(result));
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
