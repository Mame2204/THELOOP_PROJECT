import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  CommonActions,
  NavigationContainer,
  DefaultTheme,
  type NavigationContainerRef,
} from '@react-navigation/native';
import { CustomTabBar } from '@/components/CustomTabBar';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { syncAdminThemeScopeFromState } from '@/navigation/admin-theme-scope';
import { lazyScreen, requireScreen } from '@/navigation/lazyScreen';
import { withDetailPopup } from '@/navigation/withDetailPopup';
import { useAuthContext } from '@/context/AuthContext';
import { useAppGates } from '@/context/AppGatesContext';
import { useThemeContext } from '@/context/ThemeContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import type { RootStackParamList, TabParamList } from '@/navigation/types';
import { isAuthenticated } from '@/types';
import { SystemGateScreen } from '@/screens/SystemGateScreen';

const Tab = createBottomTabNavigator<TabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Fiches détail : popup visuelle (withDetailPopup).
 * Android : `card` (pas de modal transparent) — évite crash ScreenStack / drawing order.
 * iOS : transparentModal pour le dim natif.
 */
const DETAIL_MODAL_PRESENTATION =
  Platform.OS === 'android' ? ('card' as const) : ('transparentModal' as const);
const DETAIL_MODAL_ANIMATION = 'fade' as const;

const AccueilScreen = lazyScreen(
  () => require('@/screens/AccueilScreen').AccueilScreen,
  'Accueil',
);
const AgendaScreen = lazyScreen(() => require('@/screens/AgendaScreen').AgendaScreen, 'Agenda');
const SpotsScreen = lazyScreen(() => require('@/screens/SpotsScreen').SpotsScreen, 'Spots');
const OutilsScreen = lazyScreen(() => require('@/screens/OutilsScreen').OutilsScreen, 'Outils');
const FavorisScreen = lazyScreen(() => require('@/screens/FavorisScreen').FavorisScreen, 'Favoris');
const PartnerProScreen = lazyScreen(
  () => require('@/screens/PartnerProScreen').PartnerProScreen,
  'PartnerPro',
);
const PartnerStatsScreen = lazyScreen(
  () => require('@/screens/PartnerStatsScreen').PartnerStatsScreen,
  'PartnerStats',
);
const AdminWorkspaceScreen = lazyScreen(
  () => require('@/screens/AdminWorkspaceScreen').AdminWorkspaceScreen,
  'AdminTower',
);
const ProfilScreen = lazyScreen(() => require('@/screens/ProfilScreen').ProfilScreen, 'Profil');

function MainTabs() {
  const { shell } = useMemberTheme();

  return (
    <Tab.Navigator
      initialRouteName="Accueil"
      tabBar={(props) => <CustomTabBar {...props} />}
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: false,
        sceneStyle: { backgroundColor: shell.pageBg },
        tabBarStyle: { backgroundColor: shell.tabBarBg },
      }}
    >
      <Tab.Screen name="Accueil" component={AccueilScreen} />
      <Tab.Screen name="Agenda" component={AgendaScreen} />
      <Tab.Screen name="Spots" component={SpotsScreen} />
      <Tab.Screen name="Outils" component={OutilsScreen} />
      <Tab.Screen name="Favoris" component={FavorisScreen} />
      <Tab.Screen name="PartnerPro" component={PartnerProScreen} />
      <Tab.Screen name="PartnerStats" component={PartnerStatsScreen} />
      <Tab.Screen name="AdminTower" component={AdminWorkspaceScreen} />
      <Tab.Screen name="Profil" component={ProfilScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { role, isLoading, passwordRecoveryPending, signOut } = useAuthContext();
  const { gates, isReady: gatesReady, activeGate, sessionBypass, unlockSessionBypass } = useAppGates();
  const authenticated = isAuthenticated(role);
  /** Session recovery/invite : rester sur Auth pour saisir le nouveau MDP. */
  const appUnlocked = authenticated && !passwordRecoveryPending;
  const { setScope } = useThemeContext();
  const { shell } = useMemberTheme();
  const navigationRef = useRef<NavigationContainerRef<RootStackParamList>>(null);
  const wasAuthenticatedRef = useRef(appUnlocked);

  const applyAdminThemeScope = useCallback(
    (state = navigationRef.current?.getRootState()) => {
      syncAdminThemeScopeFromState(state, role, setScope);
    },
    [role, setScope],
  );

  useEffect(() => {
    applyAdminThemeScope();
  }, [applyAdminThemeScope]);

  /** Après login (guest → member), forcer Accueil — le remount seul peut laisser Auth visible. */
  useEffect(() => {
    const wasAuth = wasAuthenticatedRef.current;
    wasAuthenticatedRef.current = appUnlocked;
    if (wasAuth || !appUnlocked) return;

    const goAccueil = (): boolean => {
      const nav = navigationRef.current;
      if (!nav?.isReady()) return false;
      const names = nav.getRootState()?.routeNames ?? [];
      if (!names.includes('Tabs')) return false;
      nav.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [
            {
              name: 'Tabs',
              state: {
                index: 0,
                routes: [{ name: 'Accueil' }],
              },
            },
          ],
        }),
      );
      return true;
    };

    if (goAccueil()) return undefined;
    const t0 = setTimeout(() => {
      if (goAccueil()) return;
      setTimeout(goAccueil, 80);
    }, 0);
    return () => clearTimeout(t0);
  }, [appUnlocked]);

  /** Lien recovery / invite : ouvrir le formulaire nouveau mot de passe. */
  useEffect(() => {
    if (!passwordRecoveryPending) return;
    const goSetPassword = (): boolean => {
      const nav = navigationRef.current;
      if (!nav?.isReady()) return false;
      nav.navigate('Auth', { mode: 'set_password' });
      return true;
    };
    if (goSetPassword()) return undefined;
    const t0 = setTimeout(() => {
      if (goSetPassword()) return;
      setTimeout(goSetPassword, 80);
    }, 40);
    return () => clearTimeout(t0);
  }, [passwordRecoveryPending]);

  const navTheme = useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: shell.pageBg,
        card: shell.filterInactiveBg,
        text: shell.pageTitle,
        border: shell.filterInactiveBorder,
        primary: shell.tabIndicator,
      },
    }),
    [shell],
  );

  if (isLoading || !gatesReady) {
    return (
      <View style={{ flex: 1, backgroundColor: shell.pageBg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={shell.tabIndicator} />
      </View>
    );
  }

  // Barrière : maintenance > avant-lancement. Les admins déjà connectés restent dans l’app.
  const adminInside = appUnlocked && role === 'ADMIN';
  const gateBlocks = Boolean(activeGate) && !sessionBypass && !adminInside;
  if (gateBlocks && activeGate) {
    return (
      <SystemGateScreen
        kind={activeGate}
        gates={gates}
        onSecretUnlock={() => {
          if (authenticated && role !== 'ADMIN') {
            void signOut();
          }
          unlockSessionBypass();
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: shell.pageBg }}>
      <NavigationContainer
        ref={navigationRef}
        theme={navTheme}
        onReady={() => applyAdminThemeScope()}
        onStateChange={(state) => syncAdminThemeScopeFromState(state, role, setScope)}
      >
        <ThemedStatusBar />
        <Stack.Navigator
          key={appUnlocked ? 'member' : 'guest'}
          initialRouteName={appUnlocked ? 'Tabs' : 'Auth'}
          screenOptions={{
            headerStyle: { backgroundColor: shell.pageBg },
            headerTintColor: shell.tabIndicator,
            headerTitleStyle: { color: shell.pageTitle },
            contentStyle: { backgroundColor: shell.pageBg },
            // Android : évite IndexOutOfBoundsException getChildDrawingOrder
            freezeOnBlur: false,
            animation: Platform.OS === 'android' ? 'fade' : 'default',
          }}
        >
          {!appUnlocked ? (
            <>
              <Stack.Screen
                name="Auth"
                getComponent={requireScreen(() => require('@/screens/AuthScreen').AuthScreen, 'Auth')}
                options={{ headerShown: false }}
                initialParams={passwordRecoveryPending ? { mode: 'set_password' } : undefined}
              />
              <Stack.Screen
                name="PartnerApply"
                getComponent={requireScreen(
                  () => require('@/screens/PartnerApplyScreen').PartnerApplyScreen,
                  'PartnerApply',
                )}
                options={{ title: 'Partenariat' }}
              />
              <Stack.Screen
                name="PartnerLogin"
                getComponent={requireScreen(
                  () => require('@/screens/PartnerLoginScreen').PartnerLoginScreen,
                  'PartnerLogin',
                )}
                options={{ title: 'Connexion Pro' }}
              />
              <Stack.Screen
                name="PartnerValidationCode"
                getComponent={requireScreen(
                  () => require('@/screens/PartnerValidationCodeScreen').PartnerValidationCodeScreen,
                  'PartnerValidationCode',
                )}
                options={{
                  headerShown: false,
                  presentation: DETAIL_MODAL_PRESENTATION,
                  animation: DETAIL_MODAL_ANIMATION,
                  contentStyle: { backgroundColor: 'transparent' },
                }}
              />
              <Stack.Screen
                name="PartnerBenefitScan"
                getComponent={requireScreen(
                  () => require('@/screens/PartnerBenefitScanScreen').PartnerBenefitScanScreen,
                  'PartnerBenefitScan',
                )}
                options={{ title: 'Scanner membre', headerShown: false }}
              />
              <Stack.Screen
                name="PartnerBenefitConfirm"
                getComponent={requireScreen(
                  () => require('@/screens/PartnerBenefitConfirmScreen').PartnerBenefitConfirmScreen,
                  'PartnerBenefitConfirm',
                )}
                options={{ title: 'Valider privilège' }}
              />
            </>
          ) : (
            <>
          <Stack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen
            name="EventDetail"
            getComponent={requireScreen(
              () => withDetailPopup(require('@/screens/EventDetailScreen').EventDetailScreen),
              'EventDetail',
            )}
            options={{
              title: 'Événement',
              headerShown: false,
              presentation: DETAIL_MODAL_PRESENTATION,
              animation: DETAIL_MODAL_ANIMATION,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="SpotDetail"
            getComponent={requireScreen(
              () => withDetailPopup(require('@/screens/SpotDetailScreen').SpotDetailScreen),
              'SpotDetail',
            )}
            options={{
              title: '',
              headerShown: false,
              presentation: DETAIL_MODAL_PRESENTATION,
              animation: DETAIL_MODAL_ANIMATION,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="CreatorCornerDetail"
            getComponent={requireScreen(
              () =>
                withDetailPopup(require('@/screens/CreatorCornerDetailScreen').CreatorCornerDetailScreen),
              'CreatorCornerDetail',
            )}
            options={{
              title: 'Le Singulier',
              headerShown: false,
              presentation: DETAIL_MODAL_PRESENTATION,
              animation: DETAIL_MODAL_ANIMATION,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="FragmentDetail"
            getComponent={requireScreen(
              () => withDetailPopup(require('@/screens/FragmentDetailScreen').FragmentDetailScreen),
              'FragmentDetail',
            )}
            options={{
              title: 'Le Fragment',
              headerShown: false,
              presentation: DETAIL_MODAL_PRESENTATION,
              animation: DETAIL_MODAL_ANIMATION,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="LoopWalkDetail"
            getComponent={requireScreen(
              () => withDetailPopup(require('@/screens/LoopWalkDetailScreen').LoopWalkDetailScreen),
              'LoopWalkDetail',
            )}
            options={{
              title: 'Parcours',
              headerShown: false,
              presentation: DETAIL_MODAL_PRESENTATION,
              animation: DETAIL_MODAL_ANIMATION,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="LoopWalksList"
            getComponent={requireScreen(
              () => require('@/screens/LoopWalksListScreen').LoopWalksListScreen,
              'LoopWalksList',
            )}
            options={{ title: 'Parcours', headerBackTitle: 'Retour' }}
          />
          <Stack.Screen
            name="PartnerPublic"
            getComponent={requireScreen(
              () => require('@/screens/PartnerPublicScreen').PartnerPublicScreen,
              'PartnerPublic',
            )}
            options={{ title: 'Partenaire', headerBackTitle: 'Retour' }}
          />
          <Stack.Screen
            name="Auth"
            getComponent={requireScreen(() => require('@/screens/AuthScreen').AuthScreen, 'Auth')}
            options={{ title: 'Compte', presentation: 'modal' }}
          />
          <Stack.Screen
            name="Prime"
            getComponent={requireScreen(() => require('@/screens/PrimeScreen').PrimeScreen, 'Prime')}
            options={{ title: 'Loop Prime' }}
          />
          <Stack.Screen
            name="PassPayment"
            getComponent={requireScreen(
              () => require('@/screens/PassPaymentScreen').PassPaymentScreen,
              'PassPayment',
            )}
            options={{ title: 'Paiement PASS' }}
          />
          <Stack.Screen
            name="PartnerApply"
            getComponent={requireScreen(
              () => require('@/screens/PartnerApplyScreen').PartnerApplyScreen,
              'PartnerApply',
            )}
            options={{ title: 'Partenariat' }}
          />
          <Stack.Screen
            name="Suggestion"
            getComponent={requireScreen(
              () => require('@/screens/SuggestionScreen').SuggestionScreen,
              'Suggestion',
            )}
            options={{ title: 'Suggestion' }}
          />
          <Stack.Screen
            name="PartnerLogin"
            getComponent={requireScreen(
              () => require('@/screens/PartnerLoginScreen').PartnerLoginScreen,
              'PartnerLogin',
            )}
            options={{ title: 'Connexion Pro' }}
          />
          <Stack.Screen
            name="PartnerValidationCode"
            getComponent={requireScreen(
              () => require('@/screens/PartnerValidationCodeScreen').PartnerValidationCodeScreen,
              'PartnerValidationCode',
            )}
            options={{
              headerShown: false,
              presentation: DETAIL_MODAL_PRESENTATION,
              animation: DETAIL_MODAL_ANIMATION,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
          <Stack.Screen
            name="PartnerBenefitScan"
            getComponent={requireScreen(
              () => require('@/screens/PartnerBenefitScanScreen').PartnerBenefitScanScreen,
              'PartnerBenefitScan',
            )}
            options={{ title: 'Scanner membre', headerShown: false }}
          />
          <Stack.Screen
            name="PartnerBenefitConfirm"
            getComponent={requireScreen(
              () => require('@/screens/PartnerBenefitConfirmScreen').PartnerBenefitConfirmScreen,
              'PartnerBenefitConfirm',
            )}
            options={{ title: 'Valider privilège' }}
          />
          <Stack.Screen
            name="EditProfil"
            getComponent={requireScreen(
              () => require('@/screens/EditProfilScreen').EditProfilScreen,
              'EditProfil',
            )}
            options={{ title: 'Modifier le profil' }}
          />
          <Stack.Screen
            name="Settings"
            getComponent={requireScreen(
              () => require('@/screens/SettingsScreen').SettingsScreen,
              'Settings',
            )}
            options={{ title: 'Paramètres' }}
          />
          <Stack.Screen
            name="Abonnement"
            getComponent={requireScreen(
              () => require('@/screens/AbonnementScreen').AbonnementScreen,
              'Abonnement',
            )}
            options={{ title: 'Mon PASS' }}
          />
          <Stack.Screen
            name="AdminModeration"
            getComponent={requireScreen(
              () => require('@/screens/AdminModerationScreen').AdminModerationScreen,
              'AdminModeration',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminUsers"
            getComponent={requireScreen(
              () => require('@/screens/AdminUsersScreen').AdminUsersScreen,
              'AdminUsers',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminNotifications"
            getComponent={requireScreen(
              () => require('@/screens/AdminNotificationsScreen').AdminNotificationsScreen,
              'AdminNotifications',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminContent"
            getComponent={requireScreen(
              () => require('@/screens/AdminContentScreen').AdminContentScreen,
              'AdminContent',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminFeatured"
            getComponent={requireScreen(
              () => require('@/screens/AdminFeaturedScreen').AdminFeaturedScreen,
              'AdminFeatured',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminInsights"
            getComponent={requireScreen(
              () => require('@/screens/AdminInsightsScreen').AdminInsightsScreen,
              'AdminInsights',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminPartnerships"
            getComponent={requireScreen(
              () => require('@/screens/AdminPartnershipsScreen').AdminPartnershipsScreen,
              'AdminPartnerships',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminDemandes"
            getComponent={requireScreen(
              () => require('@/screens/AdminDemandesScreen').AdminDemandesScreen,
              'AdminDemandes',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminPartnerMilestones"
            getComponent={requireScreen(
              () => require('@/screens/AdminPartnerMilestonesScreen').AdminPartnerMilestonesScreen,
              'AdminPartnerMilestones',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminSuggestions"
            getComponent={requireScreen(
              () => require('@/screens/AdminSuggestionsScreen').AdminSuggestionsScreen,
              'AdminSuggestions',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminCreateUser"
            getComponent={requireScreen(
              () => require('@/screens/AdminCreateUserScreen').AdminCreateUserScreen,
              'AdminCreateUser',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminWaitlist"
            getComponent={requireScreen(
              () => require('@/screens/AdminWaitlistScreen').AdminWaitlistScreen,
              'AdminWaitlist',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminPrimeBenefits"
            getComponent={requireScreen(
              () => require('@/screens/AdminPrimeBenefitsScreen').AdminPrimeBenefitsScreen,
              'AdminPrimeBenefits',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminBenefitTypes"
            getComponent={requireScreen(
              () => require('@/screens/AdminBenefitTypesScreen').AdminBenefitTypesScreen,
              'AdminBenefitTypes',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminStaffBenefits"
            getComponent={requireScreen(
              () => require('@/screens/AdminStaffBenefitsScreen').AdminStaffBenefitsScreen,
              'AdminStaffBenefits',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminBenefitDraw"
            getComponent={requireScreen(
              () => require('@/screens/AdminBenefitDrawScreen').AdminBenefitDrawScreen,
              'AdminBenefitDraw',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminLoopContent"
            getComponent={requireScreen(
              () => require('@/screens/AdminLoopContentScreen').AdminLoopContentScreen,
              'AdminLoopContent',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminLoopFeatured"
            getComponent={requireScreen(
              () => require('@/screens/AdminLoopFeaturedScreen').AdminLoopFeaturedScreen,
              'AdminLoopFeatured',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminLoopStats"
            getComponent={requireScreen(
              () => require('@/screens/AdminLoopStatsScreen').AdminLoopStatsScreen,
              'AdminLoopStats',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminLoopBenefits"
            getComponent={requireScreen(
              () => require('@/screens/AdminLoopBenefitsScreen').AdminLoopBenefitsScreen,
              'AdminLoopBenefits',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminAutomationJobs"
            getComponent={requireScreen(
              () => require('@/screens/AdminAutomationJobsScreen').AdminAutomationJobsScreen,
              'AdminAutomationJobs',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminLegal"
            getComponent={requireScreen(
              () => require('@/screens/AdminLegalScreen').AdminLegalScreen,
              'AdminLegal',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminPermissions"
            getComponent={requireScreen(
              () => require('@/screens/AdminPermissionsScreen').AdminPermissionsScreen,
              'AdminPermissions',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminCategories"
            getComponent={requireScreen(
              () => require('@/screens/AdminCategoriesScreen').AdminCategoriesScreen,
              'AdminCategories',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminOpeningHours"
            getComponent={requireScreen(
              () => require('@/screens/AdminOpeningHoursScreen').AdminOpeningHoursScreen,
              'AdminOpeningHours',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminPassManagement"
            getComponent={requireScreen(
              () => require('@/screens/AdminPassManagementScreen').AdminPassManagementScreen,
              'AdminPassManagement',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminPayments"
            getComponent={requireScreen(
              () => require('@/screens/AdminPaymentsScreen').AdminPaymentsScreen,
              'AdminPayments',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminCompta"
            getComponent={requireScreen(
              () => require('@/screens/AdminComptaScreen').AdminComptaScreen,
              'AdminCompta',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminSpotStars"
            getComponent={requireScreen(
              () => require('@/screens/AdminSpotStarsScreen').AdminSpotStarsScreen,
              'AdminSpotStars',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminContentCountries"
            getComponent={requireScreen(
              () => require('@/screens/AdminContentCountriesScreen').AdminContentCountriesScreen,
              'AdminContentCountries',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminSuperSettings"
            getComponent={requireScreen(
              () => require('@/screens/AdminSuperSettingsScreen').AdminSuperSettingsScreen,
              'AdminSuperSettings',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="AdminStandaloneBenefit"
            getComponent={requireScreen(
              () => require('@/screens/AdminStandaloneBenefitScreen').AdminStandaloneBenefitScreen,
              'AdminStandaloneBenefit',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="MyBenefits"
            getComponent={requireScreen(
              () => require('@/screens/MyBenefitsScreen').MyBenefitsScreen,
              'MyBenefits',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Notifications"
            getComponent={requireScreen(
              () => require('@/screens/NotificationsScreen').NotificationsScreen,
              'Notifications',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Referral"
            getComponent={requireScreen(
              () => require('@/screens/ReferralScreen').ReferralScreen,
              'Referral',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PartnerSubmission"
            getComponent={requireScreen(
              () => require('@/screens/PartnerSubmissionScreen').PartnerSubmissionScreen,
              'PartnerSubmission',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PartnerContent"
            getComponent={requireScreen(
              () => require('@/screens/PartnerContentScreen').PartnerContentScreen,
              'PartnerContent',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PartnerBenefits"
            getComponent={requireScreen(
              () => require('@/screens/PartnerBenefitsScreen').PartnerBenefitsScreen,
              'PartnerBenefits',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PartnerFeatured"
            getComponent={requireScreen(
              () => require('@/screens/PartnerFeaturedScreen').PartnerFeaturedScreen,
              'PartnerFeatured',
            )}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="PartnerRewards"
            getComponent={requireScreen(
              () => require('@/screens/PartnerRewardsScreen').PartnerRewardsScreen,
              'PartnerRewards',
            )}
            options={{ headerShown: false }}
          />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}
