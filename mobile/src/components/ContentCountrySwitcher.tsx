import type { ShellTheme } from '@/lib/member-grade-theme';

/** @deprecated Conservé pour compatibilité d'import. */
export type ContentCountrySwitcherProps = { shell: ShellTheme };

/** Legacy — composant conservé pour compatibilité bundle. Toujours null. */
export function ContentCountrySwitcher(_props: ContentCountrySwitcherProps) {
  void _props;
  return null;
}
