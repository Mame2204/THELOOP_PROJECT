import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuthContext } from '@/context/AuthContext';
import {
  getMemberGradeTheme,
  loadDevGradeOverride,
  resolveMemberGrade,
  saveDevGradeOverride,
  type DevGradeOverride,
  type MemberGrade,
  type MemberGradeTheme,
} from '@/lib/member-grade-theme';

interface MemberGradeContextValue {
  sessionGrade: MemberGrade;
  activeGrade: MemberGrade;
  theme: MemberGradeTheme;
  isDev: boolean;
  devOverride: DevGradeOverride;
  setDevOverride: (value: DevGradeOverride) => void;
}

const MemberGradeContext = createContext<MemberGradeContextValue | null>(null);

export function MemberGradeProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuthContext();
  const isDev = import.meta.env.DEV;
  const [devOverride, setDevOverrideState] = useState<DevGradeOverride>(loadDevGradeOverride);

  const sessionGrade = resolveMemberGrade(user?.userRole, role);
  const activeGrade: MemberGrade =
    isDev && devOverride !== 'auto' ? devOverride : sessionGrade;
  const theme = getMemberGradeTheme(activeGrade);

  const setDevOverride = useCallback((value: DevGradeOverride) => {
    setDevOverrideState(value);
    saveDevGradeOverride(value);
  }, []);

  const value = useMemo(
    () => ({ sessionGrade, activeGrade, theme, isDev, devOverride, setDevOverride }),
    [sessionGrade, activeGrade, theme, isDev, devOverride, setDevOverride],
  );

  return (
    <MemberGradeContext.Provider value={value}>{children}</MemberGradeContext.Provider>
  );
}

export function useMemberGradeContext(): MemberGradeContextValue {
  const ctx = useContext(MemberGradeContext);
  if (!ctx) throw new Error('useMemberGradeContext must be used within MemberGradeProvider');
  return ctx;
}
