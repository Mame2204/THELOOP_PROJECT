import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  resolveRootStackNavigation,
  type NavLike,
} from '@/lib/resolve-root-stack-navigation';

export type AuthNavigation = NavLike & {
  navigate: (name: string, params?: object) => void;
};

interface VisitorGatewayContextValue {
  openSignupSheet: (navigation: AuthNavigation) => void;
  takePendingAuthNavigation: () => AuthNavigation | null;
}

const VisitorGatewayContext = createContext<VisitorGatewayContextValue | null>(null);

export function FavoritesSignupProvider({ children }: { children: ReactNode }) {
  const pendingAuthNavRef = useRef<AuthNavigation | null>(null);

  const takePendingAuthNavigation = useCallback(() => {
    const nav = pendingAuthNavRef.current;
    pendingAuthNavRef.current = null;
    return nav;
  }, []);

  const openSignupSheet = useCallback((nav: AuthNavigation) => {
    pendingAuthNavRef.current = nav;
    const stack = resolveRootStackNavigation(nav);
    stack.navigate?.('VisitorGateway');
  }, []);

  const value = useMemo(
    () => ({ openSignupSheet, takePendingAuthNavigation }),
    [openSignupSheet, takePendingAuthNavigation],
  );

  return <VisitorGatewayContext.Provider value={value}>{children}</VisitorGatewayContext.Provider>;
}

export function useFavoritesSignup(): VisitorGatewayContextValue {
  const ctx = useContext(VisitorGatewayContext);
  if (!ctx) {
    return {
      openSignupSheet: () => {},
      takePendingAuthNavigation: () => null,
    };
  }
  return ctx;
}
