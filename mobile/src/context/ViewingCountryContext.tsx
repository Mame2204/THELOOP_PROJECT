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
import { DEFAULT_COUNTRY_CODE, type CountryCode } from '@/lib/countries';

interface ViewingCountryContextValue {
  viewingCountryCode: CountryCode;
  setViewingCountryCode: (code: CountryCode) => Promise<void>;
  /** Réservé aux membres connectés avec plusieurs pays activés. */
  canSwitchCountry: boolean;
  countries: CountryCode[];
  isReady: boolean;
  isExploringOtherCountry: boolean;
}

const ViewingCountryContext = createContext<ViewingCountryContextValue | null>(null);

function resolveDefaultViewingCountry(
  enabledCountries: CountryCode[],
  accountCountry?: string | null,
  interestCountry?: string | null,
  isLoggedIn = false,
): CountryCode {
  if (isLoggedIn) {
    const account = (accountCountry ?? DEFAULT_COUNTRY_CODE).toUpperCase().slice(0, 2) as CountryCode;
    const interest = interestCountry?.toUpperCase().slice(0, 2) as CountryCode | undefined;
    if (interest && enabledCountries.includes(interest)) return interest;
    if (enabledCountries.includes(account)) return account;
    return enabledCountries[0] ?? DEFAULT_COUNTRY_CODE;
  }

  if (enabledCountries.includes(DEFAULT_COUNTRY_CODE)) return DEFAULT_COUNTRY_CODE;
  return enabledCountries[0] ?? DEFAULT_COUNTRY_CODE;
}

export function ViewingCountryProvider({ children }: { children: ReactNode }) {
  const { user, updateInterestCountry } = useAuthContext();
  const { enabledCountries, isReady: countriesReady } = useContentCountries();
  const [viewingCountryCode, setViewingCountryCodeState] = useState<CountryCode>(DEFAULT_COUNTRY_CODE);
  const [isReady, setIsReady] = useState(false);

  const isLoggedIn = Boolean(user && user.id !== 'anonymous');

  useEffect(() => {
    if (!countriesReady) return;
    setViewingCountryCodeState(
      resolveDefaultViewingCountry(
        enabledCountries,
        user?.countryCode,
        user?.interestCountryCode,
        isLoggedIn,
      ),
    );
    setIsReady(true);
  }, [countriesReady, enabledCountries, user?.countryCode, user?.interestCountryCode, isLoggedIn]);

  const setViewingCountryCode = useCallback(async (code: CountryCode) => {
    if (!isLoggedIn || !enabledCountries.includes(code)) return;
    setViewingCountryCodeState(code);
    const account = (user?.countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase().slice(0, 2);
    await updateInterestCountry(code.toUpperCase().slice(0, 2) === account ? null : code);
  }, [enabledCountries, isLoggedIn, user?.countryCode, updateInterestCountry]);

  const canSwitchCountry = isLoggedIn && enabledCountries.length > 1;
  const accountCountry = (user?.countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase().slice(0, 2);
  const isExploringOtherCountry = canSwitchCountry && viewingCountryCode !== accountCountry;

  const value = useMemo(
    () => ({
      viewingCountryCode,
      setViewingCountryCode,
      canSwitchCountry,
      countries: enabledCountries,
      isReady,
      isExploringOtherCountry,
    }),
    [viewingCountryCode, setViewingCountryCode, canSwitchCountry, enabledCountries, isReady, isExploringOtherCountry],
  );

  return <ViewingCountryContext.Provider value={value}>{children}</ViewingCountryContext.Provider>;
}

export function useViewingCountry(): ViewingCountryContextValue {
  const ctx = useContext(ViewingCountryContext);
  if (!ctx) {
    return {
      viewingCountryCode: DEFAULT_COUNTRY_CODE,
      setViewingCountryCode: async () => {},
      canSwitchCountry: false,
      countries: [DEFAULT_COUNTRY_CODE],
      isReady: true,
      isExploringOtherCountry: false,
    };
  }
  return ctx;
}
