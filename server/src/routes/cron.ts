import { Router } from 'express';
import { getSupabaseAdmin } from '../lib/supabase-admin.js';
import { requireCronSecret } from '../middleware/require-cron-secret.js';
import { runScheduledPushCampaigns } from '../services/cron-runner.js';
import { runStuckPaymentReconciliation } from '../services/payment-reconcile-cron.js';
import { runPassExpiry } from '../services/pass-expiry-cron.js';

export const cronRouter = Router();

/** Déclenchement externe (Render Cron, cron-job.org, etc.). */
cronRouter.post('/internal/cron', requireCronSecret, async (_req, res) => {
  try {
    const supabase = getSupabaseAdmin();
    const push = await runScheduledPushCampaigns(supabase);
    const payments = await runStuckPaymentReconciliation(supabase);
    const passes = await runPassExpiry(supabase);

    res.json({
      ok: true,
      at: new Date().toISOString(),
      push,
      payments,
      passes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur cron.';
    console.error('[cron]', message);
    res.status(500).json({ ok: false, error: message });
  }
});
