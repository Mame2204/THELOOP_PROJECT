import type { UserRole } from '@/types';

/** Grades visuels THE LOOP — charte définitive (contraste strict). */
export type MemberGrade = 'anonymous' | 'member' | 'prime' | 'partner' | 'admin';

export type DevGradeOverride = MemberGrade | 'auto';

export const DEV_GRADE_OVERRIDE_KEY = 'loop_dev_grade_preview';

export interface MemberGradeShell {
  headerBg: string;
  headerBorder: string;
  searchBtn: string;
  searchBtnActive: string;
  searchBar: string;
  searchInput: string;
  searchIcon: string;
  searchClose: string;
  bellStroke: string;
  bellBtn: string;
  pageTint: string;
  pageTitle: string;
  pageKicker: string;
  filterActive: string;
  filterInactive: string;
  navActive: string;
}

export interface MemberGradeTheme {
  grade: MemberGrade;
  badgeLabel: string;
  card: {
    wrapper: string;
    glow: string;
    brandText: string;
    subtitleText: string;
    nameText: string;
    emailText: string;
    badge: string;
    tokenText: string;
    qrFrame: string;
    qrFg: string;
    qrBg: string;
  };
  profile: {
    pageBg: string;
    pageTitle: string;
    pageKicker: string;
    panelBorder: string;
    panelBg: string;
    header: string;
    headerNameText: string;
    headerEmailText: string;
    avatarRing: string;
    avatarText: string;
    headerBadge: string;
    detailsDivide: string;
    detailsLabel: string;
    detailsValue: string;
    editButton: string;
    formBg: string;
    formLabel: string;
    formInput: string;
  };
  nav: {
    avatarRing: string;
    avatarBg: string;
    avatarText: string;
  };
  shell: MemberGradeShell;
}

const THEMES: Record<MemberGrade, MemberGradeTheme> = {
  /* Noir sur Blanc — fond blanc, tout en noir pur */
  anonymous: {
    grade: 'anonymous',
    badgeLabel: 'Visiteur',
    card: {
      wrapper: 'grade-card-anonymous border-2 shadow-sm',
      glow: 'bg-black/5',
      brandText: 'text-black',
      subtitleText: 'text-neutral-600',
      nameText: 'text-black',
      emailText: 'text-neutral-700',
      badge: 'grade-badge-anonymous',
      tokenText: 'text-neutral-500',
      qrFrame: 'grade-qr-anonymous',
      qrFg: '#000000',
      qrBg: '#ffffff',
    },
    profile: {
      pageBg: 'bg-white text-black',
      pageTitle: 'text-black',
      pageKicker: 'text-neutral-600',
      panelBorder: 'border-black',
      panelBg: 'bg-white',
      header: 'grade-header-anonymous',
      headerNameText: 'text-black',
      headerEmailText: 'text-neutral-700',
      avatarRing: 'grade-avatar-anonymous',
      avatarText: 'text-black',
      headerBadge: 'grade-badge-anonymous',
      detailsDivide: 'divide-neutral-200',
      detailsLabel: 'text-neutral-600',
      detailsValue: 'text-black',
      editButton: 'border-black text-black hover:bg-neutral-100',
      formBg: 'bg-white text-black',
      formLabel: 'text-neutral-600',
      formInput: 'border-black bg-white text-black placeholder:text-neutral-400 focus:border-black',
    },
    nav: {
      avatarRing: 'border-black',
      avatarBg: 'bg-white',
      avatarText: 'text-black',
    },
    shell: {
      headerBg: 'bg-white',
      headerBorder: 'border-black',
      searchBtn: 'border-black bg-white text-black hover:bg-neutral-100',
      searchBtnActive: 'border-black bg-black text-white',
      searchBar: 'border-black bg-white',
      searchInput: 'border-black bg-white text-black placeholder:text-neutral-400 focus:border-black',
      searchIcon: 'text-black',
      searchClose: 'text-black',
      bellStroke: '#000000',
      bellBtn: 'border-black bg-white text-black hover:bg-neutral-100',
      pageTint: 'bg-white text-black',
      pageTitle: 'text-black',
      pageKicker: 'text-neutral-600',
      filterActive: 'bg-black text-white',
      filterInactive: 'border-black bg-white text-black hover:bg-neutral-50',
      navActive: 'text-black',
    },
  },

  /* Gris sur Noir — fond anthracite, détails silver */
  member: {
    grade: 'member',
    badgeLabel: 'Membre · Gratuit',
    card: {
      wrapper: 'grade-card-member border-2 shadow-lg',
      glow: 'bg-neutral-500/10',
      brandText: 'text-neutral-300',
      subtitleText: 'text-neutral-400',
      nameText: 'text-neutral-100',
      emailText: 'text-neutral-400',
      badge: 'grade-badge-member',
      tokenText: 'text-neutral-500',
      qrFrame: 'grade-qr-member',
      qrFg: '#e5e7eb',
      qrBg: '#111111',
    },
    profile: {
      pageBg: 'bg-neutral-950 text-neutral-100',
      pageTitle: 'text-neutral-100',
      pageKicker: 'text-neutral-400',
      panelBorder: 'border-neutral-700',
      panelBg: 'bg-neutral-900',
      header: 'grade-header-member',
      headerNameText: 'text-neutral-100',
      headerEmailText: 'text-neutral-400',
      avatarRing: 'grade-avatar-member',
      avatarText: 'text-neutral-900',
      headerBadge: 'grade-badge-member',
      detailsDivide: 'divide-neutral-800',
      detailsLabel: 'text-neutral-500',
      detailsValue: 'text-neutral-100',
      editButton: 'border-neutral-500 text-neutral-200 hover:bg-neutral-800',
      formBg: 'bg-neutral-900 text-neutral-100',
      formLabel: 'text-neutral-500',
      formInput: 'border-neutral-600 bg-neutral-800 text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400',
    },
    nav: {
      avatarRing: 'border-neutral-500',
      avatarBg: 'grade-avatar-member',
      avatarText: 'text-neutral-900',
    },
    shell: {
      headerBg: 'bg-neutral-950',
      headerBorder: 'border-neutral-700',
      searchBtn: 'border-neutral-600 bg-neutral-900 text-neutral-200 hover:border-neutral-400',
      searchBtnActive: 'border-neutral-400 bg-neutral-800 text-neutral-100',
      searchBar: 'border-neutral-800 bg-neutral-950',
      searchInput: 'border-neutral-700 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400',
      searchIcon: 'text-neutral-400',
      searchClose: 'text-neutral-400',
      bellStroke: '#d1d5db',
      bellBtn: 'border-neutral-600 bg-neutral-900 hover:border-neutral-400',
      pageTint: 'bg-neutral-950 text-neutral-100',
      pageTitle: 'text-neutral-100',
      pageKicker: 'text-neutral-400',
      filterActive: 'bg-neutral-200 text-neutral-900',
      filterInactive: 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-neutral-500',
      navActive: 'text-neutral-300',
    },
  },

  /* Doré prestigieux — fond sombre contrasté, accents gold */
  prime: {
    grade: 'prime',
    badgeLabel: 'Loop Prime · Premium',
    card: {
      wrapper: 'grade-card-prime border-2 shadow-xl',
      glow: 'bg-amber-600/10',
      brandText: 'text-amber-200',
      subtitleText: 'text-neutral-400',
      nameText: 'text-white',
      emailText: 'text-neutral-300',
      badge: 'grade-badge-prime',
      tokenText: 'text-neutral-500',
      qrFrame: 'grade-qr-prime',
      qrFg: '#1a1208',
      qrBg: '#fffbeb',
    },
    profile: {
      pageBg: 'bg-black text-white',
      pageTitle: 'text-white',
      pageKicker: 'text-amber-300',
      panelBorder: 'border-amber-800/50',
      panelBg: 'bg-neutral-950',
      header: 'grade-header-prime',
      headerNameText: 'text-white',
      headerEmailText: 'text-neutral-300',
      avatarRing: 'grade-avatar-prime',
      avatarText: 'text-amber-950',
      headerBadge: 'grade-badge-prime',
      detailsDivide: 'divide-neutral-800',
      detailsLabel: 'text-neutral-500',
      detailsValue: 'text-white',
      editButton: 'border-amber-500 text-amber-100 hover:bg-amber-950/50',
      formBg: 'bg-neutral-900 text-white',
      formLabel: 'text-neutral-500',
      formInput: 'border-neutral-700 bg-neutral-800 text-white placeholder:text-neutral-500 focus:border-amber-500',
    },
    nav: {
      avatarRing: 'border-amber-500',
      avatarBg: 'grade-avatar-prime',
      avatarText: 'text-amber-950',
    },
    shell: {
      headerBg: 'bg-black',
      headerBorder: 'border-amber-800/60',
      searchBtn: 'border-neutral-700 bg-neutral-900 text-white hover:border-amber-500',
      searchBtnActive: 'border-amber-500 bg-amber-950 text-amber-100',
      searchBar: 'border-amber-900/50 bg-black',
      searchInput: 'border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500 focus:border-amber-500',
      searchIcon: 'text-neutral-400',
      searchClose: 'text-neutral-400',
      bellStroke: '#c9a84c',
      bellBtn: 'border-neutral-700 bg-neutral-900 hover:border-amber-500',
      pageTint: 'bg-black text-white',
      pageTitle: 'text-white',
      pageKicker: 'text-amber-300',
      filterActive: 'bg-amber-600 text-white',
      filterInactive: 'border-neutral-700 bg-neutral-900 text-neutral-400 hover:border-amber-700',
      navActive: 'text-amber-400',
    },
  },

  /* Vert Émeraude — club privé */
  partner: {
    grade: 'partner',
    badgeLabel: 'Partenaire · Club Privé',
    card: {
      wrapper: 'grade-card-partner border-2 shadow-xl',
      glow: 'bg-emerald-500/10',
      brandText: 'text-emerald-100',
      subtitleText: 'text-emerald-200/70',
      nameText: 'text-white',
      emailText: 'text-emerald-100/80',
      badge: 'grade-badge-partner',
      tokenText: 'text-emerald-300/50',
      qrFrame: 'grade-qr-partner',
      qrFg: '#022c22',
      qrBg: '#ffffff',
    },
    profile: {
      pageBg: 'bg-emerald-950 text-white',
      pageTitle: 'text-white',
      pageKicker: 'text-emerald-300',
      panelBorder: 'border-emerald-700/60',
      panelBg: 'bg-emerald-950',
      header: 'grade-header-partner',
      headerNameText: 'text-white',
      headerEmailText: 'text-emerald-100/80',
      avatarRing: 'grade-avatar-partner',
      avatarText: 'text-emerald-950',
      headerBadge: 'grade-badge-partner',
      detailsDivide: 'divide-emerald-900/60',
      detailsLabel: 'text-emerald-300/60',
      detailsValue: 'text-white',
      editButton: 'border-emerald-400 text-emerald-50 hover:bg-emerald-900',
      formBg: 'bg-emerald-900 text-white',
      formLabel: 'text-emerald-300/70',
      formInput: 'border-emerald-700 bg-emerald-950 text-white placeholder:text-emerald-400/50 focus:border-emerald-400',
    },
    nav: {
      avatarRing: 'border-emerald-400',
      avatarBg: 'grade-avatar-partner',
      avatarText: 'text-emerald-950',
    },
    shell: {
      headerBg: 'bg-emerald-950',
      headerBorder: 'border-emerald-700/60',
      searchBtn: 'border-emerald-800 bg-emerald-950 text-white hover:border-emerald-400',
      searchBtnActive: 'border-emerald-400 bg-emerald-900 text-emerald-50',
      searchBar: 'border-emerald-800 bg-emerald-950',
      searchInput: 'border-emerald-800 bg-emerald-900 text-white placeholder:text-emerald-400/50 focus:border-emerald-400',
      searchIcon: 'text-emerald-400',
      searchClose: 'text-emerald-300',
      bellStroke: '#34d399',
      bellBtn: 'border-emerald-800 bg-emerald-950 hover:border-emerald-400',
      pageTint: 'bg-emerald-950 text-white',
      pageTitle: 'text-white',
      pageKicker: 'text-emerald-300',
      filterActive: 'bg-emerald-500 text-white',
      filterInactive: 'border-emerald-800 bg-emerald-900/50 text-emerald-200/70 hover:border-emerald-600',
      navActive: 'text-emerald-400',
    },
  },

  /* Bleu Nuit Électrique */
  admin: {
    grade: 'admin',
    badgeLabel: 'Admin · Super Admin',
    card: {
      wrapper: 'grade-card-admin border-2 shadow-xl',
      glow: 'bg-blue-500/10',
      brandText: 'text-blue-100',
      subtitleText: 'text-blue-200/70',
      nameText: 'text-white',
      emailText: 'text-blue-100/80',
      badge: 'grade-badge-admin',
      tokenText: 'text-blue-300/50',
      qrFrame: 'grade-qr-admin',
      qrFg: '#0f172a',
      qrBg: '#ffffff',
    },
    profile: {
      pageBg: 'bg-slate-950 text-white',
      pageTitle: 'text-white',
      pageKicker: 'text-blue-300',
      panelBorder: 'border-blue-800/50',
      panelBg: 'bg-slate-950',
      header: 'grade-header-admin',
      headerNameText: 'text-white',
      headerEmailText: 'text-blue-100/80',
      avatarRing: 'grade-avatar-admin',
      avatarText: 'text-slate-950',
      headerBadge: 'grade-badge-admin',
      detailsDivide: 'divide-slate-800',
      detailsLabel: 'text-blue-300/60',
      detailsValue: 'text-white',
      editButton: 'border-blue-400 text-blue-50 hover:bg-blue-950',
      formBg: 'bg-slate-900 text-white',
      formLabel: 'text-blue-300/70',
      formInput: 'border-blue-800 bg-slate-900 text-white placeholder:text-blue-400/50 focus:border-blue-400',
    },
    nav: {
      avatarRing: 'border-blue-400',
      avatarBg: 'grade-avatar-admin',
      avatarText: 'text-slate-950',
    },
    shell: {
      headerBg: 'bg-slate-950',
      headerBorder: 'border-blue-800/50',
      searchBtn: 'border-blue-900 bg-slate-950 text-white hover:border-blue-400',
      searchBtnActive: 'border-blue-400 bg-blue-950 text-blue-50',
      searchBar: 'border-blue-900/60 bg-slate-950',
      searchInput: 'border-blue-900 bg-slate-900 text-white placeholder:text-blue-400/50 focus:border-blue-400',
      searchIcon: 'text-blue-400',
      searchClose: 'text-blue-300',
      bellStroke: '#60a5fa',
      bellBtn: 'border-blue-900 bg-slate-950 hover:border-blue-400',
      pageTint: 'bg-slate-950 text-white',
      pageTitle: 'text-white',
      pageKicker: 'text-blue-300',
      filterActive: 'bg-blue-500 text-white',
      filterInactive: 'border-blue-900 bg-slate-900 text-blue-200/70 hover:border-blue-600',
      navActive: 'text-blue-400',
    },
  },
};

export function getMemberGradeTheme(grade: MemberGrade): MemberGradeTheme {
  return THEMES[grade];
}

/** Parcours membre (Agenda, Spots, Favoris, Profil) — le partenaire vit comme un membre. */
export function isMemberSurfacePath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/agenda') ||
    pathname === '/spots' ||
    pathname.startsWith('/spots/') ||
    pathname === '/favoris' ||
    pathname === '/profil'
  );
}

export function resolveDisplayGrade(grade: MemberGrade, pathname: string): MemberGrade {
  if (grade === 'partner' && isMemberSurfacePath(pathname)) {
    return 'member';
  }
  return grade;
}

export function resolveMemberGrade(
  userRole: string | null | undefined,
  appRole: UserRole,
): MemberGrade {
  const raw = (userRole ?? '').toLowerCase().trim();

  if (raw === 'super_admin' || raw === 'admin') return 'admin';
  if (raw === 'partner') return 'partner';
  if (raw === 'prime') return 'prime';
  if (raw === 'member') return 'member';
  if (raw === 'anonymous') return 'anonymous';

  if (appRole === 'USER_ANONYMOUS') return 'anonymous';
  if (appRole === 'ADMIN') return 'admin';
  if (appRole === 'PARTNER') return 'partner';
  if (appRole === 'USER_PRIME') return 'prime';
  return 'member';
}

export function loadDevGradeOverride(): DevGradeOverride {
  if (!import.meta.env.DEV) return 'auto';
  try {
    const stored = sessionStorage.getItem(DEV_GRADE_OVERRIDE_KEY);
    if (stored === 'auto' || !stored) return 'auto';
    if (stored in THEMES) return stored as MemberGrade;
  } catch {
    /* ignore */
  }
  return 'auto';
}

export function saveDevGradeOverride(value: DevGradeOverride): void {
  if (!import.meta.env.DEV) return;
  sessionStorage.setItem(DEV_GRADE_OVERRIDE_KEY, value);
}

export const DEV_GRADE_OPTIONS: { value: DevGradeOverride; label: string }[] = [
  { value: 'auto', label: 'Auto (session Supabase)' },
  { value: 'anonymous', label: 'Anonyme — Noir sur Blanc' },
  { value: 'member', label: 'Member — Gris sur Noir' },
  { value: 'prime', label: 'Prime — Doré / Gold' },
  { value: 'partner', label: 'Partner — Vert Émeraude' },
  { value: 'admin', label: 'Admin — Bleu Nuit Électrique' },
];
