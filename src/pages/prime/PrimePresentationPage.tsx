import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PublicHeader } from '@/components/public/PublicHeader';
import { useAuth } from '@/hooks/useAuth';
import { useFavorites } from '@/hooks/useFavorites';
import { isPrimeMember } from '@/types';

const PRIME_BENEFITS = [
  {
    icon: '◆',
    title: 'Accès LoopX exclusif',
    description: 'Événements et adresses réservés aux membres Prime, visibles sur l\'agenda et les Spots.',
  },
  {
    icon: '🏛️',
    title: 'Spots exclusifs LoopX',
    description: 'Adresses et expériences réservées aux membres Prime, visibles dans l\'onglet Spots.',
  },
  {
    icon: '✦',
    title: 'Thème doré premium',
    description: 'Interface sombre et accents or sur toute l\'application — statut immédiatement reconnaissable.',
  },
  {
    icon: '♥',
    title: 'Favoris illimités',
    description: 'Sauvegardez vos événements et adresses préférés, accessibles depuis votre espace membre.',
  },
  {
    icon: '🎫',
    title: 'Invitations prioritaires',
    description: 'Accès anticipé aux soirées, lancements et expériences partenaires.',
  },
];

export function PrimePresentationPage() {
  const { role, simulatePrimeUpgrade } = useAuth();
  const { openAuthModal } = useFavorites();
  const navigate = useNavigate();
  const [upgrading, setUpgrading] = useState(false);
  const [upgraded, setUpgraded] = useState(false);
  const isPrime = isPrimeMember(role);

  async function handleBecomePrime() {
    if (role === 'USER_ANONYMOUS') {
      openAuthModal();
      return;
    }
    if (isPrime) {
      navigate('/abonnement');
      return;
    }

    setUpgrading(true);
    try {
      await simulatePrimeUpgrade();
      setUpgraded(true);
    } catch (err) {
      console.error('[Prime] Simulation upgrade :', err);
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <div className="min-h-full bg-black pb-4 text-white">
      <PublicHeader />

      <div className="px-4 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-loop-gold">Loop Prime</p>
        <h1 className="mt-1 text-2xl font-bold leading-tight">
          L&apos;expérience
          <span className="block text-loop-gold">haut de gamme</span>
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          Rejoignez le cercle Prime et débloquez l&apos;univers exclusif THE LOOP — LoopX, thème doré et favoris illimités.
        </p>

        <div className="relative mt-6 overflow-hidden rounded-2xl border border-loop-gold/40 bg-gradient-to-br from-neutral-900 via-black to-neutral-950 p-6 shadow-[0_0_40px_rgba(201,168,76,0.12)]">
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-loop-gold/20 blur-3xl" />
          <p className="relative text-[10px] font-bold uppercase tracking-[0.3em] text-loop-gold">Carte Prime</p>
          <p className="relative mt-3 text-lg font-bold">Accès privilégié</p>
          <p className="relative mt-1 text-xs text-neutral-400">
            Thème doré · LoopX · Favoris · Invitations
          </p>
          <div className="relative mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full border-2 border-loop-gold/60 bg-loop-gold/10 text-2xl text-loop-gold">
            ◆
          </div>
        </div>

        <section className="mt-8 space-y-3">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Avantages</h2>
          {PRIME_BENEFITS.map((benefit) => (
            <div
              key={benefit.title}
              className="flex gap-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-loop-gold/15 text-lg text-loop-gold">
                {benefit.icon}
              </span>
              <div>
                <p className="text-sm font-bold text-white">{benefit.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">{benefit.description}</p>
              </div>
            </div>
          ))}
        </section>

        {upgraded && (
          <div className="mt-6 rounded-xl border border-loop-gold/50 bg-loop-gold/10 px-4 py-4 text-center">
            <p className="text-2xl">✦</p>
            <p className="mt-2 text-sm font-bold text-loop-gold">Bienvenue dans Loop Prime</p>
            <p className="mt-1 text-xs text-neutral-300">
              Votre thème doré est actif. Explorez l&apos;agenda et les Spots pour voir le changement.
            </p>
            <Link
              to="/"
              className="mt-3 inline-block text-xs font-bold text-loop-gold hover:underline"
            >
              Découvrir l&apos;agenda →
            </Link>
          </div>
        )}

        <div className="mt-8 space-y-3">
          <button
            type="button"
            onClick={() => void handleBecomePrime()}
            disabled={upgrading}
            className="w-full rounded-xl bg-loop-gold py-4 text-sm font-bold text-black shadow-[0_0_24px_rgba(201,168,76,0.35)] transition-transform hover:scale-[1.01] disabled:opacity-60"
          >
            {upgrading
              ? 'Activation…'
              : isPrime
                ? 'Voir mon abonnement'
                : 'Devenir Prime'}
          </button>

          {role !== 'USER_ANONYMOUS' && !isPrime && (
            <p className="text-center text-[10px] text-neutral-500">
              Simulation : passage immédiat au grade Prime (démo ou compte connecté).
            </p>
          )}

          {!isPrime && (
            <p className="text-center text-xs text-neutral-500">
              <Link to="/exclusif/activation?token=INVIT-DEMO-2026" className="font-semibold text-loop-gold hover:underline">
                Activer avec une invitation →
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
