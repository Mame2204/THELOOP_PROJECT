import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import {
  clearDemoSession,
  createDemoUser,
  DEMO_FREE_USER,
  DEMO_PARTNER_USER,
  DEMO_ADMIN_USER,
  DEMO_PRIME_USER,
  loadDemoSession,
  saveDemoSession,
} from '@/lib/demo-auth';
import { activatePrimeInvitation } from '@/lib/admin-store';
import type { PrimeActivationProfile, PrimePlan } from '@/types/prime';
import { generateQrCodeToken } from '@/lib/qr-token';
import { findTestAccountByIdentifier } from '@/lib/test-accounts';
import { DEV_MEMBER_PASSWORD, normalizePhone } from '@/lib/otp-auth';
import { emailVerificationRequiredMessage, validateSignupEmail } from '@/lib/email-auth';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { mapAuthUserFallback, mapDbUser, type AuthUserLike } from '@/lib/user-mapper';
import type { DbUser, MemberSignUpInput } from '@/types/user-db';
import { PASSWORD_HASH_AUTH_PLACEHOLDER, USER_PUBLIC_COLUMNS } from '@/types/user-db';
import type { User, UserRole } from '@/types';

export interface ProfileUpdateInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

interface AuthContextValue {
  user: User | null;
  role: UserRole;
  isLoading: boolean;
  signUpMember: (input: MemberSignUpInput) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithOtp: (identifier: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInDemo: () => Promise<void>;
  signInDemoAdmin: () => Promise<void>;
  signInDemoPartner: () => Promise<void>;
  signInDemoPrime: () => Promise<void>;
  activatePrimeMembership: (
    profile: PrimeActivationProfile,
    inviteToken: string,
    plan: PrimePlan,
  ) => Promise<void>;
  toggleDemoAuth: () => Promise<void>;
  updateProfile: (data: ProfileUpdateInput) => Promise<void>;
  simulatePrimeUpgrade: () => Promise<void>;
}

const ANONYMOUS_USER: User = {
  id: 'anonymous',
  email: null,
  firstName: null,
  lastName: null,
  fullName: null,
  phoneNumber: null,
  userRole: null,
  qrCodeToken: null,
  avatarUrl: null,
  role: 'USER_ANONYMOUS',
  company: null,
  jobTitle: null,
  sector: null,
  isDirectoryOptIn: false,
  countryCode: DEFAULT_COUNTRY_CODE,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadUser = useCallback(async (userId: string, authUser?: AuthUserLike) => {
    if (!supabase) return null;

    const { data: userRow, error } = await supabase
      .from('users')
      .select(USER_PUBLIC_COLUMNS)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.warn('[Auth] Lecture table users :', error.message);
    }

    if (userRow) {
      return mapDbUser(userRow as DbUser);
    }

    if (authUser) {
      return mapAuthUserFallback(authUser);
    }

    return null;
  }, []);

  const applySession = useCallback(async (session: { user: AuthUserLike } | null) => {
    if (!session?.user) {
      setUser((prev) => (prev?.id === ANONYMOUS_USER.id ? prev : ANONYMOUS_USER));
      return;
    }

    const dbUser = await loadUser(session.user.id, session.user);
    const next = dbUser ?? mapAuthUserFallback(session.user);
    setUser((prev) => {
      if (
        prev &&
        prev.id === next.id &&
        prev.role === next.role &&
        prev.userRole === next.userRole &&
        prev.updatedAt === next.updatedAt &&
        prev.firstName === next.firstName &&
        prev.lastName === next.lastName &&
        prev.email === next.email &&
        prev.phoneNumber === next.phoneNumber
      ) {
        return prev;
      }
      return next;
    });
  }, [loadUser]);

  const applySessionRef = useRef(applySession);
  applySessionRef.current = applySession;

  const setDemoUser = useCallback((demoUser: User) => {
    saveDemoSession(demoUser);
    setUser(demoUser);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      const saved = loadDemoSession();
      if (saved) {
        setUser(saved);
      } else {
        setUser(ANONYMOUS_USER);
      }
      setIsLoading(false);
      return;
    }

    let active = true;

    // Abonnement unique au montage. TOKEN_REFRESHED ne change pas le profil :
    // on ignore pour éviter de relancer SELECT users (et en cascade les favoris).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (!active) return;
        if (event === 'TOKEN_REFRESHED') {
          setIsLoading(false);
          return;
        }
        void applySessionRef.current(session).finally(() => {
          if (active) setIsLoading(false);
        });
      },
    );

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUpMember = useCallback(async (input: MemberSignUpInput) => {
    if (input.website?.trim()) {
      throw new Error('Inscription refusée.');
    }

    const emailCheck = validateSignupEmail(input.email);
    if (!emailCheck.ok) {
      throw new Error(emailCheck.message);
    }

    if (!isSupabaseConfigured() || !supabase) {
      setDemoUser(createDemoUser(emailCheck.email, input.firstName.trim(), input.lastName.trim(), input.phoneNumber ?? ''));
      return;
    }

    const normalizedPhone = input.phoneNumber?.trim()
      ? normalizePhone(input.phoneNumber, input.countryCode as import('@/lib/countries').CountryCode | undefined)
      : null;
    const countryCode = (input.countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase().slice(0, 2);
    const normalizedEmail = emailCheck.email;
    const qrCodeToken = generateQrCodeToken();
    const metadata = {
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      phone_number: normalizedPhone,
      country_code: countryCode,
      user_role: 'member',
      qr_code_token: qrCodeToken,
    };

    try {
      const { error: guardError } = await supabase.rpc('assert_signup_email_allowed', {
        p_email: normalizedEmail,
      });
      if (guardError) {
        if (guardError.message.includes('email_already_used')) {
          throw new Error('Cet e-mail est déjà utilisé.');
        }
        if (guardError.message.includes('signup_rate_limited')) {
          throw new Error('Trop de tentatives. Réessayez dans une heure.');
        }
      }

      const redirectTo =
        typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;

      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: input.password,
        options: {
          data: metadata,
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        console.error('Erreur Inscription:', error);
        throw error;
      }

      if (!data.session && data.user && !data.user.email_confirmed_at) {
        throw new Error(emailVerificationRequiredMessage());
      }

      if (data.user) {
        const { error: rpcError } = await supabase.rpc('ensure_user_profile', {
          p_first_name: metadata.first_name,
          p_last_name: metadata.last_name,
          p_phone: metadata.phone_number,
          p_user_role: metadata.user_role,
          p_qr_token: qrCodeToken,
        });

        if (rpcError) {
          console.warn('[Auth] RPC ensure_user_profile:', rpcError.message);
          const { error: userRowError } = await supabase.from('users').upsert({
            id: data.user.id,
            first_name: metadata.first_name,
            last_name: metadata.last_name,
            email: normalizedEmail,
            ...(metadata.phone_number != null ? { phone_number: metadata.phone_number } : {}),
            country_code: countryCode,
            user_role: metadata.user_role,
            qr_code_token: qrCodeToken,
            password_hash: PASSWORD_HASH_AUTH_PLACEHOLDER,
          });

          if (userRowError) {
            console.warn('[Auth] Upsert users:', userRowError.message);
          }
        }
      }

      if (data.session?.user) {
        await applySession({ user: data.session.user });
        return;
      }

      if (data.user) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: input.password,
        });
        if (!signInError && signInData.user) {
          await applySession({ user: signInData.user });
          return;
        }
        throw new Error(
          'Compte créé mais connexion impossible. Exécutez la migration 20260715 dans Supabase SQL Editor.',
        );
      }
    } catch (error) {
      console.error('Erreur Inscription:', error);
      throw error;
    }
  }, [applySession, setDemoUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured() || !supabase) {
      const local = email.split('@')[0];
      setDemoUser(createDemoUser(email, local, '', ''));
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (data.user) await applySession({ user: data.user });
  }, [applySession, setDemoUser]);

  const signInWithOtp = useCallback(async (identifier: string) => {
    const account = findTestAccountByIdentifier(identifier);
    if (account) {
      await signIn(account.email, account.password);
      return;
    }

    if (!isSupabaseConfigured() || !supabase) {
      const isEmail = identifier.includes('@');
      setDemoUser(
        createDemoUser(
          isEmail ? identifier : `${identifier.replace(/\D/g, '')}@theloop.gn`,
          'Nouveau',
          'Membre',
          identifier,
        ),
      );
      return;
    }

    const email = identifier.includes('@')
      ? identifier.trim().toLowerCase()
      : `${identifier.replace(/\D/g, '')}@theloop.gn`;

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: DEV_MEMBER_PASSWORD,
    });

    if (error) {
      if (error.message.toLowerCase().includes('invalid') || error.message.toLowerCase().includes('credentials')) {
        throw new Error('Compte inconnu. Créez un compte d\'abord.');
      }
      throw error;
    }

    if (data.user) await applySession({ user: data.user });
  }, [signIn, setDemoUser, applySession]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    clearDemoSession();
    setUser(ANONYMOUS_USER);
  }, []);

  const signInDemo = useCallback(async () => {
    if (isSupabaseConfigured()) return;
    setDemoUser({ ...DEMO_FREE_USER });
  }, [setDemoUser]);

  const signInDemoAdmin = useCallback(async () => {
    if (isSupabaseConfigured()) return;
    setDemoUser({ ...DEMO_ADMIN_USER });
  }, [setDemoUser]);

  const signInDemoPartner = useCallback(async () => {
    if (isSupabaseConfigured()) return;
    setDemoUser({ ...DEMO_PARTNER_USER });
  }, [setDemoUser]);

  const signInDemoPrime = useCallback(async () => {
    if (isSupabaseConfigured()) return;
    setDemoUser({ ...DEMO_PRIME_USER });
  }, [setDemoUser]);

  const activatePrimeMembership = useCallback(
    async (profile: PrimeActivationProfile, inviteToken: string, plan: PrimePlan) => {
      const expires = new Date();
      if (plan === 'monthly') expires.setMonth(expires.getMonth() + 1);
      else expires.setFullYear(expires.getFullYear() + 1);

      if (!isSupabaseConfigured() || !supabase) {
        const userId = `prime-${Date.now()}`;
        const member: User = {
          id: userId,
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          fullName: `${profile.firstName} ${profile.lastName}`.trim(),
          phoneNumber: profile.phone,
          userRole: 'prime',
          qrCodeToken: `prime-${userId}`,
          avatarUrl: null,
          role: 'USER_PRIME',
          company: profile.company,
          jobTitle: profile.jobTitle,
          sector: profile.sector,
          isDirectoryOptIn: true,
          subscriptionStatus: 'active',
          subscriptionExpiresAt: expires.toISOString(),
          primeInviteToken: inviteToken.toUpperCase(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        activatePrimeInvitation(inviteToken, userId, expires.toISOString());
        setDemoUser(member);
        return;
      }

      const updatedAt = new Date().toISOString();
      const current = user && user.id !== 'anonymous' ? user : null;

      if (current) {
        const upgraded: User = {
          ...current,
          userRole: 'prime',
          role: 'USER_PRIME',
          firstName: profile.firstName || current.firstName,
          lastName: profile.lastName || current.lastName,
          fullName: `${profile.firstName} ${profile.lastName}`.trim() || current.fullName,
          phoneNumber: profile.phone || current.phoneNumber,
          company: profile.company,
          jobTitle: profile.jobTitle,
          sector: profile.sector,
          isDirectoryOptIn: true,
          subscriptionStatus: 'active',
          subscriptionExpiresAt: expires.toISOString(),
          primeInviteToken: inviteToken.toUpperCase(),
          updatedAt,
        };

        const { error: userError } = await supabase.from('users').update({
          first_name: profile.firstName,
          last_name: profile.lastName,
          phone_number: profile.phone,
          user_role: 'prime',
          updated_at: updatedAt,
        }).eq('id', current.id);

        if (userError) throw userError;

        activatePrimeInvitation(inviteToken, current.id, expires.toISOString());
        setUser(upgraded);
        return;
      }

      throw new Error('Connectez-vous ou créez un compte avant d\'activer Loop Prime.');
    },
    [user, setDemoUser, setUser],
  );

  const toggleDemoAuth = useCallback(async () => {
    if (isSupabaseConfigured()) return;
    if (user?.role === 'USER_ANONYMOUS') {
      setDemoUser({ ...DEMO_FREE_USER });
    } else {
      clearDemoSession();
      setUser(ANONYMOUS_USER);
    }
  }, [user?.role, setDemoUser]);

  const updateProfile = useCallback(async (data: ProfileUpdateInput) => {
    if (!user || user.id === 'anonymous') return;

    const firstName = (data.firstName ?? user.firstName ?? '').trim();
    const lastName = (data.lastName ?? user.lastName ?? '').trim();
    const phoneNumber = data.phone ?? user.phoneNumber ?? '';
    const updatedAt = new Date().toISOString();

    const nextUser: User = {
      ...user,
      firstName: firstName || null,
      lastName: lastName || null,
      fullName: `${firstName} ${lastName}`.trim() || null,
      phoneNumber,
      updatedAt,
    };

    if (!isSupabaseConfigured() || !supabase) {
      saveDemoSession(nextUser);
      setUser(nextUser);
    } else {
      const { error } = await supabase.from('users').update({
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber,
        updated_at: updatedAt,
      }).eq('id', user.id);

      if (error) {
        console.error('[Auth] Mise à jour profil :', error);
        throw error;
      }

      setUser(nextUser);
    }
  }, [user]);

  const simulatePrimeUpgrade = useCallback(async () => {
    if (!user || user.role === 'USER_ANONYMOUS' || user.role === 'USER_PRIME') return;

    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    const updatedAt = new Date().toISOString();

    const upgraded: User = {
      ...user,
      userRole: 'prime',
      role: 'USER_PRIME',
      subscriptionStatus: 'active',
      subscriptionExpiresAt: expires.toISOString(),
      isDirectoryOptIn: true,
      company: user.company ?? 'Membre THE LOOP',
      jobTitle: user.jobTitle ?? 'Membre Prime',
      updatedAt,
    };

    if (!isSupabaseConfigured() || !supabase) {
      setDemoUser(upgraded);
      return;
    }

    const { error } = await supabase.from('users').update({
      user_role: 'prime',
      updated_at: updatedAt,
    }).eq('id', user.id);

    if (error) {
      console.error('[Auth] Upgrade Prime :', error);
      throw error;
    }

    setUser(upgraded);
  }, [user, setDemoUser, setUser]);

  const role: UserRole = user?.role ?? 'USER_ANONYMOUS';

  const value = useMemo(
    () => ({
      user,
      role,
      isLoading,
      signUpMember,
      signIn,
      signInWithOtp,
      signOut,
      signInDemo,
      signInDemoAdmin,
      signInDemoPartner,
      signInDemoPrime,
      activatePrimeMembership,
      toggleDemoAuth,
      updateProfile,
      simulatePrimeUpgrade,
    }),
    [user, role, isLoading, signUpMember, signIn, signInWithOtp, signOut, signInDemo, signInDemoAdmin, signInDemoPartner, signInDemoPrime, activatePrimeMembership, toggleDemoAuth, updateProfile, simulatePrimeUpgrade],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider');
  return ctx;
}
