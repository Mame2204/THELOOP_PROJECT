import { useLayoutEffect, useState, useEffect, useRef } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GuineaLocationPicker } from '@/components/GuineaLocationPicker';
import { CountrySelectField } from '@/components/CountrySelectField';
import { DateTimeField } from '@/components/DateTimeField';
import { InternationalPhoneField } from '@/components/InternationalPhoneField';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { LegalPreviewModal } from '@/components/LegalPreviewModal';
import { formatLegalBodyForDisplay } from '@/lib/legal-display';
import { LoopLogo } from '@/components/LoopLogo';
import { PasswordInput } from '@/components/PasswordInput';
import { useAuthContext } from '@/context/AuthContext';
import { useAppGates } from '@/context/AppGatesContext';
import { useContentCountries } from '@/context/ContentCountriesContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import {
  checkSignupEmailAvailability,
  isSignUpEmailAlreadyUsedError,
  signupEmailAvailabilityMessage,
} from '@/lib/email-account';
import {
  AuthEmailRateLimitError,
  formatResendCooldown,
  parseAuthEmailRateLimit,
  resolveAuthEmailErrorMessage,
} from '@/lib/auth-email-errors';
import {
  accountCountryHint,
  isEmailVerificationRequiredError,
  normalizeEmail,
  validateSignupEmail,
  validateSignupPassword,
} from '@/lib/email-auth';
import { isValidReferralCode } from '@/lib/referral-store';
import { DEFAULT_COUNTRY_CODE, getCountryLabel, isValidInternationalPhone, normalizeInternationalPhone, type CountryCode, type PhoneDialCode } from '@/lib/countries';
import {
  checkAdminInviteActivationEligibility,
  findPendingInviteByEmail,
  activateInvitedMemberAccount,
} from '@/lib/admin-invite-store';
import { resolveInviteDisplayName } from '@/lib/invite-default-names';
import { accountExistsForEmail } from '@/lib/email-account';
import {
  isWrongPasswordLoginError,
  precheckLoginEmail,
} from '@/lib/auth-login';
import { getLegalContent, type LegalContentKey } from '@/lib/legal-content-store';
import { COMMUNITY_PARTNERSHIP_CTA } from '@/lib/community-copy';
import { extractAuthParams } from '@/lib/auth-deep-link';
import { subscribeAuthFlowEvent } from '@/lib/auth-flow-events';
import { resetToAccueil } from '@/lib/navigation-utils';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Auth'>;

type AuthMode = 'login' | 'signup' | 'activate' | 'reset' | 'set_password';
type SignupStep = 'form' | 'verify_email';

const MIN_PASSWORD_LENGTH = 8;

function FieldLabel({
  children,
  required,
  color,
}: {
  children: string;
  required?: boolean;
  color: string;
}) {
  return (
    <Text style={[styles.fieldLabel, { color }]}>
      {children}
      {required ? <Text style={styles.required}> *</Text> : null}
    </Text>
  );
}

export function AuthScreen({ navigation, route }: Props) {
  const {
    signIn,
    signUpMember,
    requestPasswordResetEmail,
    resendSignupConfirmationEmail,
    completePasswordRecovery,
    passwordRecoveryPending,
  } = useAuthContext();
  const { shell } = useMemberTheme();
  const { enabledCountries } = useContentCountries();
  const { gates } = useAppGates();
  const signupEnabled = gates.signupEnabled;

  const initialMode: AuthMode =
    route.params?.mode === 'signup' && signupEnabled
      ? 'signup'
      : route.params?.mode === 'activate'
        ? 'activate'
        : route.params?.mode === 'reset'
          ? 'reset'
          : route.params?.mode === 'set_password' || passwordRecoveryPending
            ? 'set_password'
            : 'login';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [signupStep, setSignupStep] = useState<SignupStep>('form');

  useEffect(() => {
    if (!signupEnabled && mode === 'signup') {
      setMode('login');
      setSignupStep('form');
    }
  }, [signupEnabled, mode]);

  useEffect(() => {
    if (route.params?.mode === 'set_password' || passwordRecoveryPending) {
      setMode('set_password');
      setSignupStep('form');
    } else if (route.params?.mode === 'signup' && !signupEnabled) {
      setMode('login');
      setSignupStep('form');
    } else if (route.params?.mode) {
      setMode(route.params.mode);
    }
  }, [route.params?.mode, passwordRecoveryPending, signupEnabled]);

  useEffect(() => {
    return subscribeAuthFlowEvent((event) => {
      if (event === 'password_recovery') {
        setMode('set_password');
        setSignupStep('form');
      }
      if (event === 'goto_login') {
        setMode('login');
        setSignupStep('form');
        void Linking.getInitialURL().then((url) => {
          if (!url?.includes('auth/login')) return;
          const fromUrl = extractAuthParams(url).email;
          if (fromUrl) setEmail(normalizeEmail(fromUrl));
        });
      }
    });
  }, []);

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [accountCountry, setAccountCountry] = useState<CountryCode>(DEFAULT_COUNTRY_CODE);
  const [phoneDialCode, setPhoneDialCode] = useState<PhoneDialCode>(DEFAULT_COUNTRY_CODE);
  const [city, setCity] = useState('');
  const [websiteHoneypot, setWebsiteHoneypot] = useState('');

  useEffect(() => {
    if (!enabledCountries.length) return;
    setAccountCountry((current) =>
      enabledCountries.includes(current) ? current : enabledCountries[0],
    );
  }, [enabledCountries]);

  function handleAccountCountryChange(code: CountryCode) {
    setAccountCountry(code);
    setCity('');
    setPhoneDialCode(code);
  }
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptedCgu, setAcceptedCgu] = useState(false);
  const [legalPreviewKey, setLegalPreviewKey] = useState<LegalContentKey | null>(null);
  const [legalPreviewTitle, setLegalPreviewTitle] = useState('');
  const [legalPreviewBody, setLegalPreviewBody] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [emailRateLimitInfo, setEmailRateLimitInfo] = useState<string | null>(null);
  const lastLogoTapRef = useRef(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  function applyEmailRateLimit(err: unknown): boolean {
    const rateLimit =
      err instanceof AuthEmailRateLimitError ? err : parseAuthEmailRateLimit(err);
    if (!rateLimit) return false;
    setEmailRateLimitInfo(rateLimit.message);
    setResendCooldown((current) => Math.max(current, rateLimit.retryAfterSeconds));
    return true;
  }

  async function handleResendConfirmationEmail() {
    const emailCheck = validateSignupEmail(email);
    if (!emailCheck.ok) {
      Alert.alert('E-mail requis', emailCheck.message);
      return;
    }
    setLoading(true);
    try {
      await resendSignupConfirmationEmail(emailCheck.email);
      setEmailRateLimitInfo(null);
      setResendCooldown(60);
      Alert.alert(
        'E-mail renvoyé',
        'Un nouveau lien de confirmation THE LOOP vient de vous être envoyé. Pensez à vérifier vos spams.',
      );
    } catch (err) {
      if (applyEmailRateLimit(err)) {
        Alert.alert('Limite d\'envoi THE LOOP', resolveAuthEmailErrorMessage(err, 'Impossible de renvoyer l\'e-mail pour le moment.'));
        return;
      }
      Alert.alert('Erreur', resolveAuthEmailErrorMessage(err, 'Impossible de renvoyer l\'e-mail.'));
    } finally {
      setLoading(false);
    }
  }

  async function openLegalDoc(key: LegalContentKey) {
    const content = await getLegalContent(key, { force: true });
    setLegalPreviewTitle(content.title);
    setLegalPreviewBody(formatLegalBodyForDisplay(content.body));
    setLegalPreviewKey(key);
  }

  function handleLogoPress() {
    const now = Date.now();
    if (now - lastLogoTapRef.current < 350) {
      lastLogoTapRef.current = 0;
      navigation.navigate('PartnerValidationCode');
      return;
    }
    lastLogoTapRef.current = now;
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title:
        mode === 'signup'
          ? 'Inscription'
          : mode === 'activate'
            ? 'Activer mon compte'
            : mode === 'reset'
              ? 'Nouveau mot de passe'
              : mode === 'set_password'
                ? 'Nouveau mot de passe'
                : 'Connexion',
      headerStyle: { backgroundColor: shell.pageBg },
      headerTintColor: shell.tabIndicator,
      headerTitleStyle: { color: shell.pageTitle },
      headerShown: mode !== 'login',
    });
  }, [navigation, shell, mode]);

  const inputStyle = [
    styles.input,
    {
      backgroundColor: shell.filterInactiveBg,
      borderColor: shell.filterInactiveBorder,
      color: shell.pageTitle,
    },
  ];

  function switchMode(next: AuthMode) {
    setMode(next);
    setSignupStep('form');
    setEmailRateLimitInfo(null);
    setPassword('');
    setSignupPassword('');
    setConfirmPassword('');
  }

  async function assertEmailAvailableForSignup(emailValue: string): Promise<boolean> {
    const emailCheck = validateSignupEmail(emailValue);
    if (!emailCheck.ok) {
      Alert.alert('E-mail requis', emailCheck.message);
      return false;
    }
    const status = await checkSignupEmailAvailability(emailCheck.email);
    if (status === 'already_registered') {
      Alert.alert(
        'E-mail déjà utilisé',
        signupEmailAvailabilityMessage('already_registered'),
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Connexion', onPress: () => switchMode('login') },
        ],
      );
      return false;
    }
    if (status === 'pending_confirmation') {
      setEmail(emailCheck.email);
      setSignupStep('verify_email');
      Alert.alert(
        'Confirmation en attente',
        signupEmailAvailabilityMessage('pending_confirmation'),
      );
      return false;
    }
    if (status === 'invalid' || status === 'synthetic_blocked') {
      Alert.alert('E-mail refusé', signupEmailAvailabilityMessage(status));
      return false;
    }
    return true;
  }

  function validateSignupForm(): boolean {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Champs requis', 'Indiquez votre prénom et votre nom.');
      return false;
    }
    const emailCheck = validateSignupEmail(email);
    if (!emailCheck.ok) {
      Alert.alert('E-mail requis', emailCheck.message);
      return false;
    }
    const pwdError = validateSignupPassword(signupPassword, confirmPassword);
    if (pwdError) {
      Alert.alert('Mot de passe', pwdError);
      return false;
    }
    if (phone.trim() && !isValidInternationalPhone(phone, phoneDialCode)) {
      Alert.alert('Téléphone', 'Numéro invalide — laissez vide ou corrigez l\'indicatif.');
      return false;
    }
    return true;
  }

  async function handleLogin() {
    const emailCheck = validateSignupEmail(email);
    if (!emailCheck.ok) {
      Alert.alert('E-mail requis', emailCheck.message);
      return;
    }
    if (!password) {
      Alert.alert('Mot de passe requis', 'Saisissez votre mot de passe.');
      return;
    }

    setLoading(true);
    try {
      const precheck = await precheckLoginEmail(emailCheck.email);
      if (precheck.kind === 'invalid') {
        Alert.alert('E-mail requis', precheck.message);
        return;
      }
      if (precheck.kind === 'not_found') {
        if (signupEnabled) {
          Alert.alert(
            'Compte introuvable',
            'Aucun compte actif pour cet e-mail. Souhaitez-vous créer un compte ?',
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Créer un compte', onPress: () => switchMode('signup') },
            ],
          );
        } else {
          Alert.alert(
            'Compte introuvable',
            'Aucun compte actif pour cet e-mail. Les inscriptions sont temporairement fermées.',
          );
        }
        return;
      }
      if (precheck.kind === 'pending_confirmation') {
        Alert.alert(
          'E-mail non confirmé',
          'Ouvrez le lien reçu par e-mail pour activer votre compte, puis reconnectez-vous.',
        );
        return;
      }

      await signIn(emailCheck.email, password);
      resetToAccueil(navigation);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connexion impossible';
      if (isWrongPasswordLoginError(err)) {
        Alert.alert(
          'Mot de passe incorrect',
          'Le mot de passe saisi est incorrect. Réessayez ou utilisez « Mot de passe oublié ».',
        );
      } else if (msg.includes('Email not confirmed')) {
        Alert.alert(
          'E-mail non confirmé',
          'Ouvrez le lien reçu par e-mail pour activer votre compte, puis reconnectez-vous.',
        );
      } else if (msg.includes('introuvable') || msg.includes('inconnu')) {
        if (signupEnabled) {
          Alert.alert(
            'Compte introuvable',
            'Aucun compte actif pour cet e-mail. Souhaitez-vous créer un compte ?',
            [
              { text: 'Annuler', style: 'cancel' },
              { text: 'Créer un compte', onPress: () => switchMode('signup') },
            ],
          );
        } else {
          Alert.alert(
            'Compte introuvable',
            'Aucun compte actif pour cet e-mail. Les inscriptions sont temporairement fermées.',
          );
        }
      } else {
        Alert.alert('Erreur', msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteSignup() {
    if (mode === 'activate') {
      const emailCheck = validateSignupEmail(email);
      if (!emailCheck.ok) {
        Alert.alert('E-mail requis', emailCheck.message);
        return;
      }
      const pwdError = validateSignupPassword(signupPassword, confirmPassword);
      if (pwdError) {
        Alert.alert('Mot de passe', pwdError);
        return;
      }
      const eligibility = await checkAdminInviteActivationEligibility(emailCheck.email);
      if (eligibility === 'account_already_active') {
        Alert.alert(
          'Compte déjà actif',
          'Ce compte est déjà activé. Connectez-vous avec votre mot de passe ou utilisez « Mot de passe oublié ».',
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Connexion', onPress: () => switchMode('login') },
          ],
        );
        return;
      }
      if (eligibility === 'no_pending_invite') {
        Alert.alert('Invitation introuvable', 'Aucune invitation admin en attente pour cet e-mail.');
        return;
      }
      const invite = await findPendingInviteByEmail(emailCheck.email);
      if (!invite) {
        Alert.alert('Invitation introuvable', 'Aucune invitation admin en attente pour cet e-mail.');
        return;
      }
      setLoading(true);
      try {
        const emailStatus = await checkSignupEmailAvailability(emailCheck.email);

        // Compte déjà préparé par l'admin (e-mail d'invitation) → finaliser via Edge Function
        if (emailStatus === 'already_registered' || emailStatus === 'pending_confirmation') {
          const activated = await activateInvitedMemberAccount({
            email: emailCheck.email,
            password: signupPassword,
            inviteId: invite.id,
          });

          if (activated.ok) {
            await signIn(emailCheck.email, signupPassword);
            Alert.alert('Compte activé', 'Bienvenue sur THE LOOP.');
            resetToAccueil(navigation);
            return;
          }

          if (activated.accountAlreadyActive) {
            Alert.alert(
              'Compte déjà actif',
              activated.error ??
                'Ce compte est déjà activé. Connectez-vous avec votre mot de passe ou utilisez « Mot de passe oublié ».',
              [
                { text: 'Annuler', style: 'cancel' },
                { text: 'Connexion', onPress: () => switchMode('login') },
              ],
            );
            return;
          }

          if (!activated.needsSignUp) {
            // Peut-être MDP déjà défini → tenter connexion directe
            try {
              await signIn(emailCheck.email, signupPassword);
              const { markInviteActivated } = await import('@/lib/admin-invite-store');
              await markInviteActivated(invite.id, emailCheck.email);
              Alert.alert('Compte activé', 'Bienvenue sur THE LOOP.');
              resetToAccueil(navigation);
              return;
            } catch {
              Alert.alert(
                'Activation impossible',
                activated.error ??
                  'Ouvrez le lien reçu par e-mail ou demandez à l\'équipe de renvoyer l\'invitation.',
                [
                  { text: 'Renvoyer le lien', onPress: () => void handleResendInviteLink(emailCheck.email) },
                  { text: 'OK', style: 'cancel' },
                ],
              );
              return;
            }
          }
        }

        // Invitation DB seule (pas encore de compte Auth) → inscription classique
        const normalizedPhone = phone.trim()
          ? normalizeInternationalPhone(phone, phoneDialCode)
          : null;
        const displayName = resolveInviteDisplayName({
          firstName: invite.firstName ?? (firstName.trim() || null),
          lastName: invite.lastName ?? (lastName.trim() || null),
          userRole: invite.userRole,
        });
        await signUpMember({
          email: invite.email ?? emailCheck.email,
          password: signupPassword,
          firstName: displayName.firstName,
          lastName: displayName.lastName,
          phoneNumber: normalizedPhone,
          countryCode: invite.countryCode ?? accountCountry,
          phoneDialCode,
          city: city.trim() || invite.city?.trim() || null,
          userRole: invite.userRole,
          website: websiteHoneypot,
        });
        const { markInviteActivated } = await import('@/lib/admin-invite-store');
        await markInviteActivated(invite.id, emailCheck.email);
        Alert.alert('Compte activé', 'Vous pouvez compléter votre profil à tout moment.');
        resetToAccueil(navigation);
      } catch (err) {
        if (isEmailVerificationRequiredError(err)) {
          setEmailRateLimitInfo(null);
          setSignupStep('verify_email');
        } else if (isSignUpEmailAlreadyUsedError(err) || (err instanceof Error && /déjà|already/i.test(err.message))) {
          Alert.alert(
            'Compte déjà préparé',
            'Un compte existe déjà pour cet e-mail. Ouvrez le lien reçu par e-mail ou renvoyez-en un.',
            [
              { text: 'Renvoyer le lien', onPress: () => void handleResendInviteLink(emailCheck.email) },
              { text: 'OK', style: 'cancel' },
            ],
          );
        } else if (applyEmailRateLimit(err)) {
          Alert.alert('Limite THE LOOP', resolveAuthEmailErrorMessage(err, 'Activation impossible pour le moment.'));
        } else {
          Alert.alert('Erreur', resolveAuthEmailErrorMessage(err, 'Activation impossible'));
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!validateSignupForm()) return;
    if (!acceptedCgu) {
      Alert.alert(
        'Acceptation requise',
        'Veuillez accepter les Conditions Générales d\'Utilisation et la Politique de confidentialité pour continuer.',
      );
      return;
    }

    setLoading(true);
    try {
      const emailCheck = validateSignupEmail(email);
      if (!emailCheck.ok) {
        Alert.alert('E-mail requis', emailCheck.message);
        return;
      }
      if (!(await assertEmailAvailableForSignup(emailCheck.email))) {
        return;
      }
      const sponsor = referralCode.trim();
      if (sponsor) {
        const valid = await isValidReferralCode(sponsor);
        if (!valid) {
          Alert.alert('Code parrain', 'Ce code de parrainage est invalide.');
          return;
        }
      }
      const normalizedPhone = phone.trim()
        ? normalizeInternationalPhone(phone, phoneDialCode)
        : null;
      await signUpMember({
        email: emailCheck.email,
        password: signupPassword,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: normalizedPhone,
        countryCode: accountCountry,
        phoneDialCode,
        city: city.trim() || null,
        birthDate: birthDate.trim() || null,
        referralCode: sponsor || null,
        website: websiteHoneypot,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (isEmailVerificationRequiredError(err)) {
        setEmailRateLimitInfo(null);
        setSignupStep('verify_email');
      } else if (msg.includes('pas encore confirmé') || msg.includes('renvoyez la confirmation')) {
        setSignupStep('verify_email');
        Alert.alert('Confirmation en attente', msg);
      } else if (applyEmailRateLimit(err)) {
        Alert.alert('Limite THE LOOP', resolveAuthEmailErrorMessage(err, 'Inscription impossible pour le moment.'));
      } else if (msg.includes('déjà associé')) {
        Alert.alert(
          'E-mail déjà utilisé',
          msg,
          [
            { text: 'Annuler', style: 'cancel' },
            { text: 'Connexion', onPress: () => switchMode('login') },
          ],
        );
      } else {
        Alert.alert('Erreur', resolveAuthEmailErrorMessage(err, 'Inscription impossible'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleResendInviteLink(emailValue: string) {
    setLoading(true);
    try {
      await requestPasswordResetEmail(emailValue);
      setEmail(emailValue);
      setSignupStep('verify_email');
      Alert.alert(
        'E-mail envoyé',
        'Ouvrez le lien reçu pour définir votre mot de passe et accéder à THE LOOP.',
      );
    } catch (err) {
      Alert.alert('Erreur', resolveAuthEmailErrorMessage(err, 'Envoi impossible'));
    } finally {
      setLoading(false);
    }
  }

  async function handleSendResetEmail() {
    const emailCheck = validateSignupEmail(email);
    if (!emailCheck.ok) {
      Alert.alert('E-mail requis', emailCheck.message);
      return;
    }
    setLoading(true);
    try {
      const exists = await accountExistsForEmail(emailCheck.email);
      if (!exists) {
        Alert.alert('Compte introuvable', 'Aucun compte actif pour cet e-mail.');
        return;
      }
      await requestPasswordResetEmail(emailCheck.email);
      setSignupStep('verify_email');
    } catch (err) {
      if (applyEmailRateLimit(err)) {
        Alert.alert('Limite THE LOOP', resolveAuthEmailErrorMessage(err, 'Envoi impossible pour le moment.'));
      } else {
        Alert.alert('Erreur', resolveAuthEmailErrorMessage(err, 'Envoi impossible'));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSetNewPassword() {
    const pwdError = validateSignupPassword(signupPassword, confirmPassword);
    if (pwdError) {
      Alert.alert('Mot de passe', pwdError);
      return;
    }
    setLoading(true);
    try {
      await completePasswordRecovery(signupPassword);
      Alert.alert('Mot de passe enregistré', 'Vous êtes connecté.', [
        { text: 'OK', onPress: () => resetToAccueil(navigation) },
      ]);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setLoading(false);
    }
  }

  const formCardStyle = [
    styles.formCard,
    {
      backgroundColor: shell.filterInactiveBg,
      borderColor: shell.filterInactiveBorder,
    },
  ];

  const tabBtn = (active: boolean) => [
    styles.tabBtn,
    {
      backgroundColor: active ? shell.filterActiveBg : 'transparent',
      borderColor: shell.filterInactiveBorder,
    },
  ];

  const tabText = (active: boolean) => ({
    color: active ? shell.filterActiveText : shell.pageKicker,
  });

  return (
    <KeyboardAwareFormScroll
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
    >
      <View style={styles.brandHero}>
        <Pressable onPress={handleLogoPress} accessibilityRole="button" accessibilityLabel="Logo THE LOOP">
          <LoopLogo variant="app" size="lg" stacked />
        </Pressable>
      </View>

      {mode !== 'activate' && mode !== 'reset' && mode !== 'set_password' ? (
        signupEnabled ? (
          <View style={[styles.tabRow, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.pageBg }]}>
            <Pressable style={tabBtn(mode === 'login')} onPress={() => switchMode('login')}>
              <Text style={[styles.tabText, tabText(mode === 'login')]}>Connexion</Text>
            </Pressable>
            <Pressable style={tabBtn(mode === 'signup')} onPress={() => switchMode('signup')}>
              <Text style={[styles.tabText, tabText(mode === 'signup')]}>Inscription</Text>
            </Pressable>
          </View>
        ) : null
      ) : null}

      {mode === 'login' && (
        <View style={formCardStyle}>
          <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>Bon retour</Text>
          <Text style={[styles.cardSubtitle, { color: shell.pageKicker }]}>
            Connectez-vous avec votre e-mail et votre mot de passe.
          </Text>

          <FieldLabel required color={shell.pageKicker}>E-mail</FieldLabel>
          <TextInput
            style={inputStyle}
            placeholder="vous@exemple.com"
            placeholderTextColor={shell.pageKicker}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <FieldLabel required color={shell.pageKicker}>Mot de passe</FieldLabel>
          <PasswordInput
            shell={shell}
            accentColor={shell.filterActiveBg}
            placeholder="Votre mot de passe"
            placeholderTextColor={shell.pageKicker}
            value={password}
            onChangeText={setPassword}
          />

          <Pressable
            style={[styles.btn, { backgroundColor: shell.filterActiveBg }]}
            onPress={() => void handleLogin()}
            disabled={loading}
          >
            <Text style={[styles.btnText, { color: shell.filterActiveText }]}>
              {loading ? 'Connexion…' : 'Se connecter'}
            </Text>
          </Pressable>

          <Pressable onPress={() => switchMode('reset')} style={styles.inlineLink}>
            <Text style={[styles.link, { color: shell.tabIndicator }]}>Mot de passe oublié ?</Text>
          </Pressable>

          <Pressable onPress={() => switchMode('activate')} style={styles.inlineLink}>
            <Text style={[styles.link, { color: shell.pageKicker }]}>
              Activer un compte invité par l'équipe
            </Text>
          </Pressable>
        </View>
      )}

      {mode === 'reset' && signupStep === 'form' && (
        <View style={formCardStyle}>
          <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>Réinitialiser le mot de passe</Text>
          <Text style={[styles.cardSubtitle, { color: shell.pageKicker }]}>
            Saisissez l'e-mail de votre compte. Vous recevrez un lien sécurisé pour choisir un nouveau mot de passe.
          </Text>
          <FieldLabel required color={shell.pageKicker}>E-mail</FieldLabel>
          <TextInput
            style={inputStyle}
            placeholder="vous@exemple.com"
            placeholderTextColor={shell.pageKicker}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Pressable
            style={[styles.btn, { backgroundColor: shell.filterActiveBg }]}
            onPress={() => void handleSendResetEmail()}
            disabled={loading}
          >
            <Text style={[styles.btnText, { color: shell.filterActiveText }]}>
              {loading ? 'Envoi…' : 'Recevoir le lien'}
            </Text>
          </Pressable>
          <Pressable onPress={() => switchMode('login')} style={styles.inlineLink}>
            <Text style={[styles.link, { color: shell.tabIndicator }]}>← Retour connexion</Text>
          </Pressable>
        </View>
      )}

      {mode === 'set_password' && signupStep === 'form' && (
        <View style={formCardStyle}>
          <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>Choisir un nouveau mot de passe</Text>
          <Text style={[styles.cardSubtitle, { color: shell.pageKicker }]}>
            Votre lien est validé. Saisissez et confirmez votre nouveau mot de passe pour accéder à THE LOOP.
          </Text>
          <FieldLabel required color={shell.pageKicker}>Nouveau mot de passe</FieldLabel>
          <PasswordInput
            shell={shell}
            accentColor={shell.filterActiveBg}
            placeholder={`Minimum ${MIN_PASSWORD_LENGTH} caractères, lettre + chiffre`}
            placeholderTextColor={shell.pageKicker}
            value={signupPassword}
            onChangeText={setSignupPassword}
          />
          <FieldLabel required color={shell.pageKicker}>Confirmer le mot de passe</FieldLabel>
          <PasswordInput
            shell={shell}
            accentColor={shell.filterActiveBg}
            placeholder="Retapez votre mot de passe"
            placeholderTextColor={shell.pageKicker}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
          <Pressable
            style={[styles.btn, { backgroundColor: shell.filterActiveBg }]}
            onPress={() => void handleSetNewPassword()}
            disabled={loading}
          >
            <Text style={[styles.btnText, { color: shell.filterActiveText }]}>
              {loading ? 'Enregistrement…' : 'Enregistrer et continuer'}
            </Text>
          </Pressable>
        </View>
      )}

      {(signupStep === 'verify_email') && (
        <View style={formCardStyle}>
          <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>Vérifiez votre e-mail</Text>
          <Text style={[styles.cardSubtitle, { color: shell.pageKicker }]}>
            {mode === 'reset'
              ? `Si un compte existe pour ${normalizeEmail(email)}, un lien de réinitialisation vient d'être envoyé.`
              : `Un message de confirmation a été envoyé à ${normalizeEmail(email)}. Ouvrez le lien pour activer votre compte, puis reconnectez-vous.`}
          </Text>
          {mode !== 'reset' ? (
            <Text style={[styles.cardSubtitle, { color: shell.pageKicker, marginTop: 8 }]}>
              Pensez à vérifier votre dossier spam ou courrier indésirable.
            </Text>
          ) : null}
          {mode !== 'reset' ? (
            <Text style={[styles.verifyHint, { color: shell.pageKicker }]}>
              Test Expo Go : le lien doit commencer par exp:// et ouvrir Expo Go. Après clic, vous devez être connecté automatiquement — sinon connectez-vous à la main (e-mail déjà confirmé). Metro tunnel doit rester actif.
            </Text>
          ) : null}
          {emailRateLimitInfo ? (
            <View style={[styles.rateLimitBox, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
              <Text style={styles.rateLimitTitle}>Limite d'envoi THE LOOP</Text>
              <Text style={styles.rateLimitBody}>{emailRateLimitInfo}</Text>
              {resendCooldown > 0 ? (
                <Text style={styles.rateLimitRetry}>
                  Prochain renvoi possible dans {formatResendCooldown(resendCooldown)}.
                </Text>
              ) : null}
            </View>
          ) : null}
          {mode !== 'reset' ? (
            <Pressable
              style={[styles.btn, styles.btnOutline, { borderColor: shell.filterInactiveBorder, opacity: loading || resendCooldown > 0 ? 0.6 : 1 }]}
              onPress={() => void handleResendConfirmationEmail()}
              disabled={loading || resendCooldown > 0}
            >
              <Text style={[styles.btnText, { color: shell.pageTitle }]}>
                {resendCooldown > 0
                  ? `Renvoyer dans ${formatResendCooldown(resendCooldown)}`
                  : 'Renvoyer l\'e-mail de confirmation'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[styles.btn, { backgroundColor: shell.filterActiveBg }]}
            onPress={() => { setSignupStep('form'); switchMode('login'); }}
          >
            <Text style={[styles.btnText, { color: shell.filterActiveText }]}>Aller à la connexion</Text>
          </Pressable>
        </View>
      )}

      {mode === 'activate' && signupStep === 'form' && (
        <View style={formCardStyle}>
          <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>Activer mon compte</Text>
          <Text style={[styles.cardSubtitle, { color: shell.pageKicker }]}>
            Saisissez l'e-mail communiqué par l'administrateur, puis choisissez votre mot de passe.
            {'\n\n'}Si vous avez reçu un e-mail d'invitation, vous pouvez aussi ouvrir directement le lien qu'il contient.
          </Text>

          <FieldLabel required color={shell.pageKicker}>E-mail</FieldLabel>
          <TextInput
            style={inputStyle}
            placeholder="vous@exemple.com"
            placeholderTextColor={shell.pageKicker}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <FieldLabel required color={shell.pageKicker}>Mot de passe</FieldLabel>
          <PasswordInput
            shell={shell}
            accentColor={shell.filterActiveBg}
            placeholder={`Minimum ${MIN_PASSWORD_LENGTH} caractères, lettre + chiffre`}
            placeholderTextColor={shell.pageKicker}
            value={signupPassword}
            onChangeText={setSignupPassword}
          />

          <FieldLabel required color={shell.pageKicker}>Confirmer le mot de passe</FieldLabel>
          <PasswordInput
            shell={shell}
            accentColor={shell.filterActiveBg}
            placeholder="Retapez votre mot de passe"
            placeholderTextColor={shell.pageKicker}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <InternationalPhoneField
            dialCode={phoneDialCode}
            onDialCodeChange={setPhoneDialCode}
            phone={phone}
            onPhoneChange={setPhone}
            shell={shell}
            label="Téléphone (optionnel)"
            hint="Peut être ajouté plus tard dans votre profil."
          />

          <GuineaLocationPicker
            value={city}
            onChange={setCity}
            shell={shell}
            label="Localisation"
            countryCode={accountCountry}
            optional
            placeholder="Commune et quartier — privilèges ciblés"
          />

          <Pressable
            style={[styles.btn, { backgroundColor: shell.filterActiveBg }]}
            onPress={() => void handleCompleteSignup()}
            disabled={loading}
          >
            <Text style={[styles.btnText, { color: shell.filterActiveText }]}>
              {loading ? 'Activation…' : 'Activer mon compte'}
            </Text>
          </Pressable>

          <Pressable onPress={() => switchMode('login')} style={styles.inlineLink}>
            <Text style={[styles.link, { color: shell.tabIndicator }]}>← Retour connexion</Text>
          </Pressable>
        </View>
      )}

      {mode === 'signup' && signupStep === 'form' && (
        <View style={formCardStyle}>
          <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>Créer un compte</Text>
          <Text style={[styles.cardSubtitle, { color: shell.pageKicker }]}>
            Quelques informations pour rejoindre THE LOOP.
          </Text>

          <View style={styles.nameRow}>
            <View style={styles.nameCol}>
              <FieldLabel required color={shell.pageKicker}>Prénom</FieldLabel>
              <TextInput
                style={inputStyle}
                placeholder="Prénom"
                placeholderTextColor={shell.pageKicker}
                value={firstName}
                onChangeText={setFirstName}
              />
            </View>
            <View style={styles.nameCol}>
              <FieldLabel required color={shell.pageKicker}>Nom</FieldLabel>
              <TextInput
                style={inputStyle}
                placeholder="Nom"
                placeholderTextColor={shell.pageKicker}
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
          </View>

          <CountrySelectField
            value={accountCountry}
            onChange={handleAccountCountryChange}
            shell={shell}
            label="Pays du compte"
            countries={enabledCountries}
            readOnly={enabledCountries.length <= 1}
          />
          <Text style={[styles.hint, { color: shell.pageKicker, marginBottom: 8 }]}>
            {accountCountryHint(getCountryLabel(accountCountry))}
          </Text>

          <FieldLabel required color={shell.pageKicker}>E-mail</FieldLabel>
          <TextInput
            style={inputStyle}
            placeholder="vous@exemple.com"
            placeholderTextColor={shell.pageKicker}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <GuineaLocationPicker
            value={city}
            onChange={setCity}
            shell={shell}
            label="Localisation"
            countryCode={accountCountry}
            optional
            placeholder="Commune et quartier — privilèges ciblés"
          />

          <InternationalPhoneField
            dialCode={phoneDialCode}
            onDialCodeChange={setPhoneDialCode}
            phone={phone}
            onPhoneChange={setPhone}
            shell={shell}
            label="Téléphone (optionnel)"
            hint="Indicatif libre (diaspora). Le contenu affiché suit le pays du compte ci-dessus."
          />

          <View style={styles.honeypot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <TextInput
              value={websiteHoneypot}
              onChangeText={setWebsiteHoneypot}
              autoComplete="off"
              tabIndex={-1}
            />
          </View>

          <FieldLabel required color={shell.pageKicker}>Mot de passe</FieldLabel>
          <PasswordInput
            shell={shell}
            accentColor={shell.filterActiveBg}
            placeholder={`Minimum ${MIN_PASSWORD_LENGTH} caractères`}
            placeholderTextColor={shell.pageKicker}
            value={signupPassword}
            onChangeText={setSignupPassword}
          />

          <FieldLabel required color={shell.pageKicker}>Confirmer le mot de passe</FieldLabel>
          <PasswordInput
            shell={shell}
            accentColor={shell.filterActiveBg}
            placeholder="Retapez votre mot de passe"
            placeholderTextColor={shell.pageKicker}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <FieldLabel color={shell.pageKicker}>Date de naissance</FieldLabel>
          <DateTimeField
            value={birthDate}
            onChange={setBirthDate}
            placeholder="Optionnel — offres anniversaire"
            dateOnly
            flat
            maximumDate={new Date()}
            shell={shell}
          />

          <FieldLabel color={shell.pageKicker}>Code parrain (optionnel)</FieldLabel>
          <TextInput
            style={inputStyle}
            placeholder="Ex. LOOP-AISS2026"
            placeholderTextColor={shell.pageKicker}
            value={referralCode}
            onChangeText={setReferralCode}
            autoCapitalize="characters"
          />

          <View style={styles.cguRow}>
            <Pressable onPress={() => setAcceptedCgu((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: acceptedCgu }}>
              <View style={[styles.cguCheck, { borderColor: shell.filterInactiveBorder }, acceptedCgu && { backgroundColor: shell.filterActiveBg }]}>
                {acceptedCgu ? <Text style={{ color: shell.filterActiveText, fontWeight: '800' }}>✓</Text> : null}
              </View>
            </Pressable>
            <Text style={[styles.cguText, { color: shell.pageKicker }]}>
              J'ai lu et j'accepte les{' '}
              <Text style={[styles.legalLink, { color: shell.tabIndicator }]} onPress={() => void openLegalDoc('cgu')}>
                Conditions Générales d'Utilisation
              </Text>
              {' '}et la{' '}
              <Text style={[styles.legalLink, { color: shell.tabIndicator }]} onPress={() => void openLegalDoc('privacy_policy')}>
                Politique de confidentialité
              </Text>
              {' '}de THE LOOP.
            </Text>
          </View>

          <Pressable
            style={[styles.btn, { backgroundColor: shell.filterActiveBg }]}
            onPress={() => void handleCompleteSignup()}
            disabled={loading}
          >
            <Text style={[styles.btnText, { color: shell.filterActiveText }]}>
              {loading ? 'Création…' : 'Créer mon compte'}
            </Text>
          </Pressable>
        </View>
      )}

      {(mode === 'login' || (mode === 'signup' && signupStep === 'form')) ? (
        <Pressable style={styles.partnerRow} onPress={() => navigation.navigate('PartnerApply')}>
          <Text style={[styles.partnerText, { color: shell.tabIndicator, fontWeight: '700' }]}>
            {COMMUNITY_PARTNERSHIP_CTA}
          </Text>
        </Pressable>
      ) : null}

      <LegalPreviewModal
        visible={legalPreviewKey != null}
        title={legalPreviewTitle}
        body={legalPreviewBody}
        onClose={() => setLegalPreviewKey(null)}
        accentBg={shell.filterActiveBg}
        accentText={shell.filterActiveText}
      />
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  brandHero: { alignItems: 'center', marginBottom: 24, marginTop: 12 },
  tabRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabText: { fontSize: 13, fontWeight: '700' },
  partnerRow: { marginBottom: 14, paddingHorizontal: 4 },
  partnerText: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
  formCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    marginBottom: 8,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', marginBottom: 6 },
  cardSubtitle: { fontSize: 13, marginBottom: 16, lineHeight: 20 },
  verifyHint: { fontSize: 11, lineHeight: 17, marginBottom: 12, marginTop: 4, fontStyle: 'italic' },
  rateLimitBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    gap: 4,
  },
  rateLimitTitle: { fontSize: 12, fontWeight: '800', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.8 },
  rateLimitBody: { fontSize: 13, lineHeight: 19, color: '#78350F' },
  rateLimitRetry: { fontSize: 12, fontWeight: '700', color: '#B45309', marginTop: 4 },
  fieldHint: { fontSize: 11, lineHeight: 16, marginBottom: 8 },
  nameRow: { flexDirection: 'row', gap: 10 },
  nameCol: { flex: 1 },
  fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 2 },
  required: { color: '#ef4444' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 14,
  },
  otpInput: { textAlign: 'center', fontSize: 24, letterSpacing: 8, fontWeight: '700' },
  btn: {
    marginTop: 8,
    width: '100%',
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutline: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  btnText: { fontWeight: '700', fontSize: 15, textAlign: 'center' },
  hint: { marginTop: 12, textAlign: 'center', fontSize: 11 },
  link: { textAlign: 'center', fontSize: 13, fontWeight: '600' },
  inlineLink: { marginTop: 16 },
  cguRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8, marginBottom: 4 },
  cguCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cguText: { flex: 1, fontSize: 12, lineHeight: 18 },
  legalLink: { fontWeight: '700', textDecorationLine: 'underline' },
  honeypot: { height: 0, overflow: 'hidden', opacity: 0 },
});
