import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import type { PrimePlan } from '@/types/prime';
import { findPendingPrimeInvitation } from '@/lib/admin-store';
import { useAuth } from '@/hooks/useAuth';

type Step = 'verify' | 'profile' | 'security' | 'welcome' | 'payment';

const DEMO_OTP = '1234';

export function LoopPrimeActivationPage() {
  const [params] = useSearchParams();
  const token = params.get('token')?.trim().toUpperCase() ?? '';
  const navigate = useNavigate();
  const { activatePrimeMembership } = useAuth();

  const invitation = token ? findPendingPrimeInvitation(token) : undefined;

  const [step, setStep] = useState<Step>('verify');
  const [verified, setVerified] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpNotice, setOtpNotice] = useState(false);
  const [password, setPassword] = useState('');
  const [plan, setPlan] = useState<PrimePlan>('yearly');
  const [confirming, setConfirming] = useState(false);
  const [profile, setProfile] = useState({
    firstName: invitation?.memberName.split(' ')[0] ?? '',
    lastName: invitation?.memberName.split(' ').slice(1).join(' ') ?? '',
    jobTitle: '',
    company: '',
    sector: '',
    phone: '',
    email: invitation?.email ?? '',
  });

  useEffect(() => {
    if (!invitation) return;
    const timer = setTimeout(() => {
      setVerified(true);
      setStep('profile');
    }, 2200);
    return () => clearTimeout(timer);
  }, [invitation]);

  if (!token || !invitation) {
    return <Navigate to="/" replace />;
  }

  async function finishActivation() {
    setConfirming(true);
    try {
      await activatePrimeMembership(
        {
          ...profile,
          password,
          email: profile.email || `${profile.firstName.toLowerCase()}@theloop.gn`,
        },
        token,
        plan,
      );
      navigate('/abonnement');
    } catch (err) {
      console.error('[Prime] Activation :', err);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="min-h-dvh bg-black text-white safe-top safe-bottom">
      <div className="mx-auto max-w-lg px-4 py-8">
        <p className="text-center text-[10px] font-semibold uppercase tracking-[0.35em] text-loop-gold">Loop Prime</p>
        <h1 className="mt-2 text-center text-2xl font-bold">Activation Loop Prime</h1>
        <p className="mt-1 text-center text-sm text-neutral-400">Invitation {token}</p>

        {step === 'verify' && (
          <div className="mt-16 flex flex-col items-center">
            <div className={`h-28 w-44 rounded-2xl border-2 border-loop-gold/60 bg-gradient-to-br from-neutral-900 to-black p-4 shadow-[0_0_40px_rgba(201,168,76,0.25)] ${verified ? '' : 'animate-pulse'}`}>
              <p className="text-[10px] uppercase tracking-widest text-loop-gold">THE LOOP</p>
              <p className="mt-6 text-xs text-neutral-400">Carte Loop Prime</p>
              <p className="mt-1 font-mono text-sm text-white">{invitation.memberName}</p>
            </div>
            <p className="mt-8 text-sm text-neutral-300">
              {verified ? 'Invitation authentifiée ✓' : 'Vérification de votre invitation en cours…'}
            </p>
          </div>
        )}

        {step === 'profile' && (
          <form
            className="mt-8 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setStep('security');
              setOtpNotice(true);
            }}
          >
            <h2 className="text-sm font-bold text-loop-gold">Étape 1 · Données de réseautage</h2>
            <div className="grid grid-cols-2 gap-2">
              <input required placeholder="Prénom" value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm" />
              <input required placeholder="Nom" value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm" />
            </div>
            <input required placeholder="Poste actuel" value={profile.jobTitle} onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })} className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm" />
            <input required placeholder="Entreprise" value={profile.company} onChange={(e) => setProfile({ ...profile, company: e.target.value })} className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm" />
            <input required placeholder="Secteur d'activité" value={profile.sector} onChange={(e) => setProfile({ ...profile, sector: e.target.value })} className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm" />
            <input required placeholder="Téléphone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm" />
            <input type="email" placeholder="Email pro" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm" />
            <button type="submit" className="touch-press w-full rounded-xl bg-loop-gold py-3 text-sm font-bold text-black">Continuer</button>
          </form>
        )}

        {step === 'security' && (
          <form
            className="mt-8 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (otp !== DEMO_OTP) return;
              setStep('welcome');
            }}
          >
            <h2 className="text-sm font-bold text-loop-gold">Étape 2 · Sécurité</h2>
            {otpNotice && (
              <p className="rounded-xl border border-loop-gold/30 bg-loop-gold/10 px-3 py-2 text-xs text-loop-gold">
                Code SMS de démonstration : <strong>{DEMO_OTP}</strong>
              </p>
            )}
            <input required placeholder="Code OTP SMS" value={otp} onChange={(e) => setOtp(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm tracking-widest" />
            <input required type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm" />
            <button type="submit" className="touch-press w-full rounded-xl bg-loop-gold py-3 text-sm font-bold text-black">Valider</button>
          </form>
        )}

        {step === 'welcome' && (
          <div className="mt-12 text-center">
            <h2 className="text-xl font-bold text-loop-gold">Bienvenue dans Loop Prime, {profile.firstName}.</h2>
            <p className="mt-3 text-neutral-300">Votre profil est prêt. Choisissez votre forfait.</p>
            <button type="button" onClick={() => setStep('payment')} className="touch-press mt-8 w-full rounded-xl bg-loop-gold py-3 text-sm font-bold text-black">
              Choisir mon forfait
            </button>
          </div>
        )}

        {step === 'payment' && (
          <div className="mt-8 space-y-4">
            <h2 className="text-sm font-bold text-loop-gold">Étape 3 · Forfait</h2>
            <p className="text-xs text-neutral-400">
              Sélectionnez votre formule puis confirmez. Le paiement réel sera intégré ultérieurement.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(['monthly', 'yearly'] as PrimePlan[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPlan(item)}
                  className={`touch-press rounded-xl border px-3 py-3 text-left text-sm ${plan === item ? 'border-loop-gold bg-loop-gold/10' : 'border-neutral-700'}`}
                >
                  <p className="font-bold">{item === 'monthly' ? 'Mensuel' : 'Annuel'}</p>
                  <p className="text-xs text-neutral-400">{item === 'monthly' ? '850 000 GNF / mois' : '8 500 000 GNF / an'}</p>
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={confirming}
              onClick={() => void finishActivation()}
              className="touch-press w-full rounded-xl bg-loop-gold py-4 text-sm font-bold text-black shadow-[0_0_24px_rgba(201,168,76,0.3)] disabled:opacity-50"
            >
              {confirming ? 'Activation…' : 'Confirmer mon abonnement Loop Prime'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
