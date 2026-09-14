import type { NavigationState, PartialState } from '@react-navigation/native';
import type { UserRole } from '@/types';
import { ADMIN_THEME_ROUTES } from '@/lib/theme-config';
import type { ThemeScope } from '@/context/ThemeContext';

type NavState = NavigationState | PartialState<NavigationState> | undefined;

function collectRouteNames(state: NavState): string[] {
  if (!state?.routes?.length) return [];
  const names: string[] = [];
  const walk = (s: NavState) => {
    if (!s?.routes?.length) return;
    const index = s.index ?? 0;
    const route = s.routes[index];
    if (route?.name) names.push(route.name);
    if (route?.state) walk(route.state as NavState);
  };
  walk(state);
  return names;
}

export function resolveAdminThemeScope(role: UserRole, state: NavState): ThemeScope {
  if (role !== 'ADMIN') return 'app';
  const onAdminRoute = collectRouteNames(state).some((name) => ADMIN_THEME_ROUTES.has(name));
  return onAdminRoute ? 'adminTower' : 'app';
}

export function syncAdminThemeScopeFromState(
  state: NavState,
  role: UserRole,
  setScope: (scope: ThemeScope) => void,
): void {
  setScope(resolveAdminThemeScope(role, state));
}
