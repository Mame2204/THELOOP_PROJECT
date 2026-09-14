import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  listEnabledContentCountries,
  toggleContentCountry,
} from '@/lib/content-countries-store';
import { DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';

interface ContentCountriesContextValue {
  enabledCountries: CountryCode[];
  isReady: boolean;
  refresh: () => Promise<void>;
  toggleCountry: (code: CountryCode, enabled: boolean) => Promise<CountryCode[]>;
}

const ContentCountriesContext = createContext<ContentCountriesContextValue | null>(null);

export function ContentCountriesProvider({ children }: { children: ReactNode }) {
  const [enabledCountries, setEnabledCountries] = useState<CountryCode[]>([DEFAULT_COUNTRY_CODE]);
  const [isReady, setIsReady] = useState(false);

  const refresh = useCallback(async () => {
    const codes = await listEnabledContentCountries();
    setEnabledCountries(codes);
    setIsReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleCountry = useCallback(async (code: CountryCode, enabled: boolean) => {
    const next = await toggleContentCountry(code, enabled);
    setEnabledCountries(next);
    return next;
  }, []);

  const value = useMemo(
    () => ({ enabledCountries, isReady, refresh, toggleCountry }),
    [enabledCountries, isReady, refresh, toggleCountry],
  );

  return <ContentCountriesContext.Provider value={value}>{children}</ContentCountriesContext.Provider>;
}

export function useContentCountries(): ContentCountriesContextValue {
  const ctx = useContext(ContentCountriesContext);
  if (!ctx) {
    return {
      enabledCountries: [DEFAULT_COUNTRY_CODE],
      isReady: true,
      refresh: async () => {},
      toggleCountry: async () => [DEFAULT_COUNTRY_CODE],
    };
  }
  return ctx;
}
