import { sendPushCampaign, type NotificationAudience } from './notifications';
import { supabase } from './supabase';

export interface AutomationRunOutcome {
  ok: boolean;
  count?: number;
  summary?: string;
  error?: string;
}

function parsePayload(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

/** Exécution manuelle d’un job (parité mobile — push immédiat côté admin-web). */
export async function runAutomationJobNow(
  jobId: string,
  countryCode: string,
): Promise<AutomationRunOutcome> {
  const { data: job, error } = await supabase
    .from('admin_automation_jobs')
    .select('id, name, job_type, status, country_code, city, payload')
    .eq('id', jobId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!job) return { ok: false, error: 'Job introuvable.' };

  const payload = parsePayload(job.payload);
  const cc = String(job.country_code ?? countryCode);
  const now = new Date().toISOString();

  if (job.job_type === 'push_notification') {
    const title = String(payload.notifTitle ?? payload.title ?? job.name ?? 'THE LOOP').trim();
    const message = String(payload.notifMessage ?? payload.message ?? 'Message THE LOOP').trim();
    const scope = String(payload.audienceScope ?? 'country');
    const audience = (
      scope === 'all' ? 'all' : String(payload.notificationAudience ?? 'members')
    ) as NotificationAudience;

    const res = await sendPushCampaign({
      title,
      message,
      audience,
      countryCode: cc,
      favoriteEventCategories: Array.isArray(payload.favoriteEventCategories)
        ? payload.favoriteEventCategories.map(String)
        : [],
      favoriteSpotCategories: Array.isArray(payload.favoriteSpotCategories)
        ? payload.favoriteSpotCategories.map(String)
        : [],
      favoriteToolCategories: Array.isArray(payload.favoriteToolCategories)
        ? payload.favoriteToolCategories.map(String)
        : [],
    });

    if (!res.ok) {
      return { ok: false, error: res.error ?? 'Push impossible.' };
    }

    const count = res.recipientCount ?? 0;
    const summary = `${count} notification(s) envoyée(s)`;
    await supabase
      .from('admin_automation_jobs')
      .update({
        last_run_at: now,
        last_run_count: count,
        last_run_summary: summary,
        updated_at: now,
      })
      .eq('id', jobId);
    return { ok: true, count, summary };
  }

  if (job.job_type === 'birthday_greeting') {
    const title = String(payload.notifTitle ?? 'Joyeux anniversaire !').trim();
    const message = String(
      payload.notifMessage ?? 'THE LOOP vous souhaite une excellente journée.',
    ).trim();
    const res = await sendPushCampaign({
      title,
      message,
      audience: 'birthday',
      countryCode: cc,
    });
    if (!res.ok) return { ok: false, error: res.error };
    const count = res.recipientCount ?? 0;
    const summary = `${count} vœu(x) anniversaire`;
    await supabase
      .from('admin_automation_jobs')
      .update({
        last_run_at: now,
        last_run_count: count,
        last_run_summary: summary,
        updated_at: now,
      })
      .eq('id', jobId);
    return { ok: true, count, summary };
  }

  return {
    ok: false,
    error: `Type « ${job.job_type} » : exécuter depuis l’app mobile Control Tower.`,
  };
}
