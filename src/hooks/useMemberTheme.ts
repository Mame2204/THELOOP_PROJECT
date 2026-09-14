import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMemberGrade } from '@/hooks/useMemberGrade';
import {
  getMemberGradeTheme,
  resolveDisplayGrade,
  type MemberGrade,
} from '@/lib/member-grade-theme';
import { isAuthenticated, isPrimeMember } from '@/types';

function resolveActiveGrade(
  sessionGrade: MemberGrade,
  pathname: string,
  devOverride: ReturnType<typeof useMemberGrade>['devOverride'],
  isDev: boolean,
): MemberGrade {
  const base = isDev && devOverride !== 'auto' ? devOverride : sessionGrade;
  return resolveDisplayGrade(base, pathname);
}

/** Thème shell public selon le grade connecté et la route courante. */
export function useMemberTheme() {
  const { pathname } = useLocation();
  const { role } = useAuth();
  const { sessionGrade, devOverride, isDev } = useMemberGrade();
  const displayGrade = resolveActiveGrade(sessionGrade, pathname, devOverride, isDev);
  const theme = getMemberGradeTheme(displayGrade);
  const isMember = isAuthenticated(role);
  const isPrime = isPrimeMember(role);

  return {
    isMember,
    isPrime,
    theme,
    displayGrade,
    shell: theme.shell,
    layoutClass: theme.shell.pageTint,
    headerClass: `${theme.shell.headerBg} ${theme.shell.headerBorder} border-b backdrop-blur-md`,
    cardClass:
      theme.grade === 'anonymous'
        ? 'border-black bg-white text-black'
        : theme.grade === 'member'
          ? 'border-neutral-700 bg-neutral-900 text-neutral-100'
          : 'border-neutral-700 bg-neutral-900 text-white',
  };
}
