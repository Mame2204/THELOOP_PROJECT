import { CommonActions, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import type { AdminPanelParamList, RootStackParamList } from '@/navigation/types';

/** Navigue vers un écran du stack parent (Tabs → Stack). */
export function navigateRoot<T extends keyof RootStackParamList>(
  navigation: NavigationProp<ParamListBase>,
  screen: T,
  params?: RootStackParamList[T],
): void {
  let nav: NavigationProp<ParamListBase> | undefined = navigation;
  while (nav) {
    const names = nav.getState?.().routeNames ?? [];
    if (names.includes(screen as string)) {
      // @ts-expect-error params typés par écran
      nav.navigate(screen, params);
      return;
    }
    nav = nav.getParent?.() as NavigationProp<ParamListBase> | undefined;
  }
  // @ts-expect-error fallback
  navigation.navigate(screen, params);
}

/** Navigue vers un écran du panneau workspace admin (AdminAccueil, AdminContent…). */
export function navigateAdminPanel<T extends keyof AdminPanelParamList>(
  navigation: NavigationProp<ParamListBase>,
  screen: T,
  params?: AdminPanelParamList[T],
): boolean {
  let nav: NavigationProp<ParamListBase> | undefined = navigation;
  while (nav) {
    const names = nav.getState?.().routeNames ?? [];
    if (names.includes(screen as string)) {
      // @ts-expect-error params typés par écran
      nav.navigate(screen, params);
      return true;
    }
    nav = nav.getParent?.() as NavigationProp<ParamListBase> | undefined;
  }
  return false;
}

/** Remonte à Accueil (onglet) en vidant la pile — après connexion / déconnexion. */
export function resetToAccueil(navigation: NavigationProp<ParamListBase>): void {
  let root: NavigationProp<ParamListBase> = navigation;
  let parent = navigation.getParent?.() as NavigationProp<ParamListBase> | undefined;
  while (parent) {
    root = parent;
    parent = parent.getParent?.() as NavigationProp<ParamListBase> | undefined;
  }
  const routeNames = root.getState?.().routeNames ?? [];
  // Stack invité (Auth) : RootNavigator bascule vers Tabs + Accueil via effet auth.
  if (!routeNames.includes('Tabs')) {
    return;
  }
  root.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: 'Tabs',
          state: {
            index: 0,
            routes: [{ name: 'Accueil' }],
          },
        },
      ],
    }),
  );
}
