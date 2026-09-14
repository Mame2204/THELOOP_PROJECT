import { NavLink, useLocation } from 'react-router-dom';
import { LoopLogo } from '../components/LoopLogo';
import { usePermissions } from '../context/PermissionsContext';
import type { AdminPermissionId } from '../lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  permission: AdminPermissionId | 'demandes';
  /** Chemins enfants qui doivent aussi activer cet item (ex. Param. → notifs). */
  alsoActive?: string[];
}

/** Même rail que le Control Tower mobile (modules Param. accessibles via /parametres). */
export const ADMIN_NAV: NavItem[] = [
  { to: '/insights', label: 'Insights', icon: '📊', permission: 'insights' },
  { to: '/accueil', label: 'Accueil', icon: '🏠', permission: 'featured' },
  { to: '/onglets', label: 'Onglets', icon: '📱', permission: 'rubrique' },
  { to: '/loop', label: 'THE LOOP', icon: '✨', permission: 'loop_hub' },
  { to: '/contenu', label: 'Contenu', icon: '🗂', permission: 'content' },
  { to: '/users', label: 'Users', icon: '👥', permission: 'users' },
  { to: '/demandes', label: 'Demandes', icon: '📥', permission: 'demandes' },
  { to: '/privileges', label: 'Privilèges', icon: '🎁', permission: 'prime_benefits' },
  { to: '/teams', label: 'TEAMS', icon: '🛡️', permission: 'staff_benefits' },
  { to: '/tirage', label: 'Tirage', icon: '🎲', permission: 'benefit_draw' },
  {
    to: '/pass',
    label: 'PASS',
    icon: '🎫',
    permission: 'pass_management',
    alsoActive: ['/payments'],
  },
  {
    to: '/parametres',
    label: 'Param.',
    icon: '⚙️',
    permission: 'manage_admins',
    alsoActive: ['/notifications', '/automation', '/milestones', '/etoiles', '/horaires'],
  },
];

export function Sidebar() {
  const { can, canDemandes } = usePermissions();
  const location = useLocation();

  const visible = ADMIN_NAV.filter((item) => {
    if (item.permission === 'demandes') return canDemandes;
    if (item.permission === 'pass_management') {
      return (
        can('pass_management') ||
        can('pass_catalog') ||
        can('pass_prices') ||
        can('pass_messages') ||
        can('pass_payments')
      );
    }
    if (item.permission === 'loop_hub') {
      return can('loop_hub') || can('content') || can('featured') || can('prime_benefits');
    }
    return can(item.permission);
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <LoopLogo variant="light" size={26} />
        <span className="sidebar-brand-text">
          THE
          <br />
          LOOP
        </span>
      </div>
      <nav className="sidebar-nav">
        {visible.map((item) => {
          const childActive = (item.alsoActive ?? []).some(
            (p) => location.pathname === p || location.pathname.startsWith(`${p}/`),
          );
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar-item${isActive || childActive ? ' active' : ''}`
              }
            >
              <span className="sidebar-icon" aria-hidden>
                {item.icon}
              </span>
              <span className="sidebar-label">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
