import { useFavoritesSignup } from '@/context/FavoritesSignupContext';

type FavoritesAuthNavigation = {
  navigate: (name: 'Auth' | 'Suggestion', params?: { mode?: 'login' | 'signup' }) => void;
};

export const FAVORITES_AUTH_MESSAGE =
  'Crée un compte gratuit pour sauvegarder tes favoris et recevoir des offres dans ta ville.';

/** @deprecated Utiliser useFavoritesSignup().openSignupSheet dans les composants React. */
export function promptFavoritesSignup(navigation: FavoritesAuthNavigation): void {
  void navigation;
}

export function usePromptFavoritesSignup() {
  const { openSignupSheet } = useFavoritesSignup();
  return (navigation: FavoritesAuthNavigation) => openSignupSheet(navigation);
}
