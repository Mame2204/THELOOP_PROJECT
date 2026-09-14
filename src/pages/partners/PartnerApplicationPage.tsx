import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PartnerActivityType } from '@/types/partner';
import { PARTNER_ACTIVITY_LABELS } from '@/types/partner';
import { submitPartnershipRequest } from '@/lib/partnership-store';
import { submitPartnershipApplication } from '@/lib/admin-store';
import { isSupabaseConfigured } from '@/lib/supabase';

export function PartnerApplicationPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    companyName: '',
    activityType: 'restaurant' as PartnerActivityType,
    email: '',
    message: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    if (isSupabaseConfigured()) {
      const result = await submitPartnershipRequest(form);
      setSubmitting(false);
      if (!result.ok) {
        setError(result.error ?? 'Envoi impossible. Réessayez.');
        return;
      }
      setSubmitted(true);
      return;
    }

    submitPartnershipApplication({
      ...form,
      contactName: '—',
      phone: '—',
    });
    setSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex min-h-full flex-col justify-center bg-black px-4 py-8 pb-24 text-white">
        <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/40 to-black p-8 text-center shadow-[0_0_40px_rgba(16,185,129,0.12)]">
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-emerald-500/15 blur-3xl" />
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-400/50 bg-emerald-500/10">
            <span className="text-2xl text-emerald-400">✓</span>
          </div>
          <p className="relative mt-5 text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400">
            Demande transmise
          </p>
          <h1 className="relative mt-2 text-xl font-bold text-white">Merci pour votre candidature</h1>
          <p className="relative mt-3 text-sm leading-relaxed text-neutral-400">
            Notre équipe étudie votre profil avec attention. Si votre établissement est retenu,
            vous recevrez votre code partenaire unique par email sous 48h.
          </p>
          <div className="relative mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <p className="text-xs text-emerald-300/90">
              <span className="font-semibold text-emerald-400">{form.companyName}</span>
              {' · '}
              {PARTNER_ACTIVITY_LABELS[form.activityType]}
            </p>
          </div>
          <Link
            to="/profil"
            className="relative mt-6 inline-flex items-center gap-1 text-sm font-bold text-emerald-400 hover:underline"
          >
            ← Retour au profil
          </Link>
        </div>
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-emerald-900/60 bg-black/40 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30';
  const labelClass = 'mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80';

  return (
    <div className="min-h-full bg-black px-4 py-6 pb-24 text-white">
      <Link to="/profil" className="text-xs font-medium text-emerald-400 hover:underline">
        ← Retour au profil
      </Link>

      <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-400">
        Partenariat
      </p>
      <h1 className="mt-1 text-2xl font-bold text-white">Demande de partenariat</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Rejoignez le réseau THE LOOP et proposez vos expériences à notre communauté.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <label className="block">
          <span className={labelClass}>Nom de l&apos;établissement</span>
          <input
            type="text"
            placeholder="Ex. L'Avenue, Hôtel Palm Camayenne…"
            required
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Activité</span>
          <select
            required
            value={form.activityType}
            onChange={(e) => setForm({ ...form, activityType: e.target.value as PartnerActivityType })}
            className={inputClass}
          >
            {(Object.keys(PARTNER_ACTIVITY_LABELS) as PartnerActivityType[]).map((key) => (
              <option key={key} value={key} className="bg-neutral-900">
                {PARTNER_ACTIVITY_LABELS[key]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>Email professionnel</span>
          <input
            type="email"
            placeholder="contact@votre-etablissement.gn"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className={labelClass}>Description</span>
          <textarea
            placeholder="Présentez votre établissement, vos événements prévus et ce que vous souhaitez apporter à THE LOOP…"
            required
            rows={5}
            value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
            className={inputClass}
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(16,185,129,0.25)] transition-colors hover:bg-emerald-500 disabled:opacity-60"
        >
          {submitting ? 'Envoi en cours…' : 'Envoyer ma demande'}
        </button>
        {error && <p className="text-center text-xs text-red-400">{error}</p>}
      </form>
    </div>
  );
}
