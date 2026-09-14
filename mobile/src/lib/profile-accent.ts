import type { LoopTheme, ThemeId } from '@/lib/theme-config';
import type { ShellTheme } from '@/lib/theme-config';
import type { UserRole } from '@/types';
import type { MemberGrade } from '@/lib/theme-config';

export interface ProfileAccent {
  accent: string;
  accentSoft: string;
  accentBorder: string;
}

export function getProfileAccent(_role: UserRole, shell: ShellTheme, _grade: MemberGrade, theme?: LoopTheme): ProfileAccent {
  const t = theme?.colors;
  if (t) {
    return {
      accent: t.accent,
      accentSoft: t.accentSoft,
      accentBorder: t.accentBorder,
    };
  }
  return {
    accent: shell.tabIndicator,
    accentSoft: shell.filterInactiveBg,
    accentBorder: shell.filterInactiveBorder,
  };
}

export function themeIdToLogoGrade(themeId: ThemeId): MemberGrade {
  switch (themeId) {
    case 'VISITOR':
      return 'anonymous';
    case 'FREE_MEMBER':
      return 'member';
    case 'PRIME_MEMBER':
      return 'prime';
    case 'PARTNER':
      return 'partner';
    case 'ADMIN':
      return 'admin';
    case 'DELEGATED_ADMIN':
      return 'admin';
  }
}
