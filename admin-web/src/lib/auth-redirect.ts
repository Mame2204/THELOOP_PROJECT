/** Pont HTTPS → deep link theloop:// (mot de passe dans l'app mobile). */
const DEFAULT_AUTH_CALLBACK_URL = 'https://admin.theloop-app.com/auth-callback.html';

/** URL de redirection Supabase pour e-mails membres (invite, reset). */
export function getMemberAuthRedirectUrl(): string {
  const override = import.meta.env.VITE_AUTH_REDIRECT_URL as string | undefined;
  if (override?.trim()) return override.trim();
  return DEFAULT_AUTH_CALLBACK_URL;
}
