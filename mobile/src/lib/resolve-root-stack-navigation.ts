export type NavLike = {
  navigate?: (name: string, params?: object) => void;
  goBack?: () => void;
  getParent?: () => NavLike | undefined;
  getState?: () => { routeNames?: string[] } | undefined;
};

/** Remonte jusqu’à la pile racine qui contient `VisitorGateway` (fiches détail incluses). */
export function resolveRootStackNavigation(nav: NavLike): NavLike {
  let current: NavLike | undefined = nav;
  for (let depth = 0; depth < 10 && current; depth += 1) {
    const names = current.getState?.()?.routeNames;
    if (names?.includes('VisitorGateway')) {
      return current;
    }
    current = current.getParent?.();
  }
  return nav;
}
