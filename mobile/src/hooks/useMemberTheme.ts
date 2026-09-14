import { useThemeContext } from '@/context/ThemeContext';

/** Hook thème — délègue au ThemeProvider (design system THE LOOP) */
export function useMemberTheme() {
  const { theme, shell, grade, isDark, themeId } = useThemeContext();
  return { grade, shell, theme, themeId, isDark };
}
