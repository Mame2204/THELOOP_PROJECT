/** URL de redirection Supabase pour e-mails membres (invite, reset). */
export function getMemberAuthRedirectUrl(): string {
  const override = import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined;
  if (override?.trim()) return override.trim();

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
  if (supabaseUrl) {
    return `${supabaseUrl}/functions/v1/auth-callback`;
  }

  return 'theloop://auth/callback';
}
