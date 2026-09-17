/** Page HTTPS Supabase — mot de passe dans le navigateur (sans app installée). */
const DEFAULT_AUTH_CALLBACK_URL =
  'https://eeyhtulpixvftvhppinz.supabase.co/functions/v1/auth-callback';

/** URL de redirection Supabase pour e-mails membres (invite, reset). */
export function getMemberAuthRedirectUrl(): string {
  const override = import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined;
  if (override?.trim()) return override.trim();
  return DEFAULT_AUTH_CALLBACK_URL;
}
