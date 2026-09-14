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
import { isAnyAdminUser } from '../lib/permissions';

export interface AdminProfile {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  countryCode: string | null;
}

interface AuthContextValue {
  loading: boolean;
  profile: AdminProfile | null;
  authError: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data: row, error } = await supabase
      .from('users')
      .select('id, email, user_role, first_name, last_name, is_active, country_code')
      .eq('id', user.id)
      .maybeSingle();

    if (
      error ||
      !row ||
      !row.is_active ||
      !isAnyAdminUser(row.user_role)
    ) {
      await supabase.auth.signOut();
      setProfile(null);
      setAuthError('Compte administrateur requis.');
      setLoading(false);
      return;
    }

    setProfile({
      id: row.id,
      email: row.email ?? user.email ?? '',
      role: row.user_role,
      firstName: row.first_name,
      lastName: row.last_name,
      countryCode: (row as { country_code?: string | null }).country_code ?? null,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void bootstrap();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void bootstrap();
    });
    return () => sub.subscription.unsubscribe();
  }, [bootstrap]);

  const login = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) setAuthError(error.message);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      loading,
      profile,
      authError,
      login,
      logout,
      clearError: () => setAuthError(null),
    }),
    [loading, profile, authError, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth hors AuthProvider');
  return ctx;
}
