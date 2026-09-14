/** Erreurs d'envoi e-mail Supabase / garde-fous THE LOOP — messages en français. */

export class AuthEmailRateLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = 'AuthEmailRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function formatRetryDuration(seconds: number): string {
  const safe = Math.max(1, Math.ceil(seconds));
  if (safe >= 3600) {
    const hours = Math.floor(safe / 3600);
    const minutes = Math.ceil((safe % 3600) / 60);
    if (minutes > 0 && hours > 0) return `${hours} h ${minutes} min`;
    if (hours > 0) return hours === 1 ? '1 heure' : `${hours} heures`;
  }
  if (safe >= 60) {
    const minutes = Math.ceil(safe / 60);
    return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  }
  return safe === 1 ? '1 seconde' : `${safe} secondes`;
}

export function formatResendCooldown(seconds: number): string {
  if (seconds <= 0) return '';
  if (seconds >= 3600) return formatRetryDuration(seconds);
  if (seconds >= 60) return formatRetryDuration(seconds);
  return `${seconds}s`;
}

function extractSecondsFromMessage(message: string): number | null {
  const patterns = [
    /(\d+)\s*seconds?/i,
    /every\s+(\d+)\s*seconds?/i,
    /after\s+(\d+)\s*seconds?/i,
    /(\d+)\s*secondes?/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const value = parseInt(match[1], 10);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return null;
}

/** Transforme les erreurs Supabase / RPC en message THE LOOP + délai avant réessai. */
export function parseAuthEmailRateLimit(err: unknown): AuthEmailRateLimitError | null {
  const authErr = err as { message?: string; status?: number; code?: string } | null;
  const msg = err instanceof Error ? err.message : String(authErr?.message ?? err ?? '');
  const lower = msg.toLowerCase();
  const status = authErr?.status;
  const code = (authErr?.code ?? '').toLowerCase();

  if (msg.includes('signup_rate_limited')) {
    return new AuthEmailRateLimitError(
      'Limite THE LOOP atteinte : trop de tentatives d\'inscription pour cet e-mail. Réessayez dans 1 heure.',
      3600,
    );
  }

  const isSupabaseRateLimit =
    status === 429
    || code.includes('over_email_send_rate_limit')
    || code.includes('429')
    || lower.includes('rate limit')
    || lower.includes('too many requests')
    || lower.includes('email rate')
    || lower.includes('security purposes')
    || lower.includes('over_email_send_rate_limit');

  if (!isSupabaseRateLimit) return null;

  const seconds = extractSecondsFromMessage(msg) ?? 60;
  return new AuthEmailRateLimitError(
    `Limite d'envoi e-mail du projet atteinte (partagée entre tous les utilisateurs en env. de test sans SMTP custom). Réessayez dans ${formatRetryDuration(seconds)}.`,
    seconds,
  );
}

export function resolveAuthEmailErrorMessage(err: unknown, fallback: string): string {
  const rateLimit = parseAuthEmailRateLimit(err);
  if (rateLimit) return rateLimit.message;
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

export function getRetryAfterSeconds(err: unknown): number | null {
  const rateLimit = parseAuthEmailRateLimit(err);
  return rateLimit?.retryAfterSeconds ?? null;
}
