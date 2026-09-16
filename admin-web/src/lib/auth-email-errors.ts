/** Erreurs d'envoi e-mail Supabase — messages en français (admin-web). */

export function formatRetryDuration(seconds: number): string {
  const safe = Math.max(1, Math.ceil(seconds));
  if (safe >= 60) {
    const minutes = Math.ceil(safe / 60);
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  return safe === 1 ? '1 seconde' : `${safe} secondes`;
}

export function parseInviteEmailError(body: {
  error?: string;
  retry_after_seconds?: number | null;
}): { message: string; retryAfterSeconds?: number } {
  const retry = body.retry_after_seconds;
  if (typeof retry === 'number' && retry > 0) {
    return {
      message:
        body.error?.trim()
        || `Un e-mail vient d'être envoyé. Réessayez dans ${formatRetryDuration(retry)}.`,
      retryAfterSeconds: retry,
    };
  }

  const raw = body.error?.trim() ?? '';
  if (!raw) return { message: 'Envoi impossible.' };

  const lower = raw.toLowerCase();
  if (
    lower.includes('over_email_send_rate_limit')
    || lower.includes('security purposes')
    || lower.includes('rate limit')
  ) {
    const match = raw.match(/(\d+)\s*seconds?/i);
    const seconds = match?.[1] ? parseInt(match[1], 10) : 10;
    return {
      message: `Un e-mail vient d'être envoyé. Réessayez dans ${formatRetryDuration(seconds)}.`,
      retryAfterSeconds: Number.isFinite(seconds) ? seconds : 10,
    };
  }

  return { message: raw };
}
