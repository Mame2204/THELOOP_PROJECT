import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuthContext } from '@/context/AuthContext';
import { useContentCountries } from '@/context/ContentCountriesContext';
import { DEFAULT_COUNTRY_CODE, getCountryLabel, type CountryCode } from '@/lib/countries';

const STORAGE_KEY = 'loop_admin_country_v1';

interface AdminCountryContextValue {
  countryCode: CountryCode;
  countryLabel: string;
  setCountryCode: (code: CountryCode) => void;
  isReady: boolean;
}

const AdminCountryContext = createContext<AdminCountryContextValue | null>(null);

function clampAdminCountry(code: CountryCode, enabled: CountryCode[]): CountryCode {
  if (!enabled.length) return DEFAULT_COUNTRY_CODE;
  return enabled.includes(code) ? code : enabled[0];
}

export function AdminCountryProvider({ children }: { children: ReactNode }) {
  const { user, role } = useAuthContext();
  const { enabledCountries, isReady: countriesReady } = useContentCountries();
  const [countryCode, setCountryCodeState] = useState<CountryCode>(DEFAULT_COUNTRY_CODE);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!countriesReady) return;
    void (async () => {
      try {
        let next: CountryCode = DEFAULT_COUNTRY_CODE;
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored && stored.length === 2) {
          next = stored as CountryCode;
        } else if (user?.countryCode && user.countryCode.length === 2) {
          next = user.countryCode as CountryCode;
        }
        next = clampAdminCountry(next, enabledCountries);
        setCountryCodeState(next);
        if (stored !== next) {
          await AsyncStorage.setItem(STORAGE_KEY, next);
        }
      } finally {
        setIsReady(true);
      }
    })();
  }, [user?.countryCode, countriesReady, enabledCountries]);

  useEffect(() => {
    if (!countriesReady || !isReady) return;
    const clamped = clampAdminCountry(countryCode, enabledCountries);
    if (clamped !== countryCode) {
      setCountryCodeState(clamped);
      void AsyncStorage.setItem(STORAGE_KEY, clamped);
    }
  }, [countriesReady, enabledCountries, countryCode, isReady]);

  const setCountryCode = useCallback(
    async (code: CountryCode) => {
      if (!enabledCountries.includes(code)) return;
      setCountryCodeState(code);
      await AsyncStorage.setItem(STORAGE_KEY, code);
    },
    [enabledCountries],
  );

  const value = useMemo<AdminCountryContextValue>(
    () => ({
      countryCode,
      countryLabel: getCountryLabel(countryCode),
      setCountryCode,
      isReady: isReady && countriesReady,
    }),
    [countryCode, setCountryCode, isReady, countriesReady],
  );

  if (role !== 'ADMIN') {
    return <>{children}</>;
  }

  return <AdminCountryContext.Provider value={value}>{children}</AdminCountryContext.Provider>;
}

export function useAdminCountry(): AdminCountryContextValue {
  const ctx = useContext(AdminCountryContext);
  if (!ctx) {
    return {
      countryCode: DEFAULT_COUNTRY_CODE,
      countryLabel: getCountryLabel(DEFAULT_COUNTRY_CODE),
      setCountryCode: () => {},
      isReady: true,
    };
  }
  return ctx;
}
