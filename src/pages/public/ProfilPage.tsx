import { Link } from 'react-router-dom';
import { MobileAppBar } from '@/components/mobile/MobileAppBar';
import { MemberProfilePanel } from '@/components/public/MemberProfilePanel';
import { useAuth } from '@/hooks/useAuth';
import { useMemberGrade } from '@/hooks/useMemberGrade';
import { PASS_PURCHASE_UI_ENABLED } from '@/lib/pass-purchase-ui';

export function ProfilPage() {
  const { role } = useAuth();
  const { theme } = useMemberGrade();
  const { profile } = theme;
  const isPrime = role === 'USER_PRIME';
  const isPartner = role === 'PARTNER';

  return (
    <div className={`min-h-full pb-4 transition-colors duration-500 ${profile.pageBg}`}>
      <MobileAppBar title="Mon Profil" />

      <div className="px-4 pt-2">
        <div className="mb-4 space-y-3">
          {PASS_PURCHASE_UI_ENABLED && (isPrime || role === 'USER_FREE') && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-loop-gold">Loop Prime</p>
              <div className="flex flex-wrap gap-2">
                {isPrime && (
                  <Link
                    to="/abonnement"
                    className="touch-press rounded-xl border border-loop-gold/40 bg-loop-gold/10 px-3 py-2 text-xs font-bold text-loop-gold"
                  >
                    Mon abonnement
                  </Link>
                )}
                {role === 'USER_FREE' && (
                  <Link
                    to="/prime"
                    className="touch-press rounded-xl border border-loop-gold/40 bg-loop-gold/10 px-3 py-2 text-xs font-bold text-loop-gold"
                  >
                    Devenir Prime
                  </Link>
                )}
              </div>
            </div>
          )}

          {isPartner ? (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-400">Espace Pro</p>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/espace-partenaire"
                  className="touch-press rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-400"
                >
                  Tableau de bord
                </Link>
                <Link
                  to="/espace-partenaire/stats"
                  className="touch-press rounded-xl border border-emerald-500/40 px-3 py-2 text-xs font-bold text-emerald-400"
                >
                  Statistiques
                </Link>
              </div>
            </div>
          ) : (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-400">Partenariat</p>
              <p className="mb-2 text-xs text-neutral-500">
                Proposez votre établissement au réseau THE LOOP — distinct de l&apos;abonnement Loop Prime.
              </p>
              <Link
                to="/partenaires/demande"
                className="touch-press inline-flex rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-400"
              >
                Faire une demande de partenariat →
              </Link>
            </div>
          )}
        </div>

        <MemberProfilePanel />
      </div>
    </div>
  );
}
