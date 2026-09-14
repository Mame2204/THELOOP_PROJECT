import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { DEMO_FREE_USER } from '@/lib/demo-auth';
import { DEV_MEMBER_PASSWORD } from '@/lib/otp-auth';
import {
  accountCountryHint,
  isEmailVerificationRequiredError,
  validateSignupEmail,
  validateSignupPassword,
} from '@/lib/email-auth';
import { DEFAULT_COUNTRY_CODE, getCountryLabel, type CountryCode } from '@/lib/countries';
import { CountrySelectField } from '@/components/shared/CountryFields';
import { TEST_ACCOUNTS } from '@/lib/test-accounts';

interface AuthModalProps {
  onClose: () => void;
}

type AuthMode = 'signup' | 'login';

const inputClass =
  'w-full rounded-xl border border-loop-public-border bg-loop-public-bg px-4 py-3 text-sm text-loop-public-text outline-none focus:border-loop-black';

function formatAuthError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const o = err as { message?: string; details?: string; hint?: string };
    const parts = [o.message, o.details, o.hint].filter(
      (part): part is string => typeof part === 'string' && part.length > 0,
    );
    if (parts.length > 0) return parts.join(' — ');
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function AuthErrorAlert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-600"
    >
      {message}
    </div>
  );
}

export function AuthModal({ onClose }: AuthModalProps) {
  const { signUpMember, signIn, signInDemo } = useAuth();
  const useSupabase = isSupabaseConfigured();

  const [mode, setMode] = useState<AuthMode>('signup');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState<CountryCode>(DEFAULT_COUNTRY_CODE);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [websiteHoneypot, setWebsiteHoneypot] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTests, setShowTests] = useState(false);

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setLoginPassword('');
    setPassword('');
    setConfirmPassword('');
  }

  function handleClose() {
    onClose();
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const emailCheck = validateSignupEmail(loginEmail);
    if (!emailCheck.ok) {
      setError(emailCheck.message);
      return;
    }
    if (!loginPassword) {
      setError('Mot de passe requis.');
      return;
    }
    setLoading(true);
    try {
      await signIn(emailCheck.email, loginPassword);
      handleClose();
    } catch (err) {
      setError(formatAuthError(err, 'Connexion impossible'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const emailCheck = validateSignupEmail(email);
    if (!emailCheck.ok) {
      setError(emailCheck.message);
      return;
    }
    const pwdError = validateSignupPassword(password, confirmPassword);
    if (pwdError) {
      setError(pwdError);
      return;
    }

    setLoading(true);
    try {
      await signUpMember({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: emailCheck.email,
        countryCode,
        password,
        website: websiteHoneypot,
      });
      handleClose();
    } catch (err) {
      if (isEmailVerificationRequiredError(err)) {
        setInfo('Un e-mail de confirmation vient de vous être envoyé. Ouvrez le lien pour activer votre compte.');
      } else {
        console.error('Erreur Inscription:', err);
        setError(formatAuthError(err, 'Impossible de créer le compte. Veuillez réessayer.'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleTestLogin(testEmail: string) {
    setLoginEmail(testEmail);
    setLoginPassword(DEV_MEMBER_PASSWORD);
    setError(null);
    setLoading(true);
    try {
      await signIn(testEmail, DEV_MEMBER_PASSWORD);
      handleClose();
    } catch (err) {
      setError(formatAuthError(err, 'Compte test introuvable — inscrivez-vous d\'abord via l\'app.'));
    } finally {
      setLoading(false);
    }
  }

  const title = mode === 'signup' ? 'Créer mon compte' : 'Se connecter';

  const subtitle =
    mode === 'signup'
      ? 'E-mail et mot de passe — confirmation par e-mail'
      : 'E-mail et mot de passe';

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-loop-public-border bg-loop-public-surface p-6 shadow-2xl transition-all duration-300"
        role="dialog"
        aria-labelledby="auth-modal-title"
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-6 top-6 text-loop-public-muted hover:text-loop-public-text"
          aria-label="Fermer"
        >
          ✕
        </button>

        <div className="mb-6 text-center">
          <p className="mb-1 text-xs uppercase tracking-widest text-loop-gold">THE LOOP</p>
          <h2 id="auth-modal-title" className="text-lg font-bold text-loop-public-text">
            {title}
          </h2>
          <p className="mt-2 text-sm text-loop-public-muted">{subtitle}</p>
        </div>

        {useSupabase && mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="first_name" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-loop-public-muted">
                  Prénom
                </label>
                <input
                  id="first_name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  autoComplete="given-name"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="last_name" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-loop-public-muted">
                  Nom
                </label>
                <input
                  id="last_name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  autoComplete="family-name"
                  className={inputClass}
                />
              </div>
            </div>

            <CountrySelectField
              value={countryCode}
              onChange={setCountryCode}
              label="Pays du compte"
            />
            <p className="text-xs text-loop-public-muted">{accountCountryHint(getCountryLabel(countryCode))}</p>

            <div>
              <label htmlFor="email" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-loop-public-muted">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
              />
            </div>

            <input
              type="text"
              value={websiteHoneypot}
              onChange={(e) => setWebsiteHoneypot(e.target.value)}
              autoComplete="off"
              tabIndex={-1}
              aria-hidden
              className="hidden"
            />

            <div>
              <label htmlFor="password" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-loop-public-muted">
                Mot de passe
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="confirm_password" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-loop-public-muted">
                Confirmer le mot de passe
              </label>
              <input
                id="confirm_password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className={inputClass}
              />
            </div>

            <p className="text-xs text-loop-public-muted">
              Un e-mail de confirmation peut être requis avant la première connexion.
            </p>

            {info && (
              <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {info}
              </div>
            )}

            {error && <AuthErrorAlert message={error} />}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-loop-black py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Création en cours…' : 'Créer mon compte'}
            </button>
          </form>
        )}

        {useSupabase && mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label htmlFor="login_email" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-loop-public-muted">
                E-mail
              </label>
              <input
                id="login_email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="login_password" className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-loop-public-muted">
                Mot de passe
              </label>
              <input
                id="login_password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
                autoComplete="current-password"
                className={inputClass}
              />
            </div>

            {error && <AuthErrorAlert message={error} />}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-loop-black py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        )}

        {useSupabase && (
          <>
            <p className="mt-4 text-center text-sm text-loop-public-muted">
              {mode === 'signup' ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'signup' ? 'login' : 'signup')}
                className="text-loop-gold underline-offset-2 hover:underline"
              >
                {mode === 'signup' ? 'Se connecter' : 'Créer un compte'}
              </button>
            </p>

            <div className="mt-4 border-t border-loop-public-border pt-4">
              <button
                type="button"
                onClick={() => setShowTests((v) => !v)}
                className="w-full text-xs font-semibold uppercase tracking-wide text-loop-public-muted hover:text-loop-public-text"
              >
                {showTests ? 'Masquer' : 'Afficher'} les comptes test
              </button>
              {showTests && (
                <div className="mt-3 space-y-2">
                  {TEST_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => void handleTestLogin(account.email)}
                      disabled={loading}
                      className="w-full rounded-xl border border-loop-public-border px-3 py-2 text-left text-xs transition-colors hover:border-loop-gold disabled:opacity-50"
                    >
                      <span className="font-semibold text-loop-public-text">{account.label}</span>
                      <span className="block text-loop-public-muted">{account.email}</span>
                    </button>
                  ))}
                  <p className="text-[10px] text-loop-public-muted">
                    Mot de passe test : {DEV_MEMBER_PASSWORD}
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {!useSupabase && (
          <div className="space-y-4">
            <p className="text-center text-sm text-loop-public-muted">
              Mode démo local — Supabase non configuré.
            </p>
            <button
              type="button"
              onClick={async () => {
                await signInDemo();
                handleClose();
              }}
              className="w-full rounded-xl border border-loop-gold bg-loop-gold/10 py-2.5 text-xs font-bold text-loop-black"
            >
              Connexion démo — {DEMO_FREE_USER.fullName}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
