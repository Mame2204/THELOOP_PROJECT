import { PublicHeader } from '@/components/public/PublicHeader';
import { useAuth } from '@/hooks/useAuth';
import { formatDateFr } from '@/lib/date-utils';
import { Link } from 'react-router-dom';

export function AbonnementPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-full bg-black pb-4 text-white">
      <PublicHeader />

      <div className="px-4 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-loop-gold">Loop Prime</p>
        <h1 className="mt-1 text-2xl font-bold">Abonnement</h1>

        <div className="mt-5 rounded-2xl border border-loop-gold/40 bg-gradient-to-br from-neutral-900 to-black p-6 text-center shadow-[0_0_30px_rgba(201,168,76,0.15)]">
          <p className="text-[10px] uppercase tracking-[0.3em] text-loop-gold">Abonnement premium</p>
          <p className="mt-4 text-xl font-bold">{user?.firstName ?? user?.fullName}</p>
          <p className="text-sm text-neutral-400">{user?.company}</p>
          <div className="mx-auto mt-6 h-24 w-40 animate-pulse rounded-xl border border-loop-gold/50 bg-black/50" />
          <p className="mt-4 text-xs text-neutral-400">
            Abonnement {user?.subscriptionStatus === 'active' ? 'ACTIF' : user?.subscriptionStatus?.toUpperCase()}
          </p>
          <p className="mt-1 text-sm text-loop-gold">
            Échéance : {user?.subscriptionExpiresAt ? formatDateFr(user.subscriptionExpiresAt) : '—'}
          </p>
        </div>

        <p className="mt-4 text-center text-sm text-neutral-500">
          <Link to="/profil" className="font-semibold text-loop-gold hover:underline">
            ← Retour au profil
          </Link>
        </p>
      </div>
    </div>
  );
}
