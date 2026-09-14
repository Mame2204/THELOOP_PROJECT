import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { LoopLogo } from '@/components/shared/LoopLogo';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase';

export function AdminLoginPage() {
  const { role, signIn, signInDemoAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@theloop.gn');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isDemo = !isSupabaseConfigured();

  if (!isLoading && role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }

  async function handleDemoLogin() {
    setError(null);
    setLoading(true);
    await signInDemoAdmin();
    setLoading(false);
    navigate('/admin');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center bg-[#FAFAFA] px-4 safe-top safe-bottom">
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center">
          <LoopLogo variant="dark" size="md" />
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.3em] text-loop-gold">
            Console Admin
          </p>
        </div>

        <h1 className="mt-4 text-center text-xl font-bold text-loop-black">Connexion Administrateur</h1>
        <p className="mt-2 text-center text-sm text-neutral-600">
          Accès réservé à l&apos;équipe THE LOOP pour la modération et la gestion de la plateforme.
        </p>

        {isDemo ? (
          <div className="mt-8 space-y-4">
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleDemoLogin()}
              className="w-full rounded-xl bg-loop-black py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? 'Connexion…' : 'Accéder à la console (mode démo)'}
            </button>
            <p className="text-center text-xs text-neutral-500">
              Mode démo : session admin{' '}
              <code className="font-mono text-loop-gold">admin@theloop.gn</code>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Email administrateur
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-xl border border-neutral-300 bg-[#FAFAFA] px-4 py-3 text-sm text-loop-black outline-none focus:border-loop-black"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Mot de passe
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-xl border border-neutral-300 bg-[#FAFAFA] px-4 py-3 text-sm text-loop-black outline-none focus:border-loop-black"
              />
            </label>
            {error && <p className="text-center text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-loop-black py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? 'Connexion…' : 'Accéder à la console'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center">
          <Link to="/" className="text-xs font-medium text-neutral-500 underline-offset-2 hover:text-loop-black hover:underline">
            Retour à l&apos;accueil
          </Link>
        </p>
      </div>
    </div>
  );
}
