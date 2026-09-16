import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import {
  COUNTRY_OPTIONS,
  DEFAULT_COUNTRY_CODE,
  getCountryLabel,
} from '../lib/countries';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'loop_admin_web_country_v1';

interface AdminCountryContextValue {
  countryCode: string;
  countryLabel: string;
  enabledCountries: string[];
  setCountryCode: (code: string) => void;
  refreshEnabledCountries: () => Promise<void>;
  ready: boolean;
}

const AdminCountryContext = createContext<AdminCountryContextValue | null>(null);

export function AdminCountryProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [countryCode, setCountryCodeState] = useState(DEFAULT_COUNTRY_CODE);
  const [enabledCountries, setEnabledCountries] = useState<string[]>(
    COUNTRY_OPTIONS.map((c) => c.code),
  );
  const [ready, setReady] = useState(false);

  const refreshEnabledCountries = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'enabled_content_countries')
      .maybeSingle();

    const raw = data?.value;
    let enabled = COUNTRY_OPTIONS.map((c) => c.code);
    if (Array.isArray(raw) && raw.every((x) => typeof x === 'string')) {
      enabled = (raw as string[]).map((c) => c.toUpperCase().slice(0, 2));
    } else if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          enabled = parsed
            .filter((x): x is string => typeof x === 'string')
            .map((c) => c.toUpperCase().slice(0, 2));
        }
      } catch {
        /* ignore */
      }
    }
    if (!enabled.length) enabled = [DEFAULT_COUNTRY_CODE];
    setEnabledCountries(enabled);

    const stored = localStorage.getItem(STORAGE_KEY);
    let next =
      stored && stored.length === 2
        ? stored.toUpperCase()
        : (profile?.countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase().slice(0, 2);
    if (!enabled.includes(next)) next = enabled[0];
    setCountryCodeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    setReady(true);
  }, [profile?.countryCode]);

  useEffect(() => {
    void refreshEnabledCountries();
  }, [refreshEnabledCountries]);

  const setCountryCode = useCallback(
    (code: string) => {
      const next = code.toUpperCase().slice(0, 2);
      if (!enabledCountries.includes(next)) return;
      setCountryCodeState(next);
      localStorage.setItem(STORAGE_KEY, next);
    },
    [enabledCountries],
  );

  const value = useMemo(
    () => ({
      countryCode,
      countryLabel: getCountryLabel(countryCode),
      enabledCountries,
      setCountryCode,
      refreshEnabledCountries,
      ready,
    }),
    [countryCode, enabledCountries, setCountryCode, refreshEnabledCountries, ready],
  );

  return (
    <AdminCountryContext.Provider value={value}>{children}</AdminCountryContext.Provider>
  );
}

export function useAdminCountry(): AdminCountryContextValue {
  const ctx = useContext(AdminCountryContext);
  if (!ctx) throw new Error('useAdminCountry hors AdminCountryProvider');
  return ctx;
}
