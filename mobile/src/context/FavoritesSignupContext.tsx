import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { VisitorGatewaySheet } from '@/components/VisitorGatewaySheet';
import { useAppSettings } from '@/context/AppSettingsContext';

type AuthNavigation = {
  navigate: (name: 'Auth' | 'Suggestion', params?: { mode?: 'login' | 'signup' }) => void;
  goBack?: () => void;
};

interface VisitorGatewayContextValue {
  openSignupSheet: (navigation: AuthNavigation) => void;
}

const VisitorGatewayContext = createContext<VisitorGatewayContextValue | null>(null);

export function FavoritesSignupProvider({ children }: { children: ReactNode }) {
  const { settings } = useAppSettings();
  const [visible, setVisible] = useState(false);
  const [navigation, setNavigation] = useState<AuthNavigation | null>(null);

  const openSignupSheet = useCallback((nav: AuthNavigation) => {
    setNavigation(nav);
    setVisible(true);
  }, []);

  const close = useCallback(() => setVisible(false), []);

  const value = useMemo(() => ({ openSignupSheet }), [openSignupSheet]);

  return (
    <VisitorGatewayContext.Provider value={value}>
      {children}
      <VisitorGatewaySheet
        visible={visible}
        onClose={close}
        onLogin={() => {
          close();
          navigation?.navigate('Auth', { mode: 'login' });
        }}
        onSignup={() => {
          close();
          navigation?.navigate('Auth', { mode: 'signup' });
        }}
        onSuggest={() => {
          close();
          if (!settings.showCommunitySuggestion) return;
          navigation?.navigate('Suggestion');
        }}
      />
    </VisitorGatewayContext.Provider>
  );
}

export function useFavoritesSignup(): VisitorGatewayContextValue {
  const ctx = useContext(VisitorGatewayContext);
  if (!ctx) {
    return { openSignupSheet: () => {} };
  }
  return ctx;
}
