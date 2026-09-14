import { NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import type { UserRole } from '@/types';

/** Onglets visibles selon le rôle. */
const ALL_TABS = [
  { label: 'Spots', path: '/spots', icon: '🏛️', roles: ['USER_ANONYMOUS', 'USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN'] as UserRole[] },
  { label: 'Agenda', path: '/', icon: '📅', end: true, roles: ['USER_ANONYMOUS', 'USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN'] as UserRole[] },
  { label: 'Favoris', path: '/favoris', icon: '♥', roles: ['USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN'] as UserRole[] },
  { label: 'Profil', path: '/profil', icon: '👤', roles: ['USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN'] as UserRole[] },
] as const;

function IconTab({ icon, active }: { icon: string; active: boolean }) {
  return (
    <span
      className={`flex h-7 w-7 items-center justify-center rounded-xl text-base leading-none transition-transform duration-200 ${
        active ? 'scale-110' : 'scale-100 opacity-70'
      }`}
    >
      {icon}
    </span>
  );
}

function getTabsForRole(role: UserRole) {
  return ALL_TABS.filter((tab) => tab.roles.includes(role));
}

export function BottomNav() {
  const { role } = useAuth();
  const { theme } = useMemberTheme();
  const tabs = getTabsForRole(role);
  const isDark = theme.grade !== 'anonymous';
  const navActive = theme.shell.navActive;

  const idleClass = `touch-press flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold tracking-tight transition-colors ${
    isDark ? 'text-neutral-500' : 'text-loop-public-muted'
  }`;

  const activeClass = `touch-press flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[10px] font-semibold tracking-tight transition-colors ${
    isDark ? navActive : 'text-loop-black'
  }`;

  return (
    <nav
      className={`native-tab-bar safe-bottom ${
        isDark
          ? 'border-t border-loop-border bg-[#0a0a0a]/98'
          : 'border-t border-loop-public-border bg-white/98'
      }`}
      aria-label="Navigation principale"
    >
      <ul className="flex h-[58px] items-stretch justify-around px-1">
        {tabs.map((tab) => (
          <li key={tab.path} className="flex flex-1">
            <NavLink
              to={tab.path}
              end={'end' in tab ? tab.end : false}
              className={({ isActive }) => (isActive ? activeClass : idleClass)}
            >
              {({ isActive }) => (
                <>
                  <IconTab icon={tab.icon} active={isActive} />
                  <span>{tab.label}</span>
                  {isActive && (
                    <span
                      className={`mt-0.5 h-0.5 w-5 rounded-full ${isDark ? 'bg-loop-gold' : 'bg-loop-black'}`}
                    />
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
