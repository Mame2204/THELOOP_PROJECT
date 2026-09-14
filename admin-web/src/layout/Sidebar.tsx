import { NavLink } from 'react-router-dom';
import { usePermissions } from '../context/PermissionsContext';
import type { AdminPermissionId } from '../lib/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** Permission requise ; `demandes` = hub spécial */
  permission: AdminPermissionId | 'demandes';
}

export const ADMIN_NAV: NavItem[] = [
  { to: '/insights', label: 'Insights', icon: '📊', permission: 'insights' },
  { to: '/accueil', label: 'Accueil', icon: '🏠', permission: 'featured' },
  { to: '/onglets', label: 'Onglets', icon: '📑', permission: 'rubrique' },
  { to: '/loop', label: 'THE LOOP', icon: '🔁', permission: 'loop_hub' },
  { to: '/contenu', label: 'Contenu', icon: '📰', permission: 'content' },
  { to: '/users', label: 'Users', icon: '👥', permission: 'users' },
  { to: '/demandes', label: 'Demandes', icon: '📥', permission: 'demandes' },
  { to: '/privileges', label: 'Privilèges', icon: '✨', permission: 'prime_benefits' },
  { to: '/teams', label: 'TEAMS', icon: '🛡️', permission: 'staff_benefits' },
  { to: '/tirage', label: 'Tirage', icon: '🎲', permission: 'benefit_draw' },
  { to: '/pass', label: 'PASS', icon: '🎫', permission: 'pass_management' },
  { to: '/payments', label: 'Paiements', icon: '💳', permission: 'pass_payments' },
  { to: '/parametres', label: 'Param.', icon: '⚙️', permission: 'manage_admins' },
];

export function Sidebar() {
  const { can, canDemandes } = usePermissions();

  const visible = ADMIN_NAV.filter((item) => {
    if (item.permission === 'demandes') return canDemandes;
    if (item.permission === 'pass_payments') {
      return can('pass_payments') || can('pass_management');
    }
    if (item.permission === 'pass_management') {
      return (
        can('pass_management') ||
        can('pass_catalog') ||
        can('pass_prices') ||
        can('pass_messages')
      );
    }
    return can(item.permission);
  });

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-mark" aria-hidden />
        <span className="sidebar-brand-text">
          THE
          <br />
          LOOP
        </span>
      </div>
      <nav className="sidebar-nav">
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
          >
            <span className="sidebar-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
