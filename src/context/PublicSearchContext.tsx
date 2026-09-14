import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface PublicSearchContextValue {
  query: string;
  setQuery: (query: string) => void;
  isOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;
}

const PublicSearchContext = createContext<PublicSearchContextValue | null>(null);

export function PublicSearchProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const openSearch = useCallback(() => setIsOpen(true), []);
  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);
  const toggleSearch = useCallback(() => {
    setIsOpen((open) => {
      if (open) setQuery('');
      return !open;
    });
  }, []);

  const value = useMemo(
    () => ({ query, setQuery, isOpen, openSearch, closeSearch, toggleSearch }),
    [query, isOpen, openSearch, closeSearch, toggleSearch],
  );

  return <PublicSearchContext.Provider value={value}>{children}</PublicSearchContext.Provider>;
}

export function usePublicSearchContext() {
  const ctx = useContext(PublicSearchContext);
  if (!ctx) throw new Error('usePublicSearchContext must be used within PublicSearchProvider');
  return ctx;
}
