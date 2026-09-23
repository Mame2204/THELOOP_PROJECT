import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMemberGrade } from '@/hooks/useMemberGrade';
import { formatDisplayName, getUserInitials } from '@/lib/user-display';
import { PASS_PURCHASE_UI_ENABLED } from '@/lib/pass-purchase-ui';

export function UserAccountMenu() {
  const { user, role, isLoading, signOut } = useAuth();
  const { theme, activeGrade } = useMemberGrade();
  const { nav } = theme;
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isPartner = role === 'PARTNER' || activeGrade === 'partner';
  const isPrime = role === 'USER_PRIME' || activeGrade === 'prime';
  const showFavoris = role === 'USER_FREE' || isPrime || isPartner;

  const initials = getUserInitials(user?.firstName, user?.lastName, { loading: isLoading });
  const displayName = formatDisplayName(user?.firstName, user?.lastName) || 'Membre';

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    navigate('/');
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menu profil"
        className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-bold shadow-sm transition-transform hover:scale-105 ${nav.avatarRing} ${nav.avatarBg} ${nav.avatarText}`}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[210px] overflow-hidden rounded-xl border border-neutral-700 bg-loop-black py-1 shadow-xl"
        >
          <div className="border-b border-neutral-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-white">{displayName}</p>
              <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase text-neutral-300">
                {theme.badgeLabel}
              </span>
            </div>
            <p className="truncate text-xs text-neutral-400">{user?.email}</p>
          </div>
          <Link
            to="/profil"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-900"
          >
            <span aria-hidden>👤</span>
            Mon Profil
          </Link>
          {showFavoris && (
            <Link
              to="/favoris"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-900"
            >
              <span aria-hidden>♥</span>
              Favoris
            </Link>
          )}
          {PASS_PURCHASE_UI_ENABLED && role === 'USER_FREE' && (
            <Link
              to="/prime"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-900"
            >
              <span aria-hidden>◆</span>
              Devenir Prime
            </Link>
          )}
          {role !== 'PARTNER' && (
            <Link
              to="/partenaires/demande"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-emerald-400 transition-colors hover:bg-neutral-900"
            >
              <span aria-hidden>🤝</span>
              Devenir partenaire
            </Link>
          )}
          {isPartner && (
            <Link
              to="/espace-partenaire"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-emerald-400 transition-colors hover:bg-neutral-900"
            >
              <span aria-hidden>🏢</span>
              Espace Pro
            </Link>
          )}
          {PASS_PURCHASE_UI_ENABLED && isPrime && (
            <Link
              to="/abonnement"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-900"
            >
              <span aria-hidden>◆</span>
              Abonnement
            </Link>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleSignOut()}
            className="flex w-full items-center gap-2 border-t border-neutral-800 px-4 py-3 text-left text-sm font-medium text-red-400 transition-colors hover:bg-neutral-900"
          >
            <span aria-hidden>↩</span>
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
