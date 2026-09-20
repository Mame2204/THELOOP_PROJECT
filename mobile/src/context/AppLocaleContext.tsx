import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getAppLocale, saveAppLocale, type AppLocale } from '@/lib/app-locale-store';

interface AppLocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => Promise<void>;
  ready: boolean;
}

const AppLocaleContext = createContext<AppLocaleContextValue | null>(null);

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>('fr');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getAppLocale().then((value) => {
      if (!cancelled) {
        setLocaleState(value);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback(async (next: AppLocale) => {
    setLocaleState(next);
    await saveAppLocale(next);
  }, []);

  const value = useMemo(
    () => ({ locale, setLocale, ready }),
    [locale, setLocale, ready],
  );

  return <AppLocaleContext.Provider value={value}>{children}</AppLocaleContext.Provider>;
}

export function useAppLocale(): AppLocaleContextValue {
  const ctx = useContext(AppLocaleContext);
  if (!ctx) {
    throw new Error('useAppLocale must be used within AppLocaleProvider');
  }
  return ctx;
}
