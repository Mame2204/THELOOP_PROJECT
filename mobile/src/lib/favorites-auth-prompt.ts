import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useFavoritesSignup, type AuthNavigation } from '@/context/FavoritesSignupContext';

type FavoritesAuthNavigation = AuthNavigation;

export const FAVORITES_AUTH_MESSAGE =
  'Crée un compte gratuit pour sauvegarder tes favoris et recevoir des offres dans ta ville.';

/** @deprecated Utiliser useFavoritesSignup().openSignupSheet dans les composants React. */
export function promptFavoritesSignup(navigation: FavoritesAuthNavigation): void {
  void navigation;
}

/** Ouvre « Rejoins le club » (VisitorGateway) depuis listes, fiches détail ou onglets. */
export function usePromptFavoritesSignup() {
  const { openSignupSheet } = useFavoritesSignup();
  const fallbackNav = useNavigation();
  return useCallback(
    (navigation?: FavoritesAuthNavigation) => {
      openSignupSheet(navigation ?? (fallbackNav as AuthNavigation));
    },
    [openSignupSheet, fallbackNav],
  );
}
