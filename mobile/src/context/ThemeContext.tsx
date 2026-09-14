import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuthContext } from '@/context/AuthContext';
import type { UserRole } from '@/types';
import {
  bootstrapPlatformRoles,
  getThemeIdForDbSlug,
  isPlatformRolesLoaded,
} from '@/lib/platform-roles-store';
import {
  getTheme,
  resolveThemeId,
  themeIdToMemberGrade,
  toShellTheme,
  type LoopTheme,
  type MemberGrade,
  type ShellTheme,
  type ThemeId,
} from '@/lib/theme-config';

export type ThemeScope = 'app' | 'adminTower';

interface ThemeContextValue {
  themeId: ThemeId;
  theme: LoopTheme;
  shell: ShellTheme;
  grade: MemberGrade;
  isDark: boolean;
  scope: ThemeScope;
  setScope: (scope: ThemeScope) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { role, user } = useAuthContext();
  const [scope, setScope] = useState<ThemeScope>('app');
  const [rolesReady, setRolesReady] = useState(isPlatformRolesLoaded());

  useEffect(() => {
    void bootstrapPlatformRoles().then(() => setRolesReady(true));
  }, []);

  useEffect(() => {
    if (role !== 'ADMIN') setScope('app');
  }, [role]);

  const effectiveRole = useMemo((): UserRole => {
    if (
      user?.userRole === 'prime' &&
      role !== 'ADMIN' &&
      role !== 'PARTNER'
    ) {
      return 'USER_PRIME';
    }
    return role;
  }, [role, user?.userRole]);

  const themeId = useMemo((): ThemeId => {
    void rolesReady;
    // Visiteur sans compte : toujours thème VISITOR (jamais theme_id distant)
    if (role === 'USER_ANONYMOUS' || !user || user.id === 'anonymous') {
      return 'VISITOR';
    }
    // Partenaire : toujours thème PARTNER
    if (role === 'PARTNER' || effectiveRole === 'PARTNER') {
      return 'PARTNER';
    }
    // Thème piloté par le rôle app (évite inversions theme_id en base)
    const expected = resolveThemeId(effectiveRole);
    const fromDb = getThemeIdForDbSlug(user.userRole);
    // Autoriser seulement les variantes admin (délégué vs fondateur)
    if (
      role === 'ADMIN' &&
      (fromDb === 'ADMIN' || fromDb === 'DELEGATED_ADMIN')
    ) {
      return fromDb;
    }
    return expected;
  }, [effectiveRole, role, rolesReady, user]);

  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const shell = useMemo(() => toShellTheme(theme), [theme]);
  const grade = useMemo(() => themeIdToMemberGrade(themeId), [themeId]);

  const value = useMemo(
    (): ThemeContextValue => ({
      themeId,
      theme,
      shell,
      grade,
      isDark: theme.isDark,
      scope,
      setScope,
    }),
    [themeId, theme, shell, grade, scope],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeContext must be used within ThemeProvider');
  return ctx;
}

export function useTheme(): LoopTheme {
  return useThemeContext().theme;
}

/** Active le thème ADMIN Control Tower tant que le composant est monté */
export function useAdminTowerScope(): void {
  const { setScope } = useThemeContext();
  useEffect(() => {
    setScope('adminTower');
    return () => setScope('app');
  }, [setScope]);
}
