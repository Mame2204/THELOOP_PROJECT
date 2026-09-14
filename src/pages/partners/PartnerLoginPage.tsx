import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function PartnerLoginPage() {
  const { signInWithPartnerToken } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const success = await signInWithPartnerToken(code.trim().toUpperCase());
    setLoading(false);

    if (success) {
      navigate('/espace-partenaire');
    } else {
      setError('Code Partenaire invalide ou expiré. Vérifiez votre carte ou contactez THE LOOP.');
    }
  }

  return (
    <div className="min-h-full bg-black px-4 pb-24 pt-6 text-white">
      <Link to="/profil" className="text-xs font-medium text-emerald-400 hover:underline">
        ← Retour au profil
      </Link>

      <div className="mx-auto mt-8 w-full max-w-sm">
        <p className="text-center text-[10px] font-bold uppercase tracking-[0.3em] text-emerald-400">
          Espace Partenaire
        </p>
        <h1 className="mt-2 text-center text-xl font-bold">Connexion Pro</h1>
        <p className="mt-2 text-center text-sm text-neutral-400">
          Déjà partenaire ? Saisissez le code figurant sur votre Carte Partenaire THE LOOP.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-emerald-400/80">
              Code Partenaire
            </span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="SPOT-XXXX-2026"
              required
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-xl border border-emerald-900/60 bg-black/40 px-4 py-3 text-center font-mono text-sm uppercase tracking-widest text-white outline-none focus:border-emerald-500/60"
            />
          </label>
          {error && <p className="text-center text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-[0_0_20px_rgba(16,185,129,0.2)] disabled:opacity-50"
          >
            {loading ? 'Vérification…' : 'Accéder à mon espace Pro'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-neutral-500">
          Démo : <code className="text-emerald-400">SPOT-DEMO-2026</code>
        </p>

        <div className="mt-8 rounded-2xl border border-emerald-500/25 bg-emerald-950/30 p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            Pas encore partenaire ?
          </p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            L&apos;abonnement Loop Prime est réservé aux membres. Le partenariat concerne les établissements
            (restaurants, hôtels, organisateurs…).
          </p>
          <Link
            to="/partenaires/demande"
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-3 text-sm font-bold text-emerald-400"
          >
            Faire une demande de partenariat
          </Link>
        </div>
      </div>
    </div>
  );
}
