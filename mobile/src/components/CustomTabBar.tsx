import { useCallback, useEffect, useState } from 'react';
import { AppState, Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { PrimeBadge } from '@/components/PrimeBadge';
import { AdminBadge } from '@/components/AdminBadge';
import { useAuthContext } from '@/context/AuthContext';
import { useContent } from '@/context/ContentContext';
import { useFavoritesSignup } from '@/context/FavoritesSignupContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { DEFAULT_SECTIONS, getAppSections, type AppSectionsConfig } from '@/lib/app-sections-store';
import { subscribeHomeRefresh } from '@/lib/home-refresh';
import { canViewPrimeContent, isAuthenticated, type UserRole } from '@/types';

/** Onglets réservés aux comptes connectés — sans compte = écran Auth uniquement (RootNavigator). */
const ALL_TABS = [
  { name: 'Accueil', icon: '🏠', roles: ['USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN'] as UserRole[] },
  { name: 'Agenda', icon: '📅', sectionKey: 'agenda' as const, roles: ['USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN'] as UserRole[] },
  { name: 'Spots', icon: '🏛️', sectionKey: 'spots' as const, roles: ['USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN'] as UserRole[] },
  { name: 'Outils', icon: '🛠️', sectionKey: 'outils' as const, roles: ['USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN'] as UserRole[] },
  { name: 'Favoris', icon: '❤️', roles: ['USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN'] as UserRole[] },
  { name: 'PartnerPro', label: 'Pro', icon: '🏢', roles: ['PARTNER'] as UserRole[] },
  { name: 'AdminTower', label: 'Administration', icon: '⚙️', roles: ['ADMIN'] as UserRole[] },
  { name: 'Profil', icon: '👤', roles: ['USER_FREE', 'USER_PRIME', 'PARTNER', 'ADMIN'] as UserRole[] },
] as const;

/** Onglets accessibles hors barre (navigation depuis Pro, etc.) */
const HIDDEN_TAB_ROUTES: Partial<Record<UserRole, readonly string[]>> = {
  PARTNER: ['PartnerStats'],
};

function isTabVisibleBySections(
  tab: (typeof ALL_TABS)[number],
  sections: AppSectionsConfig,
): boolean {
  if ('sectionKey' in tab && tab.sectionKey) {
    return sections[tab.sectionKey].tabVisible;
  }
  if (tab.name === 'PartnerPro') {
    return sections.partnerPro.spaceVisible;
  }
  return true;
}

function TabBarIcon({ emoji, isFocused }: { emoji: string; isFocused: boolean }) {
  return (
    <Text
      allowFontScaling={false}
      style={[
        styles.icon,
        Platform.OS === 'ios' && styles.iconIos,
        isFocused ? styles.iconFocused : styles.iconIdle,
      ]}
    >
      {emoji}
    </Text>
  );
}

export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { role, user } = useAuthContext();
  const { activeCountryCode } = useContent();
  const { openSignupSheet } = useFavoritesSignup();
  const { shell, theme } = useMemberTheme();
  const [sections, setSections] = useState<AppSectionsConfig>(DEFAULT_SECTIONS);
  const tabs = ALL_TABS.filter((tab) => tab.roles.includes(role) && isTabVisibleBySections(tab, sections));
  const isPrime = role !== 'ADMIN' && canViewPrimeContent(role, user ?? undefined);
  const isAdmin = role === 'ADMIN';
  const loggedIn = isAuthenticated(role);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  const currentRoute = state.routes[state.index]?.name;
  const tabSurface = shell.tabBarBg;

  const reloadTabSections = useCallback(async (force = false) => {
    const next = await getAppSections(activeCountryCode, { force });
    setSections(next);
  }, [activeCountryCode]);

  useEffect(() => {
    void reloadTabSections(false);
  }, [activeCountryCode, user?.id, role, reloadTabSections]);

  useEffect(
    () =>
      subscribeHomeRefresh((reason) => {
        if (reason === 'sections') {
          void reloadTabSections(false);
          return;
        }
        if (reason === 'auth-session') {
          void reloadTabSections(true);
        }
      }),
    [reloadTabSections],
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void reloadTabSections(true);
    });
    return () => sub.remove();
  }, [reloadTabSections]);

  useEffect(() => {
    const allowed: string[] = ALL_TABS.filter((t) => t.roles.includes(role) && isTabVisibleBySections(t, sections)).map(
      (t) => t.name,
    );
    const hidden = HIDDEN_TAB_ROUTES[role] ?? [];
    if (currentRoute && !allowed.includes(currentRoute) && !hidden.includes(currentRoute)) {
      navigation.navigate('Accueil' as never);
    }
  }, [currentRoute, role, navigation, sections]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const tabBarElevation =
    Platform.OS === 'ios'
      ? {
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.12,
          shadowRadius: 10,
        }
      : theme.elevation.tabBar;

  // Ne jamais démonter la tab bar (return null) : crash Android
  // getChildDrawingOrder / IndexOutOfBoundsException.
  return (
    <View
      style={[
        styles.root,
        tabBarElevation,
        { backgroundColor: tabSurface, borderTopColor: shell.tabBarBorder },
        keyboardVisible ? styles.rootHidden : null,
      ]}
      pointerEvents={keyboardVisible ? 'none' : 'auto'}
      collapsable={false}
    >
      <View style={[styles.accentLine, { backgroundColor: theme.colors.accent }]} />
      <View
        style={[
          styles.bar,
          {
            backgroundColor: tabSurface,
            paddingBottom: Math.max(insets.bottom, 6),
          },
        ]}
      >
        {tabs.map((tab) => {
          const routeIndex = state.routes.findIndex((r) => r.name === tab.name);
          if (routeIndex < 0) return null;
          const isFocused = state.index === routeIndex;
          const label =
            tab.name === 'PartnerPro'
              ? 'Pro'
              : 'label' in tab
                ? tab.label
                : tab.name;
          const showAdminBadge = tab.name === 'AdminTower' && isAdmin;

          return (
            <Pressable
              key={tab.name}
              style={styles.tab}
              onPress={() => {
                if (tab.name === 'Profil' && !loggedIn) {
                  const parent = navigation.getParent();
                  openSignupSheet({
                    navigate: (name, params) => {
                      if (parent) {
                        (parent.navigate as (screen: string, p?: object) => void)(name, params);
                        return;
                      }
                      (navigation.navigate as (screen: string) => void)(name);
                    },
                  });
                  return;
                }
                navigation.navigate(tab.name);
              }}
            >
              <View style={styles.iconWrap}>
                <TabBarIcon emoji={tab.icon} isFocused={isFocused} />
                {showAdminBadge ? (
                  <View style={styles.roleBadgePos}>
                    <AdminBadge size="sm" />
                  </View>
                ) : tab.name === 'Profil' && isPrime ? (
                  <View style={styles.roleBadgePos}>
                    <PrimeBadge size="sm" />
                  </View>
                ) : null}
              </View>
              <Text
                style={[
                  styles.label,
                  label.length > 9 && styles.labelCompact,
                  isFocused && styles.labelActive,
                  { color: isFocused ? shell.tabActive : shell.tabInactive },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.65}
              >
                {label}
              </Text>
              {isFocused ? (
                <View style={[styles.indicator, { backgroundColor: shell.tabIndicator }, theme.elevation.pillActive]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rootHidden: {
    height: 0,
    overflow: 'hidden',
    opacity: 0,
    borderTopWidth: 0,
  },
  accentLine: { height: 2, width: '100%', opacity: 1 },
  bar: { flexDirection: 'row', paddingTop: 6, minHeight: 58 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  iconWrap: { position: 'relative', height: 28, alignItems: 'center', justifyContent: 'center' },
  /** Jamais de `color` sur l'emoji — iOS le rendrait monochrome. */
  icon: {
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
  },
  iconIos: {
    fontSize: 23,
    lineHeight: 27,
  },
  iconFocused: {
    opacity: 1,
    transform: [{ scale: 1.1 }],
  },
  iconIdle: {
    opacity: 1,
  },
  roleBadgePos: { position: 'absolute', bottom: -2, right: -6 },
  label: { fontSize: 9, fontWeight: '600', maxWidth: '100%', textAlign: 'center' },
  labelActive: { fontWeight: '800' },
  labelCompact: { fontSize: 7, letterSpacing: -0.15 },
  indicator: { marginTop: 2, height: 2, width: 20, borderRadius: 999 },
});
