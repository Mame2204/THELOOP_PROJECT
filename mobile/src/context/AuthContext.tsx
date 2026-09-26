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

import { Linking } from 'react-native';

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { undefinedIfNull } from '@/lib/supabase-types';
import { touchUserLastSeen } from '@/lib/user-activity';

import {

  clearDemoSession,

  createDemoUser,

  loadDemoSession,

  saveDemoSession,

} from '@/lib/demo-auth';

import { mapAuthUserFallback, mapDbUser, type AuthUserLike } from '@/lib/user-mapper';

import { generateQrCodeToken } from '@/lib/qr-token';

import type { DbUser, MemberSignUpInput } from '@/types/user-db';

import { PASSWORD_HASH_AUTH_PLACEHOLDER, USER_BASE_COLUMNS, USER_PUBLIC_COLUMNS } from '@/types/user-db';

import { DEV_MEMBER_PASSWORD, isPhoneIdentifier, normalizePhone, syntheticEmailFromPhone } from '@/lib/otp-auth';
import {
  buildAuthLoginEmailCandidates,
  resolveAuthLoginEmailCandidates,
} from '@/lib/auth-login';
import {
  emailVerificationRequiredMessage,
  normalizeEmail,
  validateSignupEmail,
} from '@/lib/email-auth';
import { completeAuthSessionFromUrl, describeAuthUrlParams, extractAuthParams } from '@/lib/auth-deep-link';
import { checkAdminInviteActivationEligibility } from '@/lib/admin-invite-store';
import { emitAuthFlowEvent } from '@/lib/auth-flow-events';
import {
  getAuthEmailRedirectUrl,
  getAuthMemberFacingRedirectUrl,
  assertAuthRedirectReadyForSignUp,
  logAuthRedirectConfig,
} from '@/lib/auth-redirect';
import { AuthEmailRateLimitError, parseAuthEmailRateLimit } from '@/lib/auth-email-errors';
import {
  checkSignupEmailAvailability,
  isDuplicateSignUpResponse,
  isSignUpEmailAlreadyUsedError,
  signupEmailAvailabilityMessage,
} from '@/lib/email-account';
import { upsertActiveSubscription, type PassPaymentMethod, type PurchasePassResult } from '@/lib/subscription-history';
import type { PrimeBillingPeriod } from '@/lib/prime-plans';
import { computeSubscriptionExpiry, primePlanLabel } from '@/lib/prime-plans';
import { purchasePrimePassWithSideEffects } from '@/lib/pass-purchase-store';
import { isPhoneNumberTaken } from '@/lib/phone-auth';
import {
  applyPendingPrimeRewards,
  ensureUserReferralCode,
  reconcileReferralRewardsForCurrentUser,
  registerNewMemberReferral,
} from '@/lib/referral-store';
import { upsertRegistryUserByIdentity, userToRegistryEntry } from '@/lib/user-registry-store';
import { enrichUserSession } from '@/lib/user-session-enrich';
import { sendWelcomeNotification } from '@/lib/user-notifications-store';
import { syncUserRoleBenefitEntitlements } from '@/lib/prime-benefits-store';
import { canonicalPhone } from '@/lib/phone-canonical';
import {
  DEFAULT_COUNTRY_CODE,
  isValidInternationalPhone,
  normalizeInternationalPhone,
  type PhoneDialCode,
} from '@/lib/countries';
import { isPhoneDeactivated } from '@/lib/deactivated-users-store';
import { applyPasswordResetAfterOtp } from '@/lib/admin-invite-store';
import { consumePasswordReset, findPendingPasswordReset } from '@/lib/password-reset-store';
import { isValidOtp } from '@/lib/otp-auth';
import { bootstrapPlatformRoles } from '@/lib/platform-roles-store';
import { clearPartnerSpotSession, loadPartnerSpotSession } from '@/lib/partner-session-store';
import {
  accountLoginBlockedMessage,
  isAccountAccessAllowedForSession,
  resolveAccountAccessStatus,
  type AccountAccessStatus,
} from '@/lib/account-access';

import type { User, UserRole } from '@/types';

export interface ProfileUpdateInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  city?: string;
  birthDate?: string | null;
  countryCode?: string;
  interestCountryCode?: string | null;
  company?: string;
  jobTitle?: string;
}



interface AuthContextValue {

  user: User | null;

  role: UserRole;

  isLoading: boolean;

  signUpMember: (input: MemberSignUpInput) => Promise<void>;

  signIn: (email: string, password: string) => Promise<void>;

  /** @deprecated Préférer signIn(email, password). Conservé pour comptes legacy téléphone. */
  signInWithPhone: (phone: string, password: string) => Promise<void>;

  signInWithOtp: (identifier: string) => Promise<void>;

  simulatePrimeUpgrade: (period: PrimeBillingPeriod) => Promise<void>;
  purchasePrimePass: (
    period: PrimeBillingPeriod,
    paymentMethod: PassPaymentMethod,
    countryCode?: import('@/lib/countries').CountryCode,
  ) => Promise<PurchasePassResult>;
  updateProfile: (data: ProfileUpdateInput) => Promise<void>;
  updateInterestCountry: (code: string | null) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  requestPasswordResetEmail: (email: string) => Promise<void>;
  /** Après lien recovery / invite : définit le nouveau mot de passe (session déjà ouverte). */
  completePasswordRecovery: (newPassword: string) => Promise<void>;
  /** True tant que l’utilisateur doit saisir un nouveau MDP (lien e-mail recovery/invite). */
  passwordRecoveryPending: boolean;
  resendSignupConfirmationEmail: (email: string) => Promise<void>;
  /** @deprecated Utiliser requestPasswordResetEmail */
  resetPasswordWithOtp: (phone: string, otp: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUserSession: () => Promise<void>;

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

  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(false);
  const passwordRecoveryPendingRef = useRef(false);
  const syncAuthUserProfileRef = useRef<(authUser: AuthUserLike) => Promise<void>>(async () => undefined);
  const fulfillPendingWelcomeRef = useRef<(authUser: AuthUserLike) => Promise<void>>(async () => undefined);

  const beginPasswordRecovery = useCallback(() => {
    passwordRecoveryPendingRef.current = true;
    setPasswordRecoveryPending(true);
    emitAuthFlowEvent('password_recovery');
  }, []);

  const endPasswordRecovery = useCallback(() => {
    passwordRecoveryPendingRef.current = false;
    setPasswordRecoveryPending(false);
  }, []);



  const loadUser = useCallback(async (userId: string, authUser?: AuthUserLike) => {

    if (!supabase) return null;

    let userRow: DbUser | Record<string, unknown> | null = null;

    const fullRes = await supabase
      .from('users')
      .select(`${USER_PUBLIC_COLUMNS}, account_status`)
      .eq('id', userId)
      .maybeSingle();

    if (fullRes.error) {
      console.warn('[Auth] Lecture profil (complet):', fullRes.error.message);
      const baseRes = await supabase
        .from('users')
        .select(`${USER_BASE_COLUMNS}, account_status`)
        .eq('id', userId)
        .maybeSingle();
      if (baseRes.error) console.warn('[Auth] Lecture profil (base):', baseRes.error.message);
      userRow = baseRes.data;
    } else {
      userRow = fullRes.data;
    }

    if (userRow) {
      const row = userRow as Record<string, unknown>;
      const access = resolveAccountAccessStatus({
        account_status: typeof row.account_status === 'string' ? row.account_status : null,
        is_active: row.is_active as boolean | undefined,
      });
      if (!isAccountAccessAllowedForSession(access)) {
        return null;
      }
      return mapDbUser(row);
    }

    if (authUser) return mapAuthUserFallback(authUser);

    return null;

  }, []);



  const finalizeUserSession = useCallback(async (baseUser: User): Promise<User> => {
    const enriched = await enrichUserSession(baseUser);
    const referralCode = await ensureUserReferralCode(enriched);
    let next: User = { ...enriched, referralCode };
    await upsertRegistryUserByIdentity(
      userToRegistryEntry(next, referralCode, next.referredByCode),
    );
    // Récompense parrainage : réconcilie côté cloud, puis file d’attente locale (démo).
    if (next.role !== 'ADMIN' && next.role !== 'PARTNER') {
      const grantedMonths = await reconcileReferralRewardsForCurrentUser();
      if (grantedMonths > 0) {
        next = await enrichUserSession(next);
      }
      const rewarded = await applyPendingPrimeRewards(next);
      if (rewarded) next = rewarded;
    }
    await syncUserRoleBenefitEntitlements(next);
    // Votes sondage anonymes de ce téléphone → compte
    if (next.id && next.id !== 'anonymous') {
      try {
        const { claimHomePollVotesForAccount } = await import('@/lib/home-poll-store');
        await claimHomePollVotesForAccount(next.id);
      } catch (err) {
        console.warn('[Auth] claim polls:', err instanceof Error ? err.message : err);
      }
    }
    return next;
  }, []);

  /**
   * Invalide les applySession en cours (ex. SIGNED_OUT retardé après un re-login).
   * Sans ça : session AsyncStorage OK mais UI restée sur Auth jusqu'au redémarrage.
   */
  const applyGenerationRef = useRef(0);
  /** > 0 pendant signInWithPassword — ignore les clears SIGNED_OUT concurrent. */
  const signInFlightRef = useRef(0);

  const applySession = useCallback(

    async (session: { user: AuthUserLike } | null) => {
      const generation = ++applyGenerationRef.current;
      const isStale = () => generation !== applyGenerationRef.current;

      let activeSession = session;

      if (!activeSession?.user) {
        // Ne pas effacer l'UI pendant une connexion en cours.
        if (signInFlightRef.current > 0) return;

        // Laisse passer le verrou auth Supabase avant getSession (évite deadlock).
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (isStale() || signInFlightRef.current > 0) return;

        if (supabase) {
          try {
            const { data } = await supabase.auth.getSession();
            if (isStale() || signInFlightRef.current > 0) return;
            if (data.session?.user) {
              // SIGNED_OUT périmé : une session plus récente existe déjà.
              activeSession = data.session;
            }
          } catch (err) {
            console.warn('[Auth] getSession (clear):', err instanceof Error ? err.message : err);
          }
        }

        if (!activeSession?.user) {
          const partnerSession = await loadPartnerSpotSession();
          if (isStale()) return;
          if (partnerSession) {
            setUser(partnerSession.user);
            setIsLoading(false);
            return;
          }

          setUser(ANONYMOUS_USER);
          setIsLoading(false);
          return;
        }
      }

      const dbUser = await loadUser(activeSession.user.id, activeSession.user);
      if (isStale()) return;

      if (!dbUser) {
        if (supabase) {
          const { data: statusRow } = await supabase
            .from('users')
            .select('is_active, account_status')
            .eq('id', activeSession.user.id)
            .maybeSingle();
          if (isStale()) return;
          const access = statusRow
            ? resolveAccountAccessStatus(statusRow)
            : 'deleted';
          if (!isAccountAccessAllowedForSession(access)) {
            // Différer signOut hors du callback auth pour éviter un verrou mort.
            const client = supabase;
            setTimeout(() => {
              void client?.auth.signOut();
            }, 0);
            setUser(ANONYMOUS_USER);
            setIsLoading(false);
            return;
          }
        }
      }

      const base = dbUser ?? mapAuthUserFallback(activeSession.user);
      if (isStale()) return;
      setUser((prev) => {
        if (
          prev &&
          prev.id === base.id &&
          prev.role === base.role &&
          prev.userRole === base.userRole &&
          prev.updatedAt === base.updatedAt &&
          prev.email === base.email &&
          prev.phoneNumber === base.phoneNumber
        ) {
          return prev;
        }
        return base;
      });
      setIsLoading(false);
      void touchUserLastSeen(base.id);
      void finalizeUserSession(base)
        .then((ready) => {
          if (generation !== applyGenerationRef.current) return;
          setUser((prev) => {
            if (
              prev &&
              prev.id === ready.id &&
              prev.role === ready.role &&
              prev.userRole === ready.userRole &&
              prev.updatedAt === ready.updatedAt &&
              prev.referralCode === ready.referralCode &&
              prev.email === ready.email &&
              prev.phoneNumber === ready.phoneNumber
            ) {
              return prev;
            }
            return ready;
          });
        })
        .catch((err) => {
          console.warn('[Auth] Enrichissement session:', err instanceof Error ? err.message : err);
        });

    },

    [loadUser, finalizeUserSession],

  );

  const applySessionRef = useRef(applySession);
  applySessionRef.current = applySession;



  const setDemoUser = useCallback(async (demoUser: User) => {
    setUser(demoUser);
    await saveDemoSession(demoUser);
    void finalizeUserSession(demoUser).then(async (ready) => {
      await saveDemoSession(ready);
      setUser(ready);
    });
  }, [finalizeUserSession]);



  useEffect(() => {

    void bootstrapPlatformRoles();

    if (!isSupabaseConfigured() || !supabase) {

      void loadDemoSession().then(async (saved) => {
        if (saved) {
          setUser(saved);
          setIsLoading(false);
          void finalizeUserSession(saved).then(setUser);
        } else {
          setUser(ANONYMOUS_USER);
          setIsLoading(false);
        }
      });

      return;

    }

    let active = true;
    const authClient = supabase;

    const runApply = async (session: Session | null) => {
      if (!active) return;
      await applySessionRef.current(session);
    };

    void authClient.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return;
        if (data.session) {
          await runApply(data.session);
          if (active) setIsLoading(false);
          return;
        }

        const partnerSession = await loadPartnerSpotSession();
        if (!active) return;
        if (partnerSession) {
          const { ensurePartnerSupabaseSession, requirePartnerAuthUserId } = await import(
            '@/lib/partner-spot-auth'
          );
          await ensurePartnerSupabaseSession();
          await requirePartnerAuthUserId(8000);
          const { data: restoredSession } = await authClient.auth.getSession();
          if (!active) return;
          if (restoredSession.session) {
            await runApply(restoredSession.session);
            if (active) setIsLoading(false);
            return;
          }
          setUser(partnerSession.user);
          setIsLoading(false);
          return;
        }

        setUser(ANONYMOUS_USER);
        setIsLoading(false);
      })
      .catch(async (err) => {
        console.warn('[Auth] getSession:', err instanceof Error ? err.message : err);
        if (!active) return;
        try {
          await authClient.auth.signOut();
        } catch {
          /* session corrompue — on continue sans compte (écran Auth) */
        }
        setUser(ANONYMOUS_USER);
        setIsLoading(false);
      });

    // Abonnement unique. Bootstrap = getSession ; listener = sign-in/out uniquement.
    // setTimeout(0) : ne pas appeler d'API auth synchronement dans le callback (deadlock GoTrue).
    const { data: sub } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (!active) return;
        if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
        if (event === 'PASSWORD_RECOVERY') {
          passwordRecoveryPendingRef.current = true;
          setPasswordRecoveryPending(true);
          emitAuthFlowEvent('password_recovery');
          setTimeout(() => {
            if (!active) return;
            void runApply(session);
          }, 0);
          return;
        }
        if (event === 'SIGNED_IN') {
          void import('@/lib/home-refresh').then((m) => m.emitHomeRefresh('auth-session'));
          setTimeout(() => {
            if (!active) return;
            void (async () => {
              await runApply(session);
              // Bienvenue : géré par completeAuthenticatedSignIn (évite double envoi).
            })();
          }, 0);
          return;
        }
        setTimeout(() => {
          if (!active) return;
          void runApply(session);
        }, 0);
      },
    );

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };

  }, [finalizeUserSession]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;

    logAuthRedirectConfig();

    const handleDeepLink = async (url: string | null) => {
      if (!url) return;

      if (url.includes('auth/login')) {
        endPasswordRecovery();
        try {
          await supabase.auth.signOut();
        } catch {
          /* session partielle — on continue vers Connexion */
        }
        emitAuthFlowEvent('goto_login');
        if (__DEV__) console.log('[Auth] deep link connexion (post-activation web)');
        return;
      }

      if (!url.includes('auth/callback')) return;
      const paramHint = describeAuthUrlParams(url);
      if (__DEV__) {
        console.log('[Auth] deep link reçu:', url.split('#')[0].split('?')[0], '|', paramHint);
      }
      const result = await completeAuthSessionFromUrl(url);
      if (result.ok && supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (result.kind === 'invite') {
            const email = data.session.user.email ?? '';
            const eligibility = email
              ? await checkAdminInviteActivationEligibility(email)
              : 'no_pending_invite';
            if (eligibility !== 'eligible') {
              endPasswordRecovery();
              try {
                await supabase.auth.signOut();
              } catch {
                /* ignore */
              }
              emitAuthFlowEvent('goto_login');
              if (__DEV__) {
                console.log('[Auth] invite déjà activée — écran Connexion', eligibility);
              }
              return;
            }
            beginPasswordRecovery();
            await applySessionRef.current(data.session);
            if (__DEV__) console.log('[Auth] invite — saisie nouveau mot de passe');
            return;
          }
          if (result.kind === 'recovery') {
            beginPasswordRecovery();
            // Ne pas appeler applySession ici : évite refresh / navigation qui invalident la session recovery.
            if (__DEV__) console.log('[Auth] recovery — saisie nouveau mot de passe');
            return;
          }
          await applySessionRef.current(data.session);
          await syncAuthUserProfileRef.current(data.session.user);
          await fulfillPendingWelcomeRef.current(data.session.user);
          if (__DEV__) console.log('[Auth] connecté via lien e-mail');
          void import('@/lib/home-refresh').then((m) => m.emitHomeRefresh('auth-session'));
          return;
        }
      }
      if (__DEV__ && paramHint === 'aucun paramètre') {
        console.log('[Auth] deep link sans tokens (rechargement Expo) — e-mail déjà confirmé ? Connectez-vous.');
      } else if (__DEV__) {
        console.warn('[Auth] lien non traité — connectez-vous manuellement si l’e-mail est confirmé');
      }
    };

    void Linking.getInitialURL().then((url) => void handleDeepLink(url));
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void handleDeepLink(url);
    });

    let appStateSub: { remove: () => void } | undefined;
    if (__DEV__) {
      const { AppState } = require('react-native');
      appStateSub = AppState.addEventListener('change', (state: string) => {
        if (state === 'active') logAuthRedirectConfig();
      });
    }

    return () => {
      subscription.remove();
      appStateSub?.remove();
    };
  }, [beginPasswordRecovery, endPasswordRecovery]);



  const signUpMember = useCallback(async (input: MemberSignUpInput) => {

    if (input.website?.trim()) {
      throw new Error('Inscription refusée.');
    }

    const emailCheck = validateSignupEmail(input.email);
    if (!emailCheck.ok) {
      throw new Error(emailCheck.message);
    }

    const normalizedEmail = emailCheck.email;

    if (!supabase) {
      const role = input.userRole ?? 'member';
      if (role !== 'member') {
        throw new Error('Connexion Supabase requise pour créer ce type de compte.');
      }

      const demoUser = createDemoUser(
        normalizedEmail,
        input.firstName,
        input.lastName,
        input.phoneNumber ?? '',
        input.birthDate,
      );
      const { referralCode } = await registerNewMemberReferral(demoUser, input.referralCode);

      await setDemoUser({ ...demoUser, referralCode });

      return;

    }

    const phoneRaw = input.phoneNumber?.trim() ?? '';
    const dial = (input.phoneDialCode ?? input.countryCode) as PhoneDialCode | undefined;
    const normalizedPhone = phoneRaw
      ? (isValidInternationalPhone(phoneRaw, dial)
        ? canonicalPhone(normalizeInternationalPhone(phoneRaw, dial ?? DEFAULT_COUNTRY_CODE))
        : null)
      : null;

    if (phoneRaw && !normalizedPhone) {
      throw new Error('Numéro de téléphone invalide.');
    }

    if (normalizedPhone) {
      const phoneTaken = await isPhoneNumberTaken(normalizedPhone);
      if (phoneTaken) {
        throw new Error('Ce numéro est déjà utilisé par un autre compte.');
      }
    }

    const emailStatus = await checkSignupEmailAvailability(normalizedEmail);
    if (emailStatus === 'already_registered') {
      throw new Error(signupEmailAvailabilityMessage('already_registered'));
    }
    if (emailStatus === 'pending_confirmation') {
      throw new Error(signupEmailAvailabilityMessage('pending_confirmation'));
    }
    if (emailStatus === 'invalid' || emailStatus === 'synthetic_blocked') {
      throw new Error(signupEmailAvailabilityMessage(emailStatus));
    }

    const { error: guardError } = await supabase.rpc('assert_signup_email_allowed', {
      p_email: normalizedEmail,
    });
    if (guardError) {
      const code = guardError.message;
      if (code.includes('email_already_used')) {
        throw new Error(signupEmailAvailabilityMessage('already_registered'));
      }
      if (code.includes('email_pending_confirmation')) {
        throw new Error(signupEmailAvailabilityMessage('pending_confirmation'));
      }
      if (code.includes('signup_rate_limited')) {
        throw new AuthEmailRateLimitError(
          'Limite THE LOOP atteinte : trop de tentatives d\'inscription pour cet e-mail. Réessayez dans 1 heure.',
          3600,
        );
      }
      if (code.includes('synthetic_email_blocked') || code.includes('email_invalid')) {
        throw new Error('Adresse e-mail non autorisée.');
      }
      throw new Error('Inscription impossible pour cet e-mail. Réessayez plus tard.');
    }

    const accountCountry = (input.countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase().slice(0, 2);
    const city = input.city?.trim() || null;

    const qrCodeToken = generateQrCodeToken();

    const metadata = {

      first_name: input.firstName.trim(),

      last_name: input.lastName.trim(),

      phone_number: normalizedPhone,

      country_code: accountCountry,

      city,

      birth_date: input.birthDate?.trim() || null,

      user_role: input.userRole ?? 'member',

      qr_code_token: qrCodeToken,

      referral_code: input.referralCode?.trim().toUpperCase() || null,

      pending_welcome: true,

    };



    assertAuthRedirectReadyForSignUp();
    const emailRedirectTo = getAuthEmailRedirectUrl();

    if (__DEV__) {
      console.log('[Auth] emailRedirectTo (Supabase Redirect URLs):', emailRedirectTo);
    }

    const { data, error } = await supabase.auth.signUp({

      email: normalizedEmail,

      password: input.password,

      options: {
        data: metadata,
        emailRedirectTo,
      },

    });

    if (error) {
      const rateLimit = parseAuthEmailRateLimit(error);
      if (rateLimit) throw rateLimit;
      if (isSignUpEmailAlreadyUsedError(error)) {
        throw new Error(signupEmailAvailabilityMessage('already_registered'));
      }
      throw error;
    }

    if (isDuplicateSignUpResponse(data.user)) {
      throw new Error(signupEmailAvailabilityMessage('already_registered'));
    }

    if (!data.session && data.user && !data.user.email_confirmed_at) {
      throw new Error(emailVerificationRequiredMessage());
    }



    const syncProfile = async (userId: string) => {

      if (!supabase) return;

      const { error: rpcError } = await supabase.rpc('ensure_user_profile', {

        p_first_name: metadata.first_name,

        p_last_name: metadata.last_name,

        p_phone: undefinedIfNull(metadata.phone_number),

        p_user_role: metadata.user_role,

        p_qr_token: undefinedIfNull(qrCodeToken),

      });

      if (rpcError) {

        console.warn('[Auth] RPC ensure_user_profile:', rpcError.message);

      }

      const { error: patchError } = await supabase.from('users').upsert({

        id: userId,

        first_name: metadata.first_name,

        last_name: metadata.last_name,

        email: normalizedEmail,

        ...(metadata.phone_number != null ? { phone_number: metadata.phone_number } : {}),

        country_code: accountCountry,

        city,

        birth_date: metadata.birth_date,

        user_role: metadata.user_role,

        qr_code_token: qrCodeToken,

        password_hash: PASSWORD_HASH_AUTH_PLACEHOLDER,

      }, { onConflict: 'id' });

      if (patchError) {

        console.warn('[Auth] Upsert profil (ville/pays):', patchError.message);

      }

    };



    if (data.session?.user) {

      await supabase.auth.updateUser({ data: { pending_welcome: null, referral_code: null } });

      await syncProfile(data.session.user.id);

      await applySession({ user: data.session.user });

      const current = await loadUser(data.session.user.id, data.session.user);

      if (current) {
        const { referredByCode } = await registerNewMemberReferral(current, input.referralCode);
        if (referredByCode && supabase) {
          await supabase.from('users').update({ referred_by_code: referredByCode }).eq('id', current.id);
        }
        const { processWelcomeAutomationForUser } = await import('@/lib/admin-automation-runner');
        const welcomed = await processWelcomeAutomationForUser(current);
        if (welcomed === 0) await sendWelcomeNotification(current);
      }

      return;

    }



    if (data.user) {

      await syncProfile(data.user.id);



      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({

        email: normalizedEmail,

        password: input.password,

      });

      if (!signInError && signInData.user) {

        await applySession({ user: signInData.user });

        const current = await loadUser(signInData.user.id, signInData.user);

        if (current) {
          const { referredByCode } = await registerNewMemberReferral(current, input.referralCode);
          if (referredByCode && supabase) {
            await supabase.from('users').update({ referred_by_code: referredByCode }).eq('id', current.id);
          }
          const { processWelcomeAutomationForUser } = await import('@/lib/admin-automation-runner');
          const welcomed = await processWelcomeAutomationForUser(current);
          if (welcomed === 0) await sendWelcomeNotification(current);
        }

        return;

      }

      throw new Error(

        'Compte créé mais connexion impossible. Exécutez la migration 20260715 dans Supabase SQL Editor.',

      );

    }

  }, [applySession, setDemoUser, loadUser]);



  const welcomeDoneIdsRef = useRef(new Set<string>());

  const syncAuthUserProfile = useCallback(async (authUser: AuthUserLike): Promise<void> => {
    if (!supabase) return;
    const md = authUser.user_metadata ?? {};
    const { error } = await supabase.rpc('ensure_user_profile', {
      p_first_name: typeof md.first_name === 'string' ? md.first_name : 'Membre',
      p_last_name: typeof md.last_name === 'string' ? md.last_name : 'THE LOOP',
      p_phone: typeof md.phone_number === 'string' ? md.phone_number : undefined,
      p_user_role: typeof md.user_role === 'string' ? md.user_role : 'member',
      p_qr_token: typeof md.qr_code_token === 'string' ? md.qr_code_token : undefined,
    });
    if (error) console.warn('[Auth] ensure_user_profile:', error.message);
  }, []);
  syncAuthUserProfileRef.current = syncAuthUserProfile;

  const loadUserAfterAuth = useCallback(
    async (authUser: AuthUserLike, attempts = 4): Promise<Awaited<ReturnType<typeof loadUser>>> => {
      for (let i = 0; i < attempts; i += 1) {
        await syncAuthUserProfile(authUser);
        const current = await loadUser(authUser.id, authUser);
        if (current) return current;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      return null;
    },
    [loadUser, syncAuthUserProfile],
  );

  const fulfillPendingWelcome = useCallback(async (authUser: AuthUserLike) => {
    if (!supabase) return;
    if (authUser.user_metadata?.pending_welcome !== true) return;
    if (welcomeDoneIdsRef.current.has(authUser.id)) return;
    welcomeDoneIdsRef.current.add(authUser.id);

    try {
      await supabase.auth.updateUser({
        data: { pending_welcome: null, referral_code: null },
      });
    } catch {
      welcomeDoneIdsRef.current.delete(authUser.id);
      return;
    }

    const current = await loadUserAfterAuth(authUser);
    if (!current) {
      welcomeDoneIdsRef.current.delete(authUser.id);
      return;
    }

    const pendingReferral =
      typeof authUser.user_metadata?.referral_code === 'string'
        ? authUser.user_metadata.referral_code
        : null;
    if (pendingReferral) {
      const { referredByCode } = await registerNewMemberReferral(current, pendingReferral);
      if (referredByCode) {
        await supabase.from('users').update({ referred_by_code: referredByCode }).eq('id', current.id);
      }
    }

    try {
      const { processWelcomeAutomationForUser } = await import('@/lib/admin-automation-runner');
      const welcomed = await processWelcomeAutomationForUser(current);
      if (welcomed === 0) await sendWelcomeNotification(current);
    } catch (err) {
      console.warn('[Auth] welcome:', err);
      try {
        await sendWelcomeNotification(current);
      } catch {
        /* ignore */
      }
    }
  }, [loadUserAfterAuth]);

  fulfillPendingWelcomeRef.current = fulfillPendingWelcome;

  const completeAuthenticatedSignIn = useCallback(async (authUser: AuthUserLike) => {
    if (!supabase) return;
    const { data: statusRow } = await supabase
      .from('users')
      .select('is_active, account_status')
      .eq('id', authUser.id)
      .maybeSingle();
    const access = statusRow ? resolveAccountAccessStatus(statusRow) : 'deleted';
    if (access === 'invited') {
      await supabase.auth.signOut();
      throw new Error(accountLoginBlockedMessage('invited'));
    }
    if (access !== 'active') {
      await supabase.auth.signOut();
      throw new Error(accountLoginBlockedMessage(access));
    }
    await clearPartnerSpotSession();
    await applySession({ user: authUser });
    await fulfillPendingWelcomeRef.current(authUser);
  }, [applySession]);

  const signInWithPasswordCandidates = useCallback(
    async (candidates: string[], password: string) => {
      if (!supabase) return;
      signInFlightRef.current += 1;
      try {
        let lastError: Error | null = null;
        for (const candidate of candidates) {
          const { data, error } = await supabase.auth.signInWithPassword({ email: candidate, password });
          if (!error && data.user) {
            await completeAuthenticatedSignIn(data.user);
            return;
          }
          lastError = error ?? new Error('Connexion impossible.');
          if (error?.message?.includes('Email not confirmed')) {
            throw new Error(
              'E-mail non confirmé. Ouvrez le lien reçu par e-mail pour activer votre compte, puis reconnectez-vous.',
            );
          }
        }
        if (lastError?.message?.includes('Email not confirmed')) {
          throw new Error(
            'E-mail non confirmé. Ouvrez le lien reçu par e-mail pour activer votre compte, puis reconnectez-vous.',
          );
        }
        throw lastError ?? new Error('Identifiants incorrects.');
      } finally {
        signInFlightRef.current = Math.max(0, signInFlightRef.current - 1);
      }
    },
    [completeAuthenticatedSignIn],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const normalizedEmail = normalizeEmail(email);

    if (!supabase) {
      const local = normalizedEmail.split('@')[0];
      await setDemoUser(createDemoUser(normalizedEmail, local, '', ''));
      return;
    }

    const candidates = await resolveAuthLoginEmailCandidates(supabase, normalizedEmail);
    await signInWithPasswordCandidates(candidates.length ? candidates : [normalizedEmail], password);
  }, [setDemoUser, signInWithPasswordCandidates]);

  const signInWithPhone = useCallback(async (phone: string, password: string) => {
    if (!isPhoneIdentifier(phone)) {
      throw new Error('Numéro de téléphone invalide.');
    }

    const normalized = canonicalPhone(phone);

    if (!supabase) {
      if (await isPhoneDeactivated(normalized)) {
        throw new Error(accountLoginBlockedMessage('suspended'));
      }
      await setDemoUser(createDemoUser(syntheticEmailFromPhone(normalized), 'Membre', 'Demo', normalized));
      return;
    }

    const { data: userRow, error } = await supabase
      .from('users')
      .select('email, is_active, account_status')
      .eq('phone_number', normalized)
      .maybeSingle();

    if (error) throw error;

    if (!userRow?.email) {
      throw new Error('Compte introuvable. Créez un compte d\'abord.');
    }

    const access = resolveAccountAccessStatus(userRow);
    if (!isAccountAccessAllowedForSession(access)) {
      throw new Error(accountLoginBlockedMessage(access));
    }

    const candidates = buildAuthLoginEmailCandidates(userRow.email, normalized);
    await signInWithPasswordCandidates(candidates, password);
  }, [signInWithPasswordCandidates, setDemoUser]);



  const signInWithOtp = useCallback(async (identifier: string) => {

    if (!supabase) {

      const phone = isPhoneIdentifier(identifier) ? normalizePhone(identifier) : identifier.trim();

      await setDemoUser(

        createDemoUser(

          isPhoneIdentifier(identifier) ? syntheticEmailFromPhone(phone) : identifier.trim().toLowerCase(),

          'Nouveau',

          'Membre',

          phone,

        ),

      );

      return;

    }



    let email = identifier.includes('@')

      ? identifier.trim().toLowerCase()

      : syntheticEmailFromPhone(normalizePhone(identifier));



    if (isPhoneIdentifier(identifier)) {

      const phone = normalizePhone(identifier);

      const { data: userRow } = await supabase

        .from('users')

        .select('email, is_active, account_status')

        .eq('phone_number', phone)

        .maybeSingle();

      if (!userRow?.email) {
        throw new Error('Compte introuvable. Créez un compte d\'abord.');
      }

      const access = resolveAccountAccessStatus(userRow);
      if (!isAccountAccessAllowedForSession(access)) {
        throw new Error(accountLoginBlockedMessage(access));
      }

      const candidates = buildAuthLoginEmailCandidates(userRow.email, phone);
      signInFlightRef.current += 1;
      try {
        let lastError: Error | null = null;
        for (const candidate of candidates) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: candidate,
            password: DEV_MEMBER_PASSWORD,
          });
          if (!error && data.user) {
            await completeAuthenticatedSignIn(data.user);
            return;
          }
          lastError = error ?? new Error('Connexion impossible.');
        }
        if (lastError?.message.toLowerCase().includes('invalid') || lastError?.message.toLowerCase().includes('credentials')) {
          throw new Error('Compte inconnu. Créez un compte d\'abord.');
        }
        throw lastError ?? new Error('Compte inconnu. Créez un compte d\'abord.');
      } finally {
        signInFlightRef.current = Math.max(0, signInFlightRef.current - 1);
      }
    }

    signInFlightRef.current += 1;
    try {
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

      if (data.user) {
        const { data: statusRow } = await supabase
          .from('users')
          .select('is_active, account_status')
          .eq('id', data.user.id)
          .maybeSingle();
        const access = statusRow
          ? resolveAccountAccessStatus(statusRow)
          : 'deleted';
        if (!isAccountAccessAllowedForSession(access)) {
          await supabase.auth.signOut();
          throw new Error(accountLoginBlockedMessage(access));
        }
        await applySession({ user: data.user });
      }
    } finally {
      signInFlightRef.current = Math.max(0, signInFlightRef.current - 1);
    }

  }, [setDemoUser, applySession, completeAuthenticatedSignIn]);



  const simulatePrimeUpgrade = useCallback(async (period: PrimeBillingPeriod) => {

    if (!user || user.role === 'USER_ANONYMOUS' || user.role === 'USER_PRIME') return;

    const expiresAt = computeSubscriptionExpiry(period);
    const planLabel = primePlanLabel(period);

    const upgraded: User = {

      ...user,

      userRole: 'prime',

      role: 'USER_PRIME',

      subscriptionStatus: 'active',

      subscriptionExpiresAt: expiresAt,

      isDirectoryOptIn: true,

      updatedAt: new Date().toISOString(),

    };



    if (!supabase) {

      await setDemoUser(upgraded);
      await syncUserRoleBenefitEntitlements(upgraded);

      await upsertActiveSubscription(user.id, {

        type: 'prime',

        status: 'active',

        startedAt: new Date().toISOString(),

        expiresAt,

        label: planLabel,

      });

      return;

    }



    const { error } = await supabase.from('users').update({

      user_role: 'prime',

      updated_at: upgraded.updatedAt,

    }).eq('id', user.id);

    if (error) throw error;

    setUser(upgraded);
    await syncUserRoleBenefitEntitlements(upgraded);

    await upsertActiveSubscription(user.id, {
      type: 'prime',
      status: 'active',
      startedAt: new Date().toISOString(),
      expiresAt,
      label: planLabel,
    });

  }, [user, setDemoUser]);



  const updateProfile = useCallback(async (data: ProfileUpdateInput) => {

    if (!user || user.id === 'anonymous') return;

    const firstName = (data.firstName ?? user.firstName ?? '').trim();

    const lastName = (data.lastName ?? user.lastName ?? '').trim();

    const phoneNumber =
      data.phone !== undefined
        ? (data.phone.trim() || null)
        : (user.phoneNumber?.trim() || null);

    const company = data.company !== undefined ? (data.company.trim() || null) : user.company;

    const jobTitle = data.jobTitle !== undefined ? (data.jobTitle.trim() || null) : user.jobTitle;

    const city = data.city !== undefined ? (data.city.trim() || null) : (user.city ?? null);
    const birthDate = data.birthDate !== undefined ? (data.birthDate?.trim() || null) : (user.birthDate ?? null);
    const countryCode = user.countryCode ?? DEFAULT_COUNTRY_CODE;
    const previousInterest = user.interestCountryCode ?? null;
    const interestCountryCode =
      previousInterest && previousInterest.toUpperCase().slice(0, 2) !== countryCode.toUpperCase().slice(0, 2)
        ? previousInterest
        : null;

    const updatedAt = new Date().toISOString();

    const nextUser: User = {

      ...user,

      firstName: firstName || null,

      lastName: lastName || null,

      fullName: `${firstName} ${lastName}`.trim() || null,

      phoneNumber,

      city,

      birthDate,

      countryCode,

      interestCountryCode,

      company,

      jobTitle,

      updatedAt,

    };

    setUser(nextUser);

    if (!supabase) {
      await saveDemoSession(nextUser);
      return;
    }

    const { error } = await supabase.from('users').update({
      first_name: firstName,
      last_name: lastName,
      phone_number: phoneNumber,
      city,
      birth_date: birthDate,
      country_code: countryCode,
      interest_country_code: interestCountryCode,
      company: company,
      job_title: jobTitle,
      updated_at: updatedAt,
    }).eq('id', user.id);

    if (error) {
      setUser(user);
      throw error;
    }

    if (supabase) {
      const { error: metaErr } = await supabase.auth.updateUser({
        data: {
          first_name: firstName || null,
          last_name: lastName || null,
          phone_number: phoneNumber,
        },
      });
      if (metaErr) {
        console.warn('[Auth] sync profil → user_metadata:', metaErr.message);
      }
    }

  }, [user, setDemoUser]);

  const updateInterestCountry = useCallback(async (code: string | null) => {
    if (!user || user.id === 'anonymous') return;

    const normalized = code?.toUpperCase().slice(0, 2) ?? null;
    const account = (user.countryCode ?? DEFAULT_COUNTRY_CODE).toUpperCase().slice(0, 2);
    const interestCountryCode = normalized && normalized !== account ? normalized : null;
    const updatedAt = new Date().toISOString();

    const nextUser: User = {
      ...user,
      interestCountryCode,
      updatedAt,
    };

    if (!supabase) {
      await setDemoUser(nextUser);
      return;
    }

    const { error } = await supabase.from('users').update({
      interest_country_code: interestCountryCode,
      updated_at: updatedAt,
    }).eq('id', user.id);

    if (error) throw error;
    setUser(nextUser);
  }, [user, setDemoUser]);



  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!supabase || !user?.email) {
      throw new Error('Changement de mot de passe indisponible en mode démo.');
    }

    signInFlightRef.current += 1;
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) throw new Error('Mot de passe actuel incorrect.');

      const { error } = await supabase.auth.updateUser({ password: newPassword });

      if (error) {
        const rateLimit = parseAuthEmailRateLimit(error);
        if (rateLimit) throw rateLimit;
        throw error;
      }
    } finally {
      signInFlightRef.current = Math.max(0, signInFlightRef.current - 1);
    }
  }, [user?.email]);



  const requestPasswordResetEmail = useCallback(async (email: string) => {
    const check = validateSignupEmail(email);
    if (!check.ok) {
      throw new Error(check.message);
    }
    if (!supabase) {
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(check.email, {
      redirectTo: getAuthMemberFacingRedirectUrl(),
    });
    if (error) {
      const rateLimit = parseAuthEmailRateLimit(error);
      if (rateLimit) throw rateLimit;
      throw error;
    }
  }, []);

  const completePasswordRecovery = useCallback(async (newPassword: string) => {
    if (!supabase) {
      throw new Error('Connexion Supabase requise.');
    }
    if (newPassword.trim().length < 8) {
      throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
    }
    const activeSession = (await supabase.auth.getSession()).data.session;
    if (!activeSession) {
      throw new Error(
        'Lien expiré ou session perdue. Demandez un nouvel e-mail, ouvrez-le sur ce téléphone et choisissez « Ouvrir l’application » avant « Continuer sur le web ».',
      );
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
    if (error) {
      const msg = error.message ?? '';
      if (/session_id|session from/i.test(msg)) {
        throw new Error(
          'Ce lien a déjà été utilisé ou a expiré. Demandez un nouvel e-mail de réinitialisation, puis ouvrez-le dans l’app via « Ouvrir l’application ».',
        );
      }
      throw new Error(msg || 'Impossible d’enregistrer le nouveau mot de passe.');
    }
    endPasswordRecovery();
    await applySessionRef.current(activeSession);
    await fulfillPendingWelcomeRef.current(activeSession.user);
    // Marquer invitation admin si présente
    const email = activeSession.user.email;
    if (email) {
      try {
        const { findPendingInviteByEmail, markInviteActivated } = await import('@/lib/admin-invite-store');
        const invite = await findPendingInviteByEmail(email);
        if (invite) await markInviteActivated(invite.id, email);
      } catch {
        /* ignore */
      }
    }
  }, [endPasswordRecovery]);

  const resendSignupConfirmationEmail = useCallback(async (email: string) => {
    const check = validateSignupEmail(email);
    if (!check.ok) {
      throw new Error(check.message);
    }
    if (!supabase) {
      throw new Error('Connexion Supabase requise.');
    }
    assertAuthRedirectReadyForSignUp();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: check.email,
      options: { emailRedirectTo: getAuthEmailRedirectUrl() },
    });
    if (error) {
      const rateLimit = parseAuthEmailRateLimit(error);
      if (rateLimit) throw rateLimit;
      throw error;
    }
  }, []);

  const resetPasswordWithOtp = useCallback(async (phone: string, otp: string, newPassword: string) => {
    if (!isValidOtp(otp)) {
      throw new Error('Code OTP incorrect.');
    }
    const pending = await findPendingPasswordReset(phone);
    if (!pending) {
      throw new Error('Code expiré ou demande introuvable. Relancez « Mot de passe oublié » pour recevoir un nouveau OTP.');
    }
    const res = await applyPasswordResetAfterOtp(phone, newPassword);
    if (!res.ok) {
      throw new Error(res.error ?? 'Réinitialisation impossible.');
    }
    await consumePasswordReset(phone);
  }, []);



  const purchasePrimePass = useCallback(
    async (
      period: PrimeBillingPeriod,
      paymentMethod: PassPaymentMethod,
      countryCode?: import('@/lib/countries').CountryCode,
    ): Promise<PurchasePassResult> => {
      if (!user || user.id === 'anonymous') {
        throw new Error('Connexion requise');
      }
      const result = await purchasePrimePassWithSideEffects(
        user.id,
        period,
        paymentMethod,
        user.firstName,
        countryCode,
      );
      if (result.activated) {
        const upgraded: User = {
          ...user,
          userRole: 'prime',
          role: 'USER_PRIME',
          subscriptionStatus: 'active',
          subscriptionExpiresAt: result.activated.expiresAt,
          isDirectoryOptIn: true,
          primeRoleLocked: false,
          updatedAt: new Date().toISOString(),
        };
        if (!supabase) {
          await setDemoUser(upgraded);
        } else {
          const ready = await finalizeUserSession(upgraded);
          setUser(ready);
          await saveDemoSession(ready).catch(() => undefined);
        }
      }
      return result;
    },
    [user, setDemoUser, finalizeUserSession],
  );

  const signOut = useCallback(async () => {
    // Invalide tout applySession en vol (évite de réinjecter l'ancien user après logout).
    applyGenerationRef.current += 1;
    endPasswordRecovery();
    const { invalidateAppSectionsCache } = await import('@/lib/app-sections-store');
    invalidateAppSectionsCache();
    const { invalidateEnabledContentCountriesCache } = await import('@/lib/content-countries-store');
    invalidateEnabledContentCountriesCache();
    await clearPartnerSpotSession();
    try {
      const { unregisterPushTokenForDevice } = await import('@/lib/push-notifications');
      await unregisterPushTokenForDevice();
    } catch {
      /* ignore */
    }
    if (supabase) await supabase.auth.signOut();
    await clearDemoSession();
    setUser(ANONYMOUS_USER);
  }, [endPasswordRecovery]);

  const refreshUserSession = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      const saved = await loadDemoSession();
      if (saved) setUser(await finalizeUserSession(saved));
      return;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[Auth] refreshUserSession:', error.message);
      return;
    }
    await applySession(data.session);
  }, [applySession, finalizeUserSession]);



  const value = useMemo<AuthContextValue>(

    () => ({

      user,

      role: user?.role ?? 'USER_ANONYMOUS',

      isLoading,

      passwordRecoveryPending,

      signUpMember,

      signIn,

      signInWithPhone,

      signInWithOtp,


      simulatePrimeUpgrade,

      purchasePrimePass,

      updateProfile,

      updateInterestCountry,

      changePassword,

      requestPasswordResetEmail,

      completePasswordRecovery,

      resendSignupConfirmationEmail,

      resetPasswordWithOtp,

      signOut,

      refreshUserSession,

    }),

    [user, isLoading, passwordRecoveryPending, signUpMember, signIn, signInWithPhone, signInWithOtp, simulatePrimeUpgrade, purchasePrimePass, updateProfile, updateInterestCountry, changePassword, requestPasswordResetEmail, completePasswordRecovery, resendSignupConfirmationEmail, resetPasswordWithOtp, signOut, refreshUserSession],
  );



  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

}



export function useAuthContext() {

  const ctx = useContext(AuthContext);

  if (!ctx) throw new Error('useAuthContext requires AuthProvider');

  return ctx;

}


