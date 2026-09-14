import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMemberGrade } from '@/hooks/useMemberGrade';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getCountryLabel } from '@/lib/countries';
import { DEMO_FREE_USER } from '@/lib/demo-auth';
import { MemberQrCard } from '@/components/public/MemberQrCard';
import { DevGradeThemeSelect } from '@/components/public/DevGradeThemeSelect';

export function MemberProfilePanel() {
  const { user, role, signOut, signInDemo, toggleDemoAuth, updateProfile } = useAuth();
  const { theme, sessionGrade, devOverride, setDevOverride } = useMemberGrade();
  const { profile } = theme;
  const isDemo = !isSupabaseConfigured();
  const isPartnerSession = role === 'PARTNER';
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    email: user?.email ?? '',
    phone: user?.phoneNumber ?? '',
  });

  const inputClass = `mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${profile.formInput}`;
  const labelClass = `text-[10px] font-semibold uppercase tracking-wider ${profile.formLabel}`;

  useEffect(() => {
    setForm({
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      phone: user?.phoneNumber ?? '',
    });
  }, [user]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateProfile({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
      });
      setEditing(false);
      setSaved(true);
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err
        ? String((err as { message: string }).message)
        : 'Impossible de mettre à jour le profil.';
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <MemberQrCard
        theme={theme}
        firstName={user?.firstName}
        lastName={user?.lastName}
        email={user?.email}
        phoneNumber={user?.phoneNumber}
        qrCodeToken={user?.qrCodeToken}
      />

      {user?.countryCode ? (
        <div className={`rounded-2xl border px-5 py-4 ${profile.panelBorder} ${profile.panelBg}`}>
          <p className={labelClass}>Pays du compte</p>
          <p className={`mt-1 text-sm font-semibold ${profile.panelTitle}`}>{getCountryLabel(user.countryCode)}</p>
        </div>
      ) : null}

      <div className={`overflow-hidden rounded-2xl border shadow-sm ${profile.panelBorder} ${profile.panelBg}`}>
        {editing ? (
          <form
            className={`space-y-3 p-5 ${profile.formBg}`}
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <p className={`text-xs ${profile.formLabel}`}>Modifier vos informations</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={labelClass}>Prénom</span>
                <input
                  type="text"
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  autoComplete="given-name"
                  className={inputClass}
                />
              </label>
              <label className="block">
                <span className={labelClass}>Nom</span>
                <input
                  type="text"
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  autoComplete="family-name"
                  className={inputClass}
                />
              </label>
            </div>
            <label className="block">
              <span className={labelClass}>Email</span>
              <input
                type="email"
                readOnly
                value={form.email}
                className={`${inputClass} cursor-not-allowed opacity-70`}
              />
              <span className={`mt-1 block text-[10px] ${profile.formLabel}`}>
                L&apos;email ne peut pas être modifié ici.
              </span>
            </label>
            <label className="block">
              <span className={labelClass}>Téléphone</span>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                autoComplete="tel"
                className={inputClass}
              />
            </label>
            {isPartnerSession && (
              <>
                <p className={`text-xs ${profile.detailsLabel}`}>
                  Entreprise : {user?.company ?? '—'}
                </p>
                <p className={`text-xs ${profile.detailsLabel}`}>
                  Fonction : {user?.jobTitle ?? '—'}
                </p>
              </>
            )}
            {error && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                className="rounded-xl border border-neutral-400 py-2.5 text-sm font-semibold opacity-80"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-loop-black py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-4">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={`w-full rounded-xl border py-2.5 text-sm font-bold ${profile.editButton}`}
            >
              Modifier mon profil
            </button>
          </div>
        )}
      </div>

      {saved && (
        <p className="rounded-xl bg-green-50 px-4 py-3 text-center text-sm font-medium text-green-700">
          Profil mis à jour avec succès.
        </p>
      )}

      {isDemo && !isPartnerSession && (
        <div className="rounded-xl border border-dashed border-loop-gold/50 bg-loop-gold/5 p-4">
          <p className="text-xs font-semibold text-loop-black">Mode démo (test)</p>
          <button
            type="button"
            onClick={() => void toggleDemoAuth()}
            className="mt-3 w-full rounded-xl border border-loop-gold bg-white py-2.5 text-xs font-bold text-loop-black"
          >
            {role === 'USER_ANONYMOUS' ? 'Simuler connexion membre' : 'Simuler déconnexion'}
          </button>
          {role === 'USER_ANONYMOUS' && (
            <button
              type="button"
              onClick={() => void signInDemo()}
              className="mt-2 w-full rounded-xl bg-loop-black py-2.5 text-xs font-bold text-white"
            >
              Connexion rapide ({DEMO_FREE_USER.fullName})
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => void signOut()}
        className="w-full rounded-xl border-2 border-red-500 bg-red-50 py-4 text-sm font-bold text-red-600 transition-colors hover:bg-red-100"
      >
        Se déconnecter
      </button>

      <DevGradeThemeSelect
        value={devOverride}
        sessionGrade={sessionGrade}
        onChange={setDevOverride}
      />
    </div>
  );
}
