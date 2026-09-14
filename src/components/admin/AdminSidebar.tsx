import { NavLink, useNavigate } from 'react-router-dom';
import { LoopLogo } from '@/components/shared/LoopLogo';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { UserRole } from '@/types';

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard Analytics', end: true },
  { to: '/admin/moderation', label: 'Centre de Modération', end: false },
  { to: '/admin/categories', label: 'Catégories', end: false },
  { to: '/admin/utilisateurs', label: 'Utilisateurs', end: false },
  { to: '/admin/slider', label: 'Gestion des Sliders', end: false },
  { to: '/admin/jetons', label: 'Gestion des Accès', end: false },
] as const;

interface AdminSidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function AdminSidebar({ mobileOpen, onCloseMobile }: AdminSidebarProps) {
  const { signOut, signInDemo, signInDemoAdmin, signInDemoPartner, signInDemoPrime } = useAuth();
  const navigate = useNavigate();
  const isDemo = !isSupabaseConfigured();

  async function switchRole(role: UserRole | 'anonymous') {
    if (role === 'anonymous') {
      await signOut();
      navigate('/');
    } else if (role === 'USER_FREE') {
      await signInDemo();
      navigate('/');
    } else if (role === 'PARTNER') {
      await signInDemoPartner();
      navigate('/espace-partenaire');
    } else if (role === 'ADMIN') {
      await signInDemoAdmin();
      navigate('/admin');
    } else if (role === 'USER_PRIME') {
      await signInDemoPrime();
      navigate('/');
    }
    onCloseMobile();
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-[#111111] text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <LoopLogo variant="light" size="md" />
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-loop-gold">
          Console Admin
        </p>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onCloseMobile}
            className={({ isActive }) =>
              `block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-loop-gold text-loop-black'
                  : 'text-neutral-300 hover:bg-white/5 hover:text-white'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {isDemo && (
        <div className="border-t border-white/10 px-3 py-4">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Bascule démo
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { id: 'anonymous' as const, label: 'Visiteur' },
              { id: 'USER_FREE' as const, label: 'Membre' },
              { id: 'USER_PRIME' as const, label: 'Loop Prime' },
              { id: 'PARTNER' as const, label: 'Partenaire' },
              { id: 'ADMIN' as const, label: 'Admin' },
            ].map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => void switchRole(role.id)}
                className="rounded-lg border border-white/10 px-2 py-1.5 text-[10px] font-semibold text-neutral-300 hover:border-loop-gold hover:text-loop-gold"
              >
                {role.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
          className="w-full rounded-xl border border-red-500/40 px-3 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/10"
        >
          Déconnexion
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-black/10 lg:block">{sidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Fermer le menu"
            onClick={onCloseMobile}
          />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] shadow-2xl">{sidebarContent}</aside>
        </div>
      )}
    </>
  );
}
