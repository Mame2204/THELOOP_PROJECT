import type { UserRole } from '@/types';
import type { ViewStyle } from 'react-native';

/** Clés design — mappées depuis UserRole */
export type ThemeId =
  | 'VISITOR'
  | 'FREE_MEMBER'
  | 'PRIME_MEMBER'
  | 'PARTNER'
  | 'ADMIN'
  | 'DELEGATED_ADMIN';

export type MemberGrade = 'anonymous' | 'member' | 'prime' | 'partner' | 'admin';

/** Or THE LOOP — unique référence */
export const LOOP_GOLD = '#D4AF37';

/**
 * Design system v3 — identité par rôle avec atmosphère, profondeur et surfaces travaillées.
 * Logo non concerné (LoopLogo reste autonome).
 */
export const BRAND = {
  /** Thème Auth (sans compte) — teal clair */
  VISITOR: { accent: '#12A8BC', accentDeep: '#0D7A8C', bg: '#F4FCFD', text: '#1A1A1A' },
  /** Membre gratuit — teal plus foncé */
  FREE_MEMBER: { accent: '#0D7A8C', accentDeep: '#065A66', bg: '#E0F2F5', text: '#1A1A1A' },
  /** Loop Prime — indigo */
  PRIME_MEMBER: { accent: '#1A237E', accentDeep: '#0D1457', bg: '#EEF1FA', text: '#1A1A1A' },
  /** Partenaire — vert teal */
  PARTNER: { accent: '#20C997', accentDeep: '#0D9488', bg: '#F0FDF9', text: '#1A1A1A' },
  ADMIN: { accent: '#8E1631', accentDeep: '#6B0F24', bg: '#ECEEF2', text: '#2D3436' },
  /** Admins délégués — distinct du bordeaux fondateur. */
  DELEGATED_ADMIN: { accent: '#546E7A', accentDeep: '#37474F', bg: '#ECEFF1', text: '#263238' },
} as const;

export interface LoopAtmosphere {
  heroWash: string;
  glowPrimary: string;
  glowSecondary: string;
  headerPanelBg: string;
  showAccentStripe: boolean;
}

export interface LoopElevation {
  backdrop: ViewStyle;
  card: ViewStyle;
  tabBar: ViewStyle;
  pillActive: ViewStyle;
}

export interface LoopThemeColors {
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  borderSubtle: string;
  textPrimary: string;
  textSecondary: string;
  textInverse: string;
  textMuted: string;
  accent: string;
  accentDeep: string;
  accentSoft: string;
  accentBorder: string;
  ctaBg: string;
  ctaText: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  tabBarBg: string;
  tabBarBorder: string;
  tabActive: string;
  tabInactive: string;
  tabIndicator: string;
  filterActiveBg: string;
  filterActiveText: string;
  filterInactiveBg: string;
  filterInactiveText: string;
  filterInactiveBorder: string;
  kpiValue: string;
  kpiLabel: string;
  tableHeaderBg: string;
  tableRowBorder: string;
}

export interface LoopTheme {
  id: ThemeId;
  isDark: boolean;
  isPremium: boolean;
  label: string;
  colors: LoopThemeColors;
  atmosphere: LoopAtmosphere;
  elevation: LoopElevation;
  typography: {
    pageTitleSize: number;
    kickerSize: number;
    kpiValueSize: number;
    titleWeight: '700' | '800' | '900';
  };
  radius: {
    card: number;
    button: number;
    chip: number;
    header: number;
  };
}

/** API legacy — compatibilité écrans existants */
export interface ShellTheme {
  pageBg: string;
  pageTitle: string;
  pageKicker: string;
  filterActiveBg: string;
  filterActiveText: string;
  filterInactiveBg: string;
  filterInactiveText: string;
  filterInactiveBorder: string;
  tabBarBg: string;
  tabBarBorder: string;
  tabActive: string;
  tabInactive: string;
  tabIndicator: string;
  isDark: boolean;
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function cardShadow(accent: string, opacity = 0.12): ViewStyle {
  return {
    shadowColor: accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: opacity,
    shadowRadius: 14,
    elevation: 4,
  };
}

const ROLE_LABELS: Record<ThemeId, string> = {
  VISITOR: 'Découverte',
  FREE_MEMBER: 'Membre',
  PRIME_MEMBER: 'Loop Prime',
  PARTNER: 'Partenaire',
  ADMIN: 'Control Tower',
  DELEGATED_ADMIN: 'Admin',
};

function buildAtmosphere(id: ThemeId, accent: string): LoopAtmosphere {
  switch (id) {
    case 'VISITOR':
      return {
        heroWash: withAlpha(accent, 0.14),
        glowPrimary: withAlpha(accent, 0.2),
        glowSecondary: withAlpha('#4DD0E1', 0.1),
        headerPanelBg: 'rgba(255,255,255,0.88)',
        showAccentStripe: false,
      };
    case 'FREE_MEMBER':
      return {
        heroWash: withAlpha(accent, 0.14),
        glowPrimary: withAlpha(accent, 0.2),
        glowSecondary: withAlpha('#4DD0E1', 0.1),
        headerPanelBg: 'rgba(255,255,255,0.84)',
        showAccentStripe: false,
      };
    case 'PRIME_MEMBER':
      return {
        heroWash: withAlpha(accent, 0.14),
        glowPrimary: withAlpha(accent, 0.2),
        glowSecondary: withAlpha('#3949AB', 0.1),
        headerPanelBg: 'rgba(255,255,255,0.86)',
        showAccentStripe: false,
      };
    case 'PARTNER':
      return {
        heroWash: withAlpha(accent, 0.16),
        glowPrimary: withAlpha(accent, 0.24),
        glowSecondary: withAlpha('#14B8A6', 0.12),
        headerPanelBg: 'rgba(255,255,255,0.82)',
        showAccentStripe: false,
      };
    case 'ADMIN':
      return {
        heroWash: withAlpha(accent, 0.1),
        glowPrimary: withAlpha(accent, 0.18),
        glowSecondary: withAlpha('#636E72', 0.1),
        headerPanelBg: 'rgba(255,255,255,0.94)',
        showAccentStripe: true,
      };
    case 'DELEGATED_ADMIN':
      return {
        heroWash: withAlpha(accent, 0.12),
        glowPrimary: withAlpha(accent, 0.18),
        glowSecondary: withAlpha('#78909C', 0.12),
        headerPanelBg: 'rgba(255,255,255,0.92)',
        showAccentStripe: false,
      };
  }
}

function buildTheme(id: ThemeId): LoopTheme {
  const brand = BRAND[id];
  const isSuperAdminTheme = id === 'ADMIN';
  const isDelegatedAdmin = id === 'DELEGATED_ADMIN';
  const isAdminTheme = isSuperAdminTheme || isDelegatedAdmin;
  const isPrime = id === 'PRIME_MEMBER';
  const isPremium = isPrime;
  const isPrimeChrome = false;
  const atmosphere = buildAtmosphere(id, brand.accent);

  const filterActiveText = '#FFFFFF';
  const surface = '#FFFFFF';
  const surfaceElevated = isPrimeChrome ? '#F5F7FF' : isAdminTheme ? '#FFFFFF' : '#FFFFFF';
  const filterInactiveBg = isPrimeChrome ? withAlpha(brand.accent, 0.1) : isAdminTheme ? '#FFFFFF' : withAlpha(brand.accent, 0.06);
  const tabBarBg = isPrimeChrome
    ? '#EEF1FA'
    : isAdminTheme
      ? '#FFFFFF'
      : '#FFFFFF';

  const ctaBg = brand.accentDeep;
  const ctaText = '#FFFFFF';

  const cardRadius = isPrimeChrome ? 16 : isAdminTheme ? 10 : 14;
  const elevation = cardShadow(brand.accent, isPrimeChrome ? 0.18 : 0.14);

  return {
    id,
    label: ROLE_LABELS[id],
    isDark: false,
    isPremium,
    colors: {
      background: brand.bg,
      backgroundAlt: withAlpha(brand.accent, 0.06),
      surface,
      surfaceElevated,
      border: isAdminTheme ? '#CBD5E1' : withAlpha(brand.accent, 0.24),
      borderSubtle: withAlpha(brand.accent, 0.12),
      textPrimary: isAdminTheme ? brand.text : '#111827',
      textSecondary: '#475569',
      textInverse: '#FFFFFF',
      textMuted: '#94A3B8',
      accent: brand.accent,
      accentDeep: brand.accentDeep,
      accentSoft: withAlpha(brand.accent, isPrimeChrome ? 0.16 : 0.12),
      accentBorder: withAlpha(brand.accent, 0.45),
      ctaBg,
      ctaText,
      success: '#2E7D32',
      warning: '#F59E0B',
      error: '#EF4444',
      info: isAdminTheme ? brand.accent : BRAND.VISITOR.accent,
      tabBarBg,
      tabBarBorder: isAdminTheme ? '#CBD5E1' : withAlpha(brand.accent, 0.32),
      tabActive: brand.accentDeep,
      tabInactive: '#64748B',
      tabIndicator: brand.accent,
      filterActiveBg: brand.accent,
      filterActiveText,
      filterInactiveBg,
      filterInactiveText: '#475569',
      filterInactiveBorder: withAlpha(brand.accent, 0.28),
      kpiValue: brand.accentDeep,
      kpiLabel: '#475569',
      tableHeaderBg: isAdminTheme ? '#E2E6EA' : filterInactiveBg,
      tableRowBorder: isAdminTheme ? '#D1D5DB' : withAlpha(brand.accent, 0.12),
    },
    atmosphere,
    elevation: {
      backdrop: {},
      card: elevation,
      tabBar: {
        shadowColor: brand.accentDeep,
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: isPrimeChrome ? 0.14 : 0.08,
        shadowRadius: 12,
        elevation: 12,
      },
      pillActive: {
        shadowColor: brand.accent,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 3,
      },
    },
    typography: {
      pageTitleSize: isPrimeChrome ? 24 : 22,
      kickerSize: 10,
      kpiValueSize: 28,
      titleWeight: isPrimeChrome ? '900' : '800',
    },
    radius: {
      card: cardRadius,
      button: isAdminTheme ? 8 : 12,
      chip: 999,
      header: 20,
    },
  };
}

export const THEMES: Record<ThemeId, LoopTheme> = {
  VISITOR: buildTheme('VISITOR'),
  FREE_MEMBER: buildTheme('FREE_MEMBER'),
  PARTNER: buildTheme('PARTNER'),
  PRIME_MEMBER: buildTheme('PRIME_MEMBER'),
  ADMIN: buildTheme('ADMIN'),
  DELEGATED_ADMIN: buildTheme('DELEGATED_ADMIN'),
};

export function resolveThemeId(role: UserRole): ThemeId {
  switch (role) {
    case 'USER_ANONYMOUS':
      return 'VISITOR';
    case 'USER_FREE':
      return 'FREE_MEMBER';
    case 'USER_PRIME':
      return 'PRIME_MEMBER';
    case 'PARTNER':
      return 'PARTNER';
    case 'ADMIN':
      return 'ADMIN';
    default:
      return 'FREE_MEMBER';
  }
}

export function getTheme(id: ThemeId): LoopTheme {
  return THEMES[id];
}

export function themeIdToMemberGrade(id: ThemeId): MemberGrade {
  switch (id) {
    case 'VISITOR':
      return 'anonymous';
    case 'FREE_MEMBER':
      return 'member';
    case 'PRIME_MEMBER':
      return 'prime';
    case 'PARTNER':
      return 'partner';
    case 'ADMIN':
      return 'admin';
    case 'DELEGATED_ADMIN':
      return 'admin';
  }
}

export function toShellTheme(theme: LoopTheme): ShellTheme {
  const c = theme.colors;
  return {
    pageBg: c.background,
    pageTitle: c.textPrimary,
    pageKicker: c.textSecondary,
    filterActiveBg: c.filterActiveBg,
    filterActiveText: c.filterActiveText,
    filterInactiveBg: c.filterInactiveBg,
    filterInactiveText: c.filterInactiveText,
    filterInactiveBorder: c.filterInactiveBorder,
    tabBarBg: c.tabBarBg,
    tabBarBorder: c.tabBarBorder,
    tabActive: c.tabActive,
    tabInactive: c.tabInactive,
    tabIndicator: c.tabIndicator,
    isDark: theme.isDark,
  };
}

/** Routes Control Tower + modules admin → thème ADMIN */
export const ADMIN_THEME_ROUTES = new Set([
  'AdminTower',
  'AdminHome',
  'AdminAccueil',
  'AdminRubrique',
  'AdminLoopHub',
  'AdminModeration',
  'AdminUsers',
  'AdminNotifications',
  'AdminContent',
  'AdminFeatured',
  'AdminInsights',
  'AdminPartnerships',
  'AdminPartnerMilestones',
  'AdminReferralSettings',
  'AdminSuggestions',
  'AdminCreateUser',
  'AdminWaitlist',
  'AdminPrimeBenefits',
  'AdminStaffBenefits',
  'AdminBenefitDraw',
  'AdminLoopContent',
  'AdminLoopFeatured',
  'AdminLoopStats',
  'AdminLoopBenefits',
  'AdminAutomationJobs',
  'AdminLegal',
  'AdminPermissions',
  'AdminCategories',
  'AdminSpotStars',
  'AdminContentCountries',
  'AdminOpeningHours',
  'AdminPassManagement',
  'AdminSuperSettings',
  'AdminStandaloneBenefit',
  'AdminBenefitTypes',
  'PassPayment',
]);

export function resolveMemberGrade(userRole: string | null | undefined, appRole: UserRole): MemberGrade {
  return themeIdToMemberGrade(resolveThemeId(appRole));
}

export function getShellTheme(grade: MemberGrade): ShellTheme {
  const id: ThemeId =
    grade === 'anonymous'
      ? 'VISITOR'
      : grade === 'member'
        ? 'FREE_MEMBER'
        : grade === 'prime'
          ? 'PRIME_MEMBER'
          : grade === 'partner'
            ? 'PARTNER'
            : 'ADMIN';
  return toShellTheme(getTheme(id));
}
