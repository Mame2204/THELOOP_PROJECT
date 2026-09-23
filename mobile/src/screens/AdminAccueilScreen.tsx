import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  type ScrollView as ScrollViewType,
} from 'react-native';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import {
  AdminPublishedContentPicker,
  type PublishedContentPick,
} from '@/components/admin/AdminPublishedContentPicker';
import { ImageUploadField } from '@/components/ImageUploadField';
import { DateTimeField } from '@/components/DateTimeField';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCatalog } from '@/hooks/useAdminCatalog';
import { useAdminModuleAccess, useFilteredAdminTabs } from '@/hooks/useAdminModuleAccess';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import type { AdminPermissionId } from '@/lib/admin-permissions';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import {
  clearAdminWalkFeaturedWeek,
  deleteAdminChronique,
  deleteAdminCreatorCorner,
  deleteAdminHomePartnerLogo,
  deleteAdminLoopWalk,
  invalidateAdminAccueilCache,
  listAdminChroniques,
  listAdminCreatorCorners,
  listAdminHomePartnerLogos,
  listAdminHomePolls,
  listAdminLoopWalks,
  setAdminChroniqueActive,
  setAdminCreatorCornerActive,
  setAdminHomePartnerLogoActive,
  setAdminHomePollActive,
  setAdminWalkFeaturedWeek,
  setAdminWalkPublished,
  upsertAdminChronique,
  upsertAdminCreatorCorner,
  upsertAdminHomePartnerLogo,
  upsertAdminHomePoll,
  upsertAdminLoopWalk,
  type AdminChronique,
  type AdminCreatorCorner,
  type AdminHomePartnerLogo,
  type AdminHomePoll,
} from '@/lib/admin-accueil-store';
import {
  pickCurrentAccueilItem,
  validateAccueilPeriodRange,
  validateUniquePeriodStart,
} from '@/lib/accueil-scheduling';
import {
  DEFAULT_SECTIONS,
  getAppSections,
  setAccueilBlock,
  type AccueilBlocksConfig,
  type AppSectionsConfig,
} from '@/lib/app-sections-store';
import { AdminFeaturedPanel } from '@/components/admin/AdminFeaturedPanel';
import { formatDateFr } from '@/lib/date-utils';
import { filterUpcomingEvents } from '@/lib/event-list-utils';
import type { CreatorUsefulLink, SinguliersRelatedType } from '@/lib/creator-corner-store';
import { defaultChroniqueCtaLabel, type ChroniqueTargetType } from '@/lib/chronique-store';
import { formatWalkDuration, type LoopWalk, type LoopWalkStep } from '@/lib/loop-walks-store';
import {
  ACCUEIL_COPY,
  SINGULIERS_CATEGORIES,
  WALK_PRICE_OPTIONS,
  type WalkPriceType,
} from '@/lib/accueil-copy';
import { slugify } from '@/lib/content-mappers';
import type { AdminPanelParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AdminPanelParamList, 'AdminAccueil'>;
type TabId = 'overview' | 'featured' | 'poll' | 'walks' | 'corner' | 'chronique' | 'logos';

const ACCUEIL_TAB_DEFS: Array<{ id: TabId; label: string; permission: AdminPermissionId }> = [
  { id: 'overview', label: 'Vue', permission: 'featured_overview' },
  { id: 'featured', label: 'À la une', permission: 'featured_hero' },
  { id: 'poll', label: 'Sondage', permission: 'featured_poll' },
  { id: 'walks', label: 'Parcours', permission: 'featured_walks' },
  { id: 'corner', label: 'Le Singulier', permission: 'featured_corner' },
  { id: 'chronique', label: 'Le Fragment', permission: 'featured_chronique' },
  { id: 'logos', label: 'Logos', permission: 'featured_logos' },
];

type StepDraft = { targetType: 'event' | 'spot' | 'tool'; targetId: string; title: string };

export function AdminAccueilScreen({ navigation, route }: Props) {
  const { role } = useAuthContext();
  const { countryCode, countryLabel } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { publicEvents, getHomeLocations } = useAdminCatalog();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('featured');

  const initialTab: TabId = route.params?.tab ?? 'overview';
  const [tab, setTab] = useState<TabId>(initialTab);
  const scrollRef = useRef<ScrollViewType>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);
  const [polls, setPolls] = useState<AdminHomePoll[]>([]);
  const [walks, setWalks] = useState<LoopWalk[]>([]);
  const [corners, setCorners] = useState<AdminCreatorCorner[]>([]);
  const [chroniques, setChroniques] = useState<AdminChronique[]>([]);
  const [logos, setLogos] = useState<AdminHomePartnerLogo[]>([]);

  const [sections, setSections] = useState<AppSectionsConfig>(DEFAULT_SECTIONS);

  const [editingPollId, setEditingPollId] = useState<string | undefined>();
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOpts, setPollOpts] = useState(['', '', '', '']);
  const [pollActivate, setPollActivate] = useState(true);
  const [pollPeriodStart, setPollPeriodStart] = useState('');
  const [pollPeriodEnd, setPollPeriodEnd] = useState('');

  const [editingWalkId, setEditingWalkId] = useState<string | undefined>();
  const [walkTitle, setWalkTitle] = useState('');
  const [walkHook, setWalkHook] = useState('');
  const [walkAbout, setWalkAbout] = useState('');
  const [walkCover, setWalkCover] = useState('');
  const [walkDuration, setWalkDuration] = useState('');
  const [walkPriceType, setWalkPriceType] = useState<WalkPriceType>('free');
  const [walkPriceLabel, setWalkPriceLabel] = useState('');
  const [walkContactPhone, setWalkContactPhone] = useState('');
  const [walkContactUrl, setWalkContactUrl] = useState('');
  const [walkSteps, setWalkSteps] = useState<StepDraft[]>([]);
  const [walkFeatured, setWalkFeatured] = useState(true);
  const [walkCategoryLabel, setWalkCategoryLabel] = useState('Parcours');

  const [editingLogoId, setEditingLogoId] = useState<string | undefined>();

  const [editingCornerId, setEditingCornerId] = useState<string | undefined>();
  const [cornerName, setCornerName] = useState('');
  const [cornerTitle, setCornerTitle] = useState('');
  const [cornerCategory, setCornerCategory] = useState<string>(SINGULIERS_CATEGORIES[0]);
  const [cornerLoc, setCornerLoc] = useState('');
  const [cornerBadge, setCornerBadge] = useState('');
  const [cornerQuote, setCornerQuote] = useState('');
  const [cornerImpact, setCornerImpact] = useState('');
  const [cornerMedia, setCornerMedia] = useState('');
  const [cornerPeriod, setCornerPeriod] = useState('');
  const [cornerPeriodStart, setCornerPeriodStart] = useState('');
  const [cornerPeriodEnd, setCornerPeriodEnd] = useState('');
  const [cornerRelatedType, setCornerRelatedType] = useState<SinguliersRelatedType | null>(null);
  const [cornerRelatedId, setCornerRelatedId] = useState<string | null>(null);
  const [cornerRelatedSlug, setCornerRelatedSlug] = useState<string | null>(null);
  const [cornerLinks, setCornerLinks] = useState<[CreatorUsefulLink, CreatorUsefulLink, CreatorUsefulLink]>([
    { label: '', url: '' },
    { label: '', url: '' },
    { label: '', url: '' },
  ]);
  const [cornerActivate, setCornerActivate] = useState(true);

  const [editingChroniqueId, setEditingChroniqueId] = useState<string | undefined>();
  const [chroniqueVolume, setChroniqueVolume] = useState('');
  const [chroniqueTitle, setChroniqueTitle] = useState('');
  const [chroniqueBody, setChroniqueBody] = useState('');
  const [chroniqueFootnote, setChroniqueFootnote] = useState('');
  const [chroniqueCta, setChroniqueCta] = useState('');
  const [chroniqueCtaEnabled, setChroniqueCtaEnabled] = useState(true);
  const [chroniqueContactPhone, setChroniqueContactPhone] = useState('');
  const [chroniqueContactEmail, setChroniqueContactEmail] = useState('');
  const [chroniqueTargetType, setChroniqueTargetType] = useState<ChroniqueTargetType | null>(null);
  const [chroniqueTargetId, setChroniqueTargetId] = useState<string | null>(null);
  const [chroniqueTargetSlug, setChroniqueTargetSlug] = useState<string | null>(null);
  const [chroniqueLoc, setChroniqueLoc] = useState('');
  const [chroniquePeriodStart, setChroniquePeriodStart] = useState('');
  const [chroniquePeriodEnd, setChroniquePeriodEnd] = useState('');
  const [chroniqueActivate, setChroniqueActivate] = useState(true);

  const [logoName, setLogoName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  const spotOptions = useMemo(
    () => getHomeLocations().filter((l) => l.subCategory !== 'tools'),
    [getHomeLocations],
  );
  const toolOptions = useMemo(
    () => getHomeLocations().filter((l) => l.subCategory === 'tools'),
    [getHomeLocations],
  );
  const eventOptions = useMemo(() => filterUpcomingEvents(publicEvents), [publicEvents]);

  const cornerRelatedPick = useMemo((): PublishedContentPick | null => {
    if (!cornerRelatedType || !cornerRelatedId) return null;
    if (cornerRelatedType === 'event') {
      const e = eventOptions.find((x) => x.id === cornerRelatedId);
      if (!e) return null;
      return {
        kind: 'event',
        id: e.id,
        slug: cornerRelatedSlug ?? e.slug,
        label: e.title,
      };
    }
    if (cornerRelatedType === 'tool') {
      const t = toolOptions.find((x) => x.id === cornerRelatedId);
      if (!t) return null;
      return {
        kind: 'tool',
        id: t.id,
        slug: cornerRelatedSlug ?? t.slug,
        label: t.name,
      };
    }
    const s = spotOptions.find((x) => x.id === cornerRelatedId);
    if (!s) return null;
    return {
      kind: 'spot',
      id: s.id,
      slug: cornerRelatedSlug ?? s.slug,
      label: s.name,
    };
  }, [
    cornerRelatedType,
    cornerRelatedId,
    cornerRelatedSlug,
    eventOptions,
    toolOptions,
    spotOptions,
  ]);

  const chroniqueTargetPick = useMemo((): PublishedContentPick | null => {
    if (!chroniqueTargetType || !chroniqueTargetId) return null;
    if (chroniqueTargetType === 'event') {
      const e = eventOptions.find((x) => x.id === chroniqueTargetId);
      if (!e) return null;
      return {
        kind: 'event',
        id: e.id,
        slug: chroniqueTargetSlug ?? e.slug,
        label: e.title,
      };
    }
    if (chroniqueTargetType === 'tool') {
      const t = toolOptions.find((x) => x.id === chroniqueTargetId);
      if (!t) return null;
      return {
        kind: 'tool',
        id: t.id,
        slug: chroniqueTargetSlug ?? t.slug,
        label: t.name,
      };
    }
    const s = spotOptions.find((x) => x.id === chroniqueTargetId);
    if (!s) return null;
    return {
      kind: 'spot',
      id: s.id,
      slug: chroniqueTargetSlug ?? s.slug,
      label: s.name,
    };
  }, [
    chroniqueTargetType,
    chroniqueTargetId,
    chroniqueTargetSlug,
    eventOptions,
    toolOptions,
    spotOptions,
  ]);

  const load = useCallback(async (options?: { force?: boolean }) => {
    const apply = (
      p: AdminHomePoll[],
      w: LoopWalk[],
      c: AdminCreatorCorner[],
      ch: AdminChronique[],
      l: AdminHomePartnerLogo[],
      s: AppSectionsConfig,
    ) => {
      setPolls(p);
      setWalks(w);
      setCorners(c);
      setChroniques(ch);
      setLogos(l);
      setSections(s);
    };

    const forceOpts = options?.force ? { force: true as const } : undefined;
    const [p, w, c, ch, l, s] = await Promise.all([
      listAdminHomePolls(countryCode, forceOpts),
      listAdminLoopWalks(countryCode, forceOpts),
      listAdminCreatorCorners(countryCode, forceOpts),
      listAdminChroniques(countryCode, forceOpts),
      listAdminHomePartnerLogos(countryCode, forceOpts),
      getAppSections(countryCode),
    ]);
    apply(p, w, c, ch, l, s);
  }, [countryCode]);

  const { run } = useFocusLoad(
    async (force) => {
      await load(force ? { force: true } : undefined);
    },
    { ttlMs: 90_000, enabled: role === 'ADMIN', resetKey: countryCode },
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    invalidateAdminAccueilCache(countryCode);
    await run(true);
    setRefreshing(false);
  }, [countryCode, run]);

  const activePoll = useMemo(
    () => pickCurrentAccueilItem(polls.map((p) => ({ ...p, isActive: p.isActive }))),
    [polls],
  );
  const featuredWalk = useMemo(() => walks.find((w) => w.isFeaturedWeek) ?? null, [walks]);
  const activeCorner = useMemo(
    () => pickCurrentAccueilItem(corners.map((c) => ({ ...c, isActive: c.isActive }))),
    [corners],
  );
  const activeChronique = useMemo(
    () => pickCurrentAccueilItem(chroniques.map((c) => ({ ...c, isActive: c.isActive }))),
    [chroniques],
  );
  const activeLogos = useMemo(() => logos.filter((l) => l.isActive), [logos]);

  const filteredTabDefs = useFilteredAdminTabs('featured', ACCUEIL_TAB_DEFS);

  const tabs = useMemo(
    () =>
      filteredTabDefs.map((t) => ({
        ...t,
        badge:
          t.id === 'poll'
            ? polls.length || undefined
            : t.id === 'walks'
              ? walks.length || undefined
              : t.id === 'corner'
                ? corners.length || undefined
                : t.id === 'chronique'
                  ? chroniques.length || undefined
                  : t.id === 'logos'
                    ? activeLogos.length || undefined
                    : undefined,
      })),
    [filteredTabDefs, polls.length, walks.length, corners.length, chroniques.length, activeLogos.length],
  );

  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.id === tab)) {
      setTab(tabs[0].id);
    }
  }, [tabs, tab]);

  function resetPollForm() {
    setEditingPollId(undefined);
    setPollQuestion('');
    setPollOpts(['', '', '', '']);
    setPollActivate(true);
    setPollPeriodStart('');
    setPollPeriodEnd('');
  }

  function fillPollForm(p: AdminHomePoll) {
    setEditingPollId(p.id);
    setPollQuestion(p.question);
    const labels = p.options.map((o) => o.label);
    while (labels.length < 4) labels.push('');
    setPollOpts(labels.slice(0, 4));
    setPollActivate(p.isActive);
    setPollPeriodStart(p.periodStart ?? '');
    setPollPeriodEnd(p.periodEnd ?? '');
    setTab('poll');
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
  }

  function resetWalkForm() {
    setEditingWalkId(undefined);
    setWalkTitle('');
    setWalkHook('');
    setWalkAbout('');
    setWalkCover('');
    setWalkDuration('');
    setWalkPriceType('free');
    setWalkPriceLabel('');
    setWalkContactPhone('');
    setWalkContactUrl('');
    setWalkSteps([]);
    setWalkFeatured(true);
    setWalkCategoryLabel('Parcours');
  }

  function fillWalkForm(w: LoopWalk) {
    setEditingWalkId(w.id);
    setWalkTitle(w.title);
    setWalkHook(w.summary ?? '');
    setWalkAbout(w.description ?? '');
    setWalkCover(w.coverImageUrl ?? '');
    setWalkDuration(w.durationMinutes > 0 ? String(w.durationMinutes) : '');
    setWalkPriceType(w.priceType ?? 'free');
    setWalkPriceLabel(w.priceLabel ?? '');
    setWalkContactPhone(w.contactPhone ?? '');
    setWalkContactUrl(w.contactUrl ?? '');
    setWalkCategoryLabel(w.categoryLabel?.trim() || 'Parcours');
    setWalkSteps(
      (w.steps ?? []).map((s) => ({
        targetType: s.targetType,
        targetId: s.targetId,
        title: s.title ?? '',
      })),
    );
    setWalkFeatured(w.isFeaturedWeek);
    setTab('walks');
  }

  function resetLogoForm() {
    setEditingLogoId(undefined);
    setLogoName('');
    setLogoUrl('');
  }

  function fillLogoForm(l: AdminHomePartnerLogo) {
    setEditingLogoId(l.id);
    setLogoName(l.name);
    setLogoUrl(l.logoUrl);
    setTab('logos');
  }

  async function toggleBlock(key: keyof AccueilBlocksConfig) {
    const next = await setAccueilBlock(countryCode, key, !sections.accueil[key]);
    setSections(next);
  }

  function resetCornerForm() {
    setEditingCornerId(undefined);
    setCornerName('');
    setCornerTitle('');
    setCornerCategory(SINGULIERS_CATEGORIES[0]);
    setCornerLoc('');
    setCornerBadge('');
    setCornerQuote('');
    setCornerImpact('');
    setCornerMedia('');
    setCornerPeriod('');
    setCornerPeriodStart('');
    setCornerPeriodEnd('');
    setCornerRelatedType(null);
    setCornerRelatedId(null);
    setCornerRelatedSlug(null);
    setCornerLinks([
      { label: '', url: '' },
      { label: '', url: '' },
      { label: '', url: '' },
    ]);
    setCornerActivate(true);
  }

  function fillCornerForm(c: AdminCreatorCorner) {
    setEditingCornerId(c.id);
    setCornerName(c.subjectName);
    setCornerTitle(c.title);
    setCornerCategory(c.category?.trim() || SINGULIERS_CATEGORIES[0]);
    setCornerLoc(c.locationLabel ?? '');
    setCornerBadge(c.badgeTag ?? '');
    setCornerQuote(c.coreQuote ?? '');
    setCornerImpact(c.impactDescription);
    setCornerMedia(c.mediaUrl ?? '');
    setCornerPeriod(c.periodLabel ?? '');
    setCornerPeriodStart(c.periodStart ?? '');
    setCornerPeriodEnd(c.periodEnd ?? '');
    setCornerRelatedType(c.relatedTargetType);
    setCornerRelatedId(c.relatedTargetId);
    setCornerRelatedSlug(c.relatedTargetSlug);
    const links: CreatorUsefulLink[] = [...c.usefulLinks];
    while (links.length < 3) links.push({ label: '', url: '' });
    setCornerLinks([links[0], links[1], links[2]]);
    setCornerActivate(c.isActive);
    setTab('corner');
  }

  function resetChroniqueForm() {
    setEditingChroniqueId(undefined);
    setChroniqueVolume('');
    setChroniqueTitle('');
    setChroniqueBody('');
    setChroniqueFootnote('');
    setChroniqueCta('');
    setChroniqueCtaEnabled(true);
    setChroniqueContactPhone('');
    setChroniqueContactEmail('');
    setChroniqueTargetType(null);
    setChroniqueTargetId(null);
    setChroniqueTargetSlug(null);
    setChroniqueLoc('');
    setChroniquePeriodStart('');
    setChroniquePeriodEnd('');
    setChroniqueActivate(true);
  }

  function fillChroniqueForm(c: AdminChronique) {
    setEditingChroniqueId(c.id);
    setChroniqueVolume(c.volumeLabel ?? '');
    setChroniqueTitle(c.title);
    setChroniqueBody(c.body);
    setChroniqueFootnote(c.footnote ?? '');
    setChroniqueCta(c.ctaLabel ?? '');
    setChroniqueCtaEnabled(c.ctaEnabled !== false);
    setChroniqueContactPhone(c.contactPhone ?? '');
    setChroniqueContactEmail(c.contactEmail ?? '');
    setChroniqueTargetType(c.targetType);
    setChroniqueTargetId(c.targetId);
    setChroniqueTargetSlug(c.targetSlug);
    setChroniqueLoc(c.locationLabel ?? '');
    setChroniquePeriodStart(c.periodStart ?? '');
    setChroniquePeriodEnd(c.periodEnd ?? '');
    setChroniqueActivate(c.isActive);
    setTab('chronique');
  }

  function toggleWalkStep(type: 'event' | 'spot' | 'tool', id: string, title: string) {
    setWalkSteps((prev) => {
      const exists = prev.find((s) => s.targetType === type && s.targetId === id);
      if (exists) return prev.filter((s) => !(s.targetType === type && s.targetId === id));
      if (prev.length >= 8) {
        Alert.alert('Étapes', 'Maximum 8 étapes.');
        return prev;
      }
      return [...prev, { targetType: type, targetId: id, title }];
    });
  }

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Accès réservé aux administrateurs.</Text>
      </View>
    );
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  async function createPoll() {
    const options = pollOpts
      .map((label, i) => ({ id: `opt${i + 1}`, label: label.trim() }))
      .filter((o) => o.label);
    if (!pollQuestion.trim() || options.length < 2) {
      Alert.alert('Sondage', 'Question + au moins 2 options.');
      return;
    }
    const rangeErr = validateAccueilPeriodRange(pollPeriodStart, pollPeriodEnd);
    if (rangeErr) {
      Alert.alert('Sondage', rangeErr);
      return;
    }
    const uniqueErr = validateUniquePeriodStart(
      polls.map((p) => ({ id: p.id, periodStart: p.periodStart })),
      pollPeriodStart,
      editingPollId,
    );
    if (uniqueErr) {
      Alert.alert('Sondage', uniqueErr);
      return;
    }
    const created = await upsertAdminHomePoll({
      id: editingPollId,
      question: pollQuestion,
      options,
      countryCode,
      activate: pollActivate,
      periodStart: pollPeriodStart || null,
      periodEnd: pollPeriodEnd || null,
    });
    if (!created) {
      Alert.alert('Erreur', 'Impossible d’enregistrer le sondage (dates en conflit ou droits admin / pays).');
      return;
    }
    resetPollForm();
    await load({ force: true });
    Alert.alert(
      'OK',
      pollActivate
        ? `Sondage actif pour ${countryLabel}. Visible sur Accueil de ce pays.`
        : 'Sondage enregistré (inactif).',
    );
  }

  async function createWalk() {
    if (!walkTitle.trim()) {
      Alert.alert('Parcours', 'Titre requis.');
      return;
    }
    if (walkSteps.length < 2) {
      Alert.alert('Parcours', 'Sélectionne au moins 2 étapes (spots ou événements).');
      return;
    }
    const steps: LoopWalkStep[] = walkSteps.map((s, i) => ({
      order: i + 1,
      targetType: s.targetType,
      targetId: s.targetId,
      title: s.title,
      description: null,
    }));
    const categoryLabel = walkCategoryLabel.trim() || 'Parcours';
    const durationParsed = Number.parseInt(walkDuration.trim(), 10);
    const result = await upsertAdminLoopWalk({
      id: editingWalkId,
      title: walkTitle,
      summary: walkHook,
      description: walkAbout,
      coverImageUrl: walkCover || undefined,
      durationMinutes: Number.isFinite(durationParsed) && durationParsed > 0 ? durationParsed : 0,
      category: slugify(categoryLabel),
      categoryLabel,
      countryCode,
      steps,
      priceType: walkPriceType,
      priceLabel: walkPriceLabel,
      contactPhone: walkContactPhone,
      contactUrl: walkContactUrl,
      activateFeatured: walkFeatured,
    });
    if (!result.ok) {
      Alert.alert('Erreur', result.error || 'Impossible d’enregistrer le parcours.');
      return;
    }
    resetWalkForm();
    await load({ force: true });
    Alert.alert(
      'OK',
      walkFeatured ? 'Parcours publié sur Accueil (parcours de la semaine).' : 'Parcours enregistré.',
    );
  }

  async function saveCorner() {
    if (!cornerName.trim() || !cornerTitle.trim() || !cornerImpact.trim()) {
      Alert.alert(
        ACCUEIL_COPY.corner.short,
        'Sujet, titre de l’œuvre et description d’impact sont requis.',
      );
      return;
    }
    const rangeErr = validateAccueilPeriodRange(cornerPeriodStart, cornerPeriodEnd);
    if (rangeErr) {
      Alert.alert(ACCUEIL_COPY.corner.short, rangeErr);
      return;
    }
    const uniqueErr = validateUniquePeriodStart(
      corners.map((c) => ({ id: c.id, periodStart: c.periodStart })),
      cornerPeriodStart,
      editingCornerId,
    );
    if (uniqueErr) {
      Alert.alert(ACCUEIL_COPY.corner.short, uniqueErr);
      return;
    }
    const created = await upsertAdminCreatorCorner({
      id: editingCornerId,
      subjectName: cornerName,
      title: cornerTitle,
      category: cornerCategory,
      locationLabel: cornerLoc,
      badgeTag: cornerBadge,
      coreQuote: cornerQuote,
      impactDescription: cornerImpact,
      mediaUrl: cornerMedia,
      relatedTargetType: cornerRelatedType,
      relatedTargetId: cornerRelatedId,
      relatedTargetSlug: cornerRelatedSlug,
      periodLabel: cornerPeriod,
      periodStart: cornerPeriodStart || null,
      periodEnd: cornerPeriodEnd || null,
      usefulLinks: cornerLinks,
      countryCode,
      activate: cornerActivate,
    });
    if (!created) {
      Alert.alert('Erreur', 'Enregistrement impossible.');
      return;
    }
    resetCornerForm();
    await load({ force: true });
    Alert.alert(
      'OK',
      cornerActivate
        ? `${ACCUEIL_COPY.corner.short} actif sur Accueil.`
        : `${ACCUEIL_COPY.corner.short} enregistré (inactif).`,
    );
  }

  async function saveChronique() {
    if (!chroniqueTitle.trim() || !chroniqueBody.trim()) {
      Alert.alert(ACCUEIL_COPY.chronique.short, 'Titre et texte d’ambiance sont requis.');
      return;
    }
    if (chroniqueCtaEnabled) {
      if (!chroniqueTargetType || !chroniqueTargetId || !chroniqueTargetSlug) {
        Alert.alert(
          ACCUEIL_COPY.chronique.short,
          'Sélectionnez un spot, un événement ou un outil lié pour le bouton Découvrir.',
        );
        return;
      }
    } else if (!chroniqueContactPhone.trim() && !chroniqueContactEmail.trim()) {
      Alert.alert(
        ACCUEIL_COPY.chronique.short,
        'Sans bouton Découvrir, renseignez un numéro (prioritaire) ou un e-mail pour Contacter.',
      );
      return;
    }
    const rangeErr = validateAccueilPeriodRange(chroniquePeriodStart, chroniquePeriodEnd);
    if (rangeErr) {
      Alert.alert(ACCUEIL_COPY.chronique.short, rangeErr);
      return;
    }
    const uniqueErr = validateUniquePeriodStart(
      chroniques.map((c) => ({ id: c.id, periodStart: c.periodStart })),
      chroniquePeriodStart,
      editingChroniqueId,
    );
    if (uniqueErr) {
      Alert.alert(ACCUEIL_COPY.chronique.short, uniqueErr);
      return;
    }
    const created = await upsertAdminChronique({
      id: editingChroniqueId,
      title: chroniqueTitle,
      body: chroniqueBody,
      volumeLabel: chroniqueVolume,
      locationLabel: chroniqueLoc,
      footnote: chroniqueFootnote,
      ctaLabel: chroniqueCta || defaultChroniqueCtaLabel(chroniqueTargetType),
      ctaEnabled: chroniqueCtaEnabled,
      contactPhone: chroniqueContactPhone,
      contactEmail: chroniqueContactEmail,
      targetType: chroniqueTargetType,
      targetId: chroniqueTargetId,
      targetSlug: chroniqueTargetSlug,
      periodStart: chroniquePeriodStart || null,
      periodEnd: chroniquePeriodEnd || null,
      countryCode,
      activate: chroniqueActivate,
    });
    if (!created) {
      Alert.alert('Erreur', 'Enregistrement impossible.');
      return;
    }
    resetChroniqueForm();
    await load({ force: true });
    Alert.alert(
      'OK',
      chroniqueActivate
        ? `${ACCUEIL_COPY.chronique.short} actif sur Accueil.`
        : `${ACCUEIL_COPY.chronique.short} enregistré (inactif).`,
    );
  }

  async function createLogo() {
    if (!logoName.trim() || !logoUrl.trim()) {
      Alert.alert('Logo', 'Nom + image (galerie ou URL) requis.');
      return;
    }
    const created = await upsertAdminHomePartnerLogo({
      id: editingLogoId,
      name: logoName,
      logoUrl,
      countryCode,
    });
    if (!created) {
      Alert.alert(
        'Erreur',
        'Impossible d’enregistrer le logo. Vérifiez que vous êtes admin et que la migration logos est appliquée.',
      );
      return;
    }
    resetLogoForm();
    await load({ force: true });
    Alert.alert('OK', 'Logo partenaire enregistré — visible sur Accueil.');
  }

  return (
    <KeyboardAwareFormScroll
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: '#ffffff' }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />
      }
      keyboardPriority={1}
    >
      <AdminPageHeader
        title="Accueil"
        subtitle={`Blocs page d’accueil · ${countryLabel}`}
        shell={shell}
        onBack={() => navigation.goBack()}
      />
      <AdminCountryBar shell={shell} compact />
      <AdminTabMenu tabs={tabs} active={tab} onChange={setTab} shell={shell} accent={ADMIN_THEME.accent} />

      {tab === 'overview' ? (
        <View style={styles.section}>
          <View style={[styles.card, adminCardStyle(shell)]}>
            <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>Blocs visibles sur Accueil</Text>
            <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
              Active ou masque chaque bloc côté app (comme un menu Vue).
            </Text>
            {(
              [
                { key: 'hero' as const, label: 'Hero / slider' },
                { key: 'poll' as const, label: 'Sondage' },
                { key: 'corner' as const, label: ACCUEIL_COPY.corner.adminBlock },
                { key: 'chronique' as const, label: ACCUEIL_COPY.chronique.adminBlock },
                { key: 'walks' as const, label: ACCUEIL_COPY.walks.adminBlock },
                { key: 'logos' as const, label: 'Logos partenaires' },
              ] as const
            ).map((row) => (
              <Pressable
                key={row.key}
                onPress={() => void toggleBlock(row.key)}
                style={[styles.toggleRow, { borderColor: shell.filterInactiveBorder, marginTop: 8 }]}
              >
                <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>{row.label}</Text>
                <Text style={{ color: sections.accueil[row.key] ? ADMIN_THEME.accent : '#ef4444', fontWeight: '800' }}>
                  {sections.accueil[row.key] ? 'ON' : 'OFF'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.card, adminCardStyle(shell)]}>
            <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>🏆 À la une (hero Accueil)</Text>
            <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
              Carousel Accueil — comme le sondage, la gestion se fait dans l’onglet dédié.
            </Text>
            <Pressable style={[styles.btn, { backgroundColor: ADMIN_THEME.accent }]} onPress={() => setTab('featured')}>
              <Text style={styles.btnText}>Gérer À la une</Text>
            </Pressable>
          </View>
          <OverviewCard title="📊 Sondage" meta={activePoll ? `Visible · ${activePoll.question}` : 'Aucun visible aujourd’hui'} onPress={() => setTab('poll')} shell={shell} />
          <OverviewCard title={`✨ ${ACCUEIL_COPY.corner.short}`} meta={activeCorner ? `Visible · ${activeCorner.subjectName}` : 'Aucun visible aujourd’hui'} onPress={() => setTab('corner')} shell={shell} />
          <OverviewCard title={`📰 ${ACCUEIL_COPY.chronique.short}`} meta={activeChronique ? `Visible · ${activeChronique.title}` : 'Aucune visible aujourd’hui'} onPress={() => setTab('chronique')} shell={shell} />
          <OverviewCard
            title={`🚶 ${ACCUEIL_COPY.walks.short}`}
            meta={featuredWalk ? `Sur Accueil · ${featuredWalk.title}` : `${walks.filter((w) => w.isPublished).length} publiés`}
            onPress={() => setTab('walks')}
            shell={shell}
          />
          <OverviewCard title="🤝 Logos" meta={`${activeLogos.length} actifs`} onPress={() => setTab('logos')} shell={shell} />
        </View>
      ) : null}

      {tab === 'featured' ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>À la une</Text>
          <AdminFeaturedPanel enabled={tab === 'featured'} compactHeader />
        </View>
      ) : null}

      {tab === 'poll' ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>
            {editingPollId ? 'Modifier le sondage' : 'Nouveau sondage'}
          </Text>
          <TextInput value={pollQuestion} onChangeText={setPollQuestion} placeholder="Question" placeholderTextColor={shell.pageKicker} style={[styles.input, fieldStyle(shell)]} />
          {pollOpts.map((opt, i) => (
            <TextInput
              key={`opt-${i}`}
              value={opt}
              onChangeText={(t) => {
                const next = [...pollOpts];
                next[i] = t;
                setPollOpts(next);
              }}
              placeholder={`Option ${i + 1}${i < 2 ? ' *' : ''}`}
              placeholderTextColor={shell.pageKicker}
              style={[styles.input, fieldStyle(shell)]}
            />
          ))}
          <Pressable onPress={() => setPollActivate((v) => !v)} style={[styles.toggleRow, { borderColor: shell.filterInactiveBorder }]}>
            <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Activer sur Accueil</Text>
            <Text style={{ color: ADMIN_THEME.accent, fontWeight: '800' }}>{pollActivate ? 'Oui' : 'Non'}</Text>
          </Pressable>
          <Text style={[styles.subLabel, { color: shell.pageKicker }]}>Planification (optionnel)</Text>
          <DateTimeField
            value={pollPeriodStart}
            onChange={setPollPeriodStart}
            placeholder="Date de début"
            shell={shell}
            dateOnly
          />
          <DateTimeField
            value={pollPeriodEnd}
            onChange={setPollPeriodEnd}
            placeholder="Date de fin"
            shell={shell}
            dateOnly
          />
          <Pressable style={[styles.btn, { backgroundColor: ADMIN_THEME.accent }]} onPress={() => void createPoll()}>
            <Text style={styles.btnText}>{editingPollId ? 'Enregistrer' : `Publier sur Accueil (${countryLabel})`}</Text>
          </Pressable>
          {editingPollId ? (
            <Pressable style={styles.linkBtn} onPress={resetPollForm}>
              <Text style={{ color: shell.pageKicker, fontWeight: '700' }}>Annuler l’édition</Text>
            </Pressable>
          ) : null}
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Plusieurs sondages actifs possibles (planification). À l’Accueil, celui dont la date de début est la plus récente et valide s’affiche. Deux sondages ne peuvent pas partager la même date de début pour ce pays.
          </Text>
          {polls.map((p) => (
            <View key={p.id} style={[styles.card, adminCardStyle(shell)]}>
              <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>
                {p.isActive ? '● ' : '○ '}
                {p.question}
              </Text>
              <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                {p.weekKey} · {p.voteTotal} vote{p.voteTotal > 1 ? 's' : ''}
                {p.periodStart ? ` · début ${p.periodStart}` : ''}
                {p.periodEnd ? ` · fin ${p.periodEnd}` : ''}
              </Text>
              {p.options.map((o) => (
                <Text key={o.id} style={[styles.cardMeta, { color: shell.pageTitle }]}>
                  · {o.label} — {p.voteCounts[o.id] ?? 0}
                </Text>
              ))}
              <View style={styles.rowActions}>
                <Pressable onPress={() => fillPollForm(p)}>
                  <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>Modifier</Text>
                </Pressable>
                <Pressable
                  onPress={() => void setAdminHomePollActive(p.id, countryCode, !p.isActive).then(() => load({ force: true }))}
                >
                  <Text style={{ color: p.isActive ? '#ef4444' : ADMIN_THEME.accent, fontWeight: '700' }}>
                    {p.isActive ? 'Désactiver' : 'Activer'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {tab === 'walks' ? (
        <View style={styles.section}>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            « Sur Accueil » = parcours de la semaine. Ce n’est pas le hero « À la une ».
          </Text>
          <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>
            {editingWalkId ? 'Modifier le parcours' : 'Nouveau parcours'}
          </Text>
          <TextInput value={walkTitle} onChangeText={setWalkTitle} placeholder="Titre *" placeholderTextColor={shell.pageKicker} style={[styles.input, fieldStyle(shell)]} />
          <TextInput value={walkHook} onChangeText={setWalkHook} placeholder="Phrase d’accroche" placeholderTextColor={shell.pageKicker} style={[styles.input, fieldStyle(shell)]} />
          <TextInput value={walkAbout} onChangeText={setWalkAbout} placeholder="À propos (description)" placeholderTextColor={shell.pageKicker} multiline style={[styles.input, styles.inputMulti, fieldStyle(shell)]} />
          <TextInput
            value={walkCategoryLabel}
            onChangeText={setWalkCategoryLabel}
            placeholder="Type de parcours (ex. Culture, Nature, Gastronomie…)"
            placeholderTextColor={shell.pageKicker}
            style={[styles.input, fieldStyle(shell)]}
          />
          <TextInput
            value={walkDuration}
            onChangeText={setWalkDuration}
            placeholder="Durée (minutes) — laisser vide si non communiquée"
            placeholderTextColor={shell.pageKicker}
            keyboardType="number-pad"
            style={[styles.input, fieldStyle(shell)]}
          />
          <Text style={[styles.subLabel, { color: shell.pageKicker }]}>Tarif</Text>
          <View style={styles.chipWrap}>
            {WALK_PRICE_OPTIONS.map((opt) => {
              const on = walkPriceType === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setWalkPriceType(opt.value)}
                  style={[
                    styles.chip,
                    {
                      borderColor: on ? ADMIN_THEME.accent : shell.filterInactiveBorder,
                      backgroundColor: on ? ADMIN_THEME.glow : shell.filterInactiveBg,
                    },
                  ]}
                >
                  <Text style={{ color: shell.pageTitle, fontSize: 11, fontWeight: '700' }}>
                    {on ? '✓ ' : ''}
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {walkPriceType === 'paid' ? (
            <TextInput
              value={walkPriceLabel}
              onChangeText={setWalkPriceLabel}
              placeholder="Montant / libellé (ex. 50 000 GNF)"
              placeholderTextColor={shell.pageKicker}
              style={[styles.input, fieldStyle(shell)]}
            />
          ) : null}
          <TextInput
            value={walkContactPhone}
            onChangeText={setWalkContactPhone}
            placeholder="Contact téléphone (optionnel)"
            placeholderTextColor={shell.pageKicker}
            keyboardType="phone-pad"
            style={[styles.input, fieldStyle(shell)]}
          />
          <TextInput
            value={walkContactUrl}
            onChangeText={setWalkContactUrl}
            placeholder="Lien contact (WhatsApp, site…) optionnel"
            placeholderTextColor={shell.pageKicker}
            autoCapitalize="none"
            style={[styles.input, fieldStyle(shell)]}
          />
          <ImageUploadField label="Image de couverture" value={walkCover} onChange={setWalkCover} shell={shell} folder="gallery" cropAspect={[16, 9]} hint="Recadrage 16:9 — galerie ou URL" />

          <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>Étapes ({walkSteps.length}/8) *</Text>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>Touche pour ajouter / retirer un spot, outil ou événement publié.</Text>
          <Text style={[styles.subLabel, { color: shell.pageKicker }]}>Spots</Text>
          <View style={styles.chipWrap}>
            {spotOptions.slice(0, 24).map((s) => {
              const on = walkSteps.some((x) => x.targetType === 'spot' && x.targetId === s.id);
              return (
                <Pressable
                  key={s.id}
                  onPress={() => toggleWalkStep('spot', s.id, s.name)}
                  style={[styles.chip, { borderColor: on ? ADMIN_THEME.accent : shell.filterInactiveBorder, backgroundColor: on ? ADMIN_THEME.glow : shell.filterInactiveBg }]}
                >
                  <Text style={{ color: shell.pageTitle, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                    {on ? '✓ ' : ''}
                    {s.name}
                  </Text>
                  <Text style={{ color: shell.pageKicker, fontSize: 9, marginTop: 2 }} numberOfLines={1}>
                    {s.address?.trim() || s.district || 'Adresse —'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.subLabel, { color: shell.pageKicker }]}>Outils</Text>
          <View style={styles.chipWrap}>
            {toolOptions.slice(0, 24).map((s) => {
              const on = walkSteps.some((x) => x.targetType === 'tool' && x.targetId === s.id);
              return (
                <Pressable
                  key={s.id}
                  onPress={() => toggleWalkStep('tool', s.id, s.name)}
                  style={[styles.chip, { borderColor: on ? ADMIN_THEME.accent : shell.filterInactiveBorder, backgroundColor: on ? ADMIN_THEME.glow : shell.filterInactiveBg }]}
                >
                  <Text style={{ color: shell.pageTitle, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                    {on ? '✓ ' : ''}
                    {s.name}
                  </Text>
                  <Text style={{ color: shell.pageKicker, fontSize: 9, marginTop: 2 }} numberOfLines={1}>
                    {s.subtitle?.trim() || s.toolCategory || 'Outil'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.subLabel, { color: shell.pageKicker }]}>Événements à venir</Text>
          <View style={styles.chipWrap}>
            {eventOptions.map((e) => {
              const on = walkSteps.some((x) => x.targetType === 'event' && x.targetId === e.id);
              const place = e.venueAddress?.trim() || e.venueName?.trim() || '—';
              return (
                <Pressable
                  key={e.id}
                  onPress={() => toggleWalkStep('event', e.id, e.title)}
                  style={[styles.chip, { borderColor: on ? ADMIN_THEME.accent : shell.filterInactiveBorder, backgroundColor: on ? ADMIN_THEME.glow : shell.filterInactiveBg }]}
                >
                  <Text style={{ color: shell.pageTitle, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                    {on ? '✓ ' : ''}
                    {e.title}
                  </Text>
                  <Text style={{ color: shell.pageKicker, fontSize: 9, marginTop: 2 }} numberOfLines={1}>
                    {formatDateFr(e.startsAt)} · {place}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => setWalkFeatured((v) => !v)}
            style={[styles.toggleRow, { borderColor: shell.filterInactiveBorder }]}
          >
            <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Afficher sur Accueil</Text>
            <Text style={{ color: ADMIN_THEME.accent, fontWeight: '800' }}>{walkFeatured ? 'Oui' : 'Non'}</Text>
          </Pressable>

          <Pressable style={[styles.btn, { backgroundColor: ADMIN_THEME.accent }]} onPress={() => void createWalk()}>
            <Text style={styles.btnText}>{editingWalkId ? 'Enregistrer' : 'Créer le parcours'}</Text>
          </Pressable>
          {editingWalkId ? (
            <Pressable style={styles.linkBtn} onPress={resetWalkForm}>
              <Text style={{ color: shell.pageKicker, fontWeight: '700' }}>Annuler l’édition</Text>
            </Pressable>
          ) : null}

          <Text style={[styles.sectionTitle, { color: shell.pageKicker, marginTop: 16 }]}>Parcours existants</Text>
          {featuredWalk ? (
            <Pressable
              style={[styles.btn, { backgroundColor: '#ef4444', marginBottom: 8 }]}
              onPress={() => void clearAdminWalkFeaturedWeek(countryCode).then(() => load({ force: true }))}
            >
              <Text style={styles.btnText}>Retirer le parcours de l’Accueil</Text>
            </Pressable>
          ) : null}
          {walks.map((w) => (
            <View key={w.id} style={[styles.card, adminCardStyle(shell)]}>
              <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>
                {w.isFeaturedWeek ? '★ Accueil · ' : ''}
                {w.title}
              </Text>
              <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                {w.isPublished ? 'Publié' : 'Masqué'}
                {formatWalkDuration(w.durationMinutes) ? ` · ${formatWalkDuration(w.durationMinutes)}` : ''}
                {' · '}
                {w.stepsCount} étapes
                {' · '}
                {w.priceType === 'paid' ? (w.priceLabel?.trim() || 'Payant') : w.priceType === 'theloop' ? 'THE LOOP' : 'Gratuit'}
              </Text>
              <View style={styles.rowActions}>
                <Pressable onPress={() => fillWalkForm(w)}>
                  <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>Modifier</Text>
                </Pressable>
                <Pressable onPress={() => void setAdminWalkPublished(w.id, !w.isPublished, countryCode).then(() => load({ force: true }))}>
                  <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>{w.isPublished ? 'Masquer' : 'Publier'}</Text>
                </Pressable>
                {w.isFeaturedWeek ? (
                  <Pressable onPress={() => void clearAdminWalkFeaturedWeek(countryCode).then(() => load({ force: true }))}>
                    <Text style={{ color: '#ef4444', fontWeight: '700' }}>Retirer Accueil</Text>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => void setAdminWalkFeaturedWeek(w.id, countryCode).then(() => load({ force: true }))}>
                    <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>Sur Accueil</Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={() =>
                    Alert.alert('Supprimer', w.title, [
                      { text: 'Annuler', style: 'cancel' },
                      {
                        text: 'Supprimer',
                        style: 'destructive',
                        onPress: () => {
                          const previous = walks;
                          setWalks((prev) => prev.filter((x) => x.id !== w.id));
                          void deleteAdminLoopWalk(w.id, countryCode).then((result) => {
                            if (!result.ok) {
                              setWalks(previous);
                              Alert.alert(
                                'Erreur',
                                result.error?.includes('Network')
                                  ? 'Connexion instable. Réessayez avec un meilleur réseau.'
                                  : result.error || 'Suppression impossible.',
                              );
                              return;
                            }
                            void load({ force: true });
                          });
                        },
                      },
                    ])
                  }
                >
                  <Text style={{ color: '#ef4444', fontWeight: '700' }}>Supprimer</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {tab === 'corner' ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>
            {editingCornerId
              ? `Modifier — ${ACCUEIL_COPY.corner.short}`
              : `Nouveau — ${ACCUEIL_COPY.corner.short}`}
          </Text>
          <Text style={[styles.cardMeta, { color: shell.pageKicker, marginBottom: 8 }]}>
            Impact, œuvre, singularité — pas de biographie ni de CV. Ce que le sujet apporte à Conakry.
          </Text>
          <TextInput
            value={cornerName}
            onChangeText={setCornerName}
            placeholder="Sujet * (personne, projet, collectif…)"
            placeholderTextColor={shell.pageKicker}
            style={[styles.input, fieldStyle(shell)]}
          />
          <TextInput
            value={cornerTitle}
            onChangeText={setCornerTitle}
            placeholder="Titre de l’œuvre / de l’angle *"
            placeholderTextColor={shell.pageKicker}
            style={[styles.input, fieldStyle(shell)]}
          />
          <Text style={[styles.subLabel, { color: shell.pageKicker }]}>Catégorie d’impact</Text>
          <View style={styles.chipWrap}>
            {SINGULIERS_CATEGORIES.map((cat) => {
              const on = cornerCategory === cat;
              return (
                <Pressable
                  key={cat}
                  onPress={() => setCornerCategory(cat)}
                  style={[
                    styles.chip,
                    {
                      borderColor: on ? ADMIN_THEME.accent : shell.filterInactiveBorder,
                      backgroundColor: on ? ADMIN_THEME.glow : shell.filterInactiveBg,
                    },
                  ]}
                >
                  <Text style={{ color: shell.pageTitle, fontSize: 11, fontWeight: '700' }}>
                    {on ? '✓ ' : ''}
                    {cat}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={cornerLoc}
            onChangeText={setCornerLoc}
            placeholder="Ancrage (ex. Conakry, Guinée)"
            placeholderTextColor={shell.pageKicker}
            style={[styles.input, fieldStyle(shell)]}
          />
          <TextInput
            value={cornerBadge}
            onChangeText={setCornerBadge}
            placeholder="Badge (ex. Rupture de narration)"
            placeholderTextColor={shell.pageKicker}
            style={[styles.input, fieldStyle(shell)]}
          />
          <TextInput
            value={cornerQuote}
            onChangeText={setCornerQuote}
            placeholder="Citation / phrase clé (optionnel)"
            placeholderTextColor={shell.pageKicker}
            multiline
            style={[styles.input, styles.inputMulti, fieldStyle(shell)]}
          />
          <TextInput
            value={cornerImpact}
            onChangeText={setCornerImpact}
            placeholder="Description d’impact * — ce que ça change concrètement"
            placeholderTextColor={shell.pageKicker}
            multiline
            style={[styles.input, styles.inputMulti, fieldStyle(shell)]}
          />
          <ImageUploadField
            key={editingCornerId ?? 'corner-new'}
            label="Visuel de l’œuvre / de l’action"
            value={cornerMedia}
            onChange={setCornerMedia}
            shell={shell}
            folder="gallery"
            cropAspect={[16, 9]}
            hint="Android : cadrez en 16:9. iPhone : la photo est recadrée automatiquement en 16:9 (haut conservé)."
          />
          <TextInput
            value={cornerPeriod}
            onChangeText={setCornerPeriod}
            placeholder="Période (ex. Août 2026)"
            placeholderTextColor={shell.pageKicker}
            style={[styles.input, fieldStyle(shell)]}
          />
          <Text style={[styles.subLabel, { color: shell.pageKicker }]}>Planification (optionnel)</Text>
          <DateTimeField
            value={cornerPeriodStart}
            onChange={setCornerPeriodStart}
            placeholder="Date de début"
            shell={shell}
            dateOnly
          />
          <DateTimeField
            value={cornerPeriodEnd}
            onChange={setCornerPeriodEnd}
            placeholder="Date de fin"
            shell={shell}
            dateOnly
          />

          <AdminPublishedContentPicker
            label="Contenu lié (optionnel)"
            hint="Affiche « Voir le contenu lié » sur la fiche Singulier (secondaire au Fragment · bouton Découvrir)."
            shell={shell}
            spots={spotOptions}
            events={eventOptions}
            tools={toolOptions}
            value={cornerRelatedPick}
            onChange={(pick) => {
              if (!pick) {
                setCornerRelatedType(null);
                setCornerRelatedId(null);
                setCornerRelatedSlug(null);
                return;
              }
              setCornerRelatedType(pick.kind);
              setCornerRelatedId(pick.id);
              setCornerRelatedSlug(pick.slug);
            }}
          />

          <Text style={[styles.subLabel, { color: shell.pageKicker }]}>Liens utiles (3 max)</Text>
          {cornerLinks.map((link, i) => (
            <View key={`link-${i}`} style={styles.linkRow}>
              <TextInput
                value={link.label}
                onChangeText={(t) => {
                  const next = [...cornerLinks] as typeof cornerLinks;
                  next[i] = { ...next[i], label: t };
                  setCornerLinks(next);
                }}
                placeholder="Libellé"
                placeholderTextColor={shell.pageKicker}
                style={[styles.input, styles.linkHalf, fieldStyle(shell)]}
              />
              <TextInput
                value={link.url}
                onChangeText={(t) => {
                  const next = [...cornerLinks] as typeof cornerLinks;
                  next[i] = { ...next[i], url: t };
                  setCornerLinks(next);
                }}
                placeholder="https://"
                placeholderTextColor={shell.pageKicker}
                autoCapitalize="none"
                style={[styles.input, styles.linkHalf, fieldStyle(shell)]}
              />
            </View>
          ))}
          <Pressable onPress={() => setCornerActivate((v) => !v)} style={[styles.toggleRow, { borderColor: shell.filterInactiveBorder }]}>
            <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Activer sur Accueil</Text>
            <Text style={{ color: ADMIN_THEME.accent, fontWeight: '800' }}>{cornerActivate ? 'Oui' : 'Non'}</Text>
          </Pressable>
          <Pressable style={[styles.btn, { backgroundColor: ADMIN_THEME.accent }]} onPress={() => void saveCorner()}>
            <Text style={styles.btnText}>{editingCornerId ? 'Enregistrer' : 'Créer'}</Text>
          </Pressable>
          {editingCornerId ? (
            <Pressable style={styles.linkBtn} onPress={resetCornerForm}>
              <Text style={{ color: shell.pageKicker, fontWeight: '700' }}>Annuler l’édition</Text>
            </Pressable>
          ) : null}

          <Text style={[styles.sectionTitle, { color: shell.pageKicker, marginTop: 16 }]}>
            {ACCUEIL_COPY.corner.adminBlock}
          </Text>
          {corners.map((c) => (
            <View key={c.id} style={[styles.card, adminCardStyle(shell)]}>
              <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>
                {c.isActive ? '● ' : '○ '}
                {c.subjectName}
              </Text>
              <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                {c.badgeTag ? `${c.badgeTag} · ` : ''}
                {c.title}
                {c.category ? ` · ${c.category}` : ''}
                {c.periodLabel ? ` · ${c.periodLabel}` : ''}
                {c.periodStart ? ` · début ${c.periodStart}` : ''}
                {c.periodEnd ? ` · fin ${c.periodEnd}` : ''}
              </Text>
              <View style={styles.rowActions}>
                <Pressable onPress={() => fillCornerForm(c)}>
                  <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>Modifier</Text>
                </Pressable>
                <Pressable onPress={() => void setAdminCreatorCornerActive(c.id, countryCode, !c.isActive).then(() => load({ force: true }))}>
                  <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>{c.isActive ? 'Désactiver' : 'Activer'}</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert('Supprimer', c.subjectName, [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Supprimer', style: 'destructive', onPress: () => void deleteAdminCreatorCorner(c.id).then(() => load({ force: true })) },
                    ])
                  }
                >
                  <Text style={{ color: '#ef4444', fontWeight: '700' }}>Supprimer</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {tab === 'chronique' ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>
            {editingChroniqueId
              ? `Modifier ${ACCUEIL_COPY.chronique.short}`
              : `Nouveau — ${ACCUEIL_COPY.chronique.short}`}
          </Text>
          <Text style={[styles.cardMeta, { color: shell.pageKicker, marginBottom: 8 }]}>
            Carte courte sur Accueil — indépendante des Singuliers. Le bouton ouvre la fiche du contenu lié.
          </Text>
          <TextInput
            value={chroniqueVolume}
            onChangeText={setChroniqueVolume}
            placeholder="Surtitre (ex. VOLUME 01 ou CHRONIQUE)"
            placeholderTextColor={shell.pageKicker}
            style={[styles.input, fieldStyle(shell)]}
          />
          <TextInput
            value={chroniqueTitle}
            onChangeText={setChroniqueTitle}
            placeholder="Titre principal *"
            placeholderTextColor={shell.pageKicker}
            style={[styles.input, fieldStyle(shell)]}
          />
          <TextInput
            value={chroniqueBody}
            onChangeText={setChroniqueBody}
            placeholder="Texte d’ambiance (2 courts paragraphes) *"
            placeholderTextColor={shell.pageKicker}
            multiline
            style={[styles.input, styles.inputMulti, fieldStyle(shell)]}
          />
          <TextInput
            value={chroniqueFootnote}
            onChangeText={setChroniqueFootnote}
            placeholder="Note de bas de carte (optionnel)"
            placeholderTextColor={shell.pageKicker}
            style={[styles.input, fieldStyle(shell)]}
          />

          <Pressable
            onPress={() => setChroniqueCtaEnabled((v) => !v)}
            style={[styles.toggleRow, { borderColor: shell.filterInactiveBorder }]}
          >
            <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Bouton Découvrir</Text>
            <Text style={{ color: ADMIN_THEME.accent, fontWeight: '800' }}>{chroniqueCtaEnabled ? 'Oui' : 'Non'}</Text>
          </Pressable>

          {chroniqueCtaEnabled ? (
            <>
              <TextInput
                value={chroniqueCta}
                onChangeText={setChroniqueCta}
                placeholder="Libellé bouton (auto selon le type)"
                placeholderTextColor={shell.pageKicker}
                style={[styles.input, fieldStyle(shell)]}
              />
              <TextInput
                value={chroniqueLoc}
                onChangeText={setChroniqueLoc}
                placeholder="Nom du contenu (auto à la sélection)"
                placeholderTextColor={shell.pageKicker}
                style={[styles.input, fieldStyle(shell)]}
              />

            </>
          ) : (
            <>
              <Text style={[styles.hint, { color: shell.pageKicker }]}>
                Sans Découvrir, la carte affiche Contacter (téléphone prioritaire, sinon e-mail).
              </Text>
              <TextInput
                value={chroniqueContactPhone}
                onChangeText={setChroniqueContactPhone}
                placeholder="Téléphone à contacter *"
                placeholderTextColor={shell.pageKicker}
                keyboardType="phone-pad"
                style={[styles.input, fieldStyle(shell)]}
              />
              <TextInput
                value={chroniqueContactEmail}
                onChangeText={setChroniqueContactEmail}
                placeholder="E-mail (si pas de numéro)"
                placeholderTextColor={shell.pageKicker}
                keyboardType="email-address"
                autoCapitalize="none"
                style={[styles.input, fieldStyle(shell)]}
              />
              <TextInput
                value={chroniqueLoc}
                onChangeText={setChroniqueLoc}
                placeholder="Lieu / contexte (optionnel)"
                placeholderTextColor={shell.pageKicker}
                style={[styles.input, fieldStyle(shell)]}
              />
            </>
          )}

          {chroniqueCtaEnabled ? (
            <AdminPublishedContentPicker
              label="Contenu lié *"
              hint="Cible du bouton Découvrir — recherche dans spots, événements et outils publiés."
              required
              shell={shell}
              spots={spotOptions}
              events={eventOptions}
              tools={toolOptions}
              value={chroniqueTargetPick}
              onChange={(pick) => {
                if (!pick) {
                  setChroniqueTargetType(null);
                  setChroniqueTargetId(null);
                  setChroniqueTargetSlug(null);
                  setChroniqueLoc('');
                  return;
                }
                setChroniqueTargetType(pick.kind);
                setChroniqueTargetId(pick.id);
                setChroniqueTargetSlug(pick.slug);
                setChroniqueLoc(pick.label);
                const autoCta =
                  pick.kind === 'event'
                    ? 'Voir l’événement'
                    : pick.kind === 'tool'
                      ? 'Voir l’outil'
                      : 'Voir le spot';
                if (!chroniqueCta.trim()) setChroniqueCta(autoCta);
              }}
            />
          ) : null}

          <Text style={[styles.subLabel, { color: shell.pageKicker }]}>Planification (optionnel)</Text>
          <DateTimeField
            value={chroniquePeriodStart}
            onChange={setChroniquePeriodStart}
            placeholder="Date de début"
            shell={shell}
            dateOnly
          />
          <DateTimeField
            value={chroniquePeriodEnd}
            onChange={setChroniquePeriodEnd}
            placeholder="Date de fin"
            shell={shell}
            dateOnly
          />
          <Pressable onPress={() => setChroniqueActivate((v) => !v)} style={[styles.toggleRow, { borderColor: shell.filterInactiveBorder }]}>
            <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Activer sur Accueil</Text>
            <Text style={{ color: ADMIN_THEME.accent, fontWeight: '800' }}>{chroniqueActivate ? 'Oui' : 'Non'}</Text>
          </Pressable>
          <Pressable style={[styles.btn, { backgroundColor: ADMIN_THEME.accent }]} onPress={() => void saveChronique()}>
            <Text style={styles.btnText}>{editingChroniqueId ? 'Enregistrer' : 'Créer'}</Text>
          </Pressable>
          {editingChroniqueId ? (
            <Pressable style={styles.linkBtn} onPress={resetChroniqueForm}>
              <Text style={{ color: shell.pageKicker, fontWeight: '700' }}>Annuler l’édition</Text>
            </Pressable>
          ) : null}

          <Text style={[styles.sectionTitle, { color: shell.pageKicker, marginTop: 16 }]}>
            {ACCUEIL_COPY.chronique.adminBlock}
          </Text>
          {chroniques.map((c) => (
            <View key={c.id} style={[styles.card, adminCardStyle(shell)]}>
              <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>
                {c.isActive ? '● ' : '○ '}
                {c.title}
              </Text>
              <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                {c.volumeLabel ? `${c.volumeLabel} · ` : ''}
                {c.locationLabel ?? 'Sans lieu'}
                {c.targetType ? ` · ${c.targetType}` : ''}
                {c.periodStart ? ` · début ${c.periodStart}` : ''}
                {c.periodEnd ? ` · fin ${c.periodEnd}` : ''}
              </Text>
              <View style={styles.rowActions}>
                <Pressable onPress={() => fillChroniqueForm(c)}>
                  <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>Modifier</Text>
                </Pressable>
                <Pressable onPress={() => void setAdminChroniqueActive(c.id, countryCode, !c.isActive).then(() => load({ force: true }))}>
                  <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>{c.isActive ? 'Désactiver' : 'Activer'}</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert('Supprimer', c.title, [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Supprimer', style: 'destructive', onPress: () => void deleteAdminChronique(c.id).then(() => load({ force: true })) },
                    ])
                  }
                >
                  <Text style={{ color: '#ef4444', fontWeight: '700' }}>Supprimer</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {tab === 'logos' ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>
            {editingLogoId ? 'Modifier le logo' : 'Ajouter un logo'}
          </Text>
          <TextInput value={logoName} onChangeText={setLogoName} placeholder="Nom partenaire" placeholderTextColor={shell.pageKicker} style={[styles.input, fieldStyle(shell)]} />
          <ImageUploadField
            label="Logo"
            value={logoUrl}
            onChange={setLogoUrl}
            shell={shell}
            folder="gallery"
            cropAspect={[1, 1]}
            hint="Logo carré (1:1). Choisis une image depuis la galerie, ou colle une URL."
          />
          <Pressable style={[styles.btn, { backgroundColor: ADMIN_THEME.accent }]} onPress={() => void createLogo()}>
            <Text style={styles.btnText}>{editingLogoId ? 'Enregistrer' : 'Ajouter au ruban'}</Text>
          </Pressable>
          {editingLogoId ? (
            <Pressable style={styles.linkBtn} onPress={resetLogoForm}>
              <Text style={{ color: shell.pageKicker, fontWeight: '700' }}>Annuler l’édition</Text>
            </Pressable>
          ) : null}
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Logos décoratifs uniquement (non cliquables sur Accueil).
          </Text>
          {logos.map((l) => (
            <View key={l.id} style={[styles.card, adminCardStyle(shell)]}>
              <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>
                {l.isActive ? '● ' : '○ '}
                {l.name}
              </Text>
              <View style={styles.rowActions}>
                <Pressable onPress={() => fillLogoForm(l)}>
                  <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>Modifier</Text>
                </Pressable>
                <Pressable onPress={() => void setAdminHomePartnerLogoActive(l.id, !l.isActive, countryCode).then(() => load({ force: true }))}>
                  <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>{l.isActive ? 'Désactiver' : 'Activer'}</Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    Alert.alert('Supprimer', l.name, [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Supprimer', style: 'destructive', onPress: () => void deleteAdminHomePartnerLogo(l.id, countryCode).then(() => load({ force: true })) },
                    ])
                  }
                >
                  <Text style={{ color: '#ef4444', fontWeight: '700' }}>Supprimer</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </KeyboardAwareFormScroll>
  );
}

function OverviewCard({
  title,
  meta,
  onPress,
  shell,
}: {
  title: string;
  meta: string;
  onPress: () => void;
  shell: { pageTitle: string; pageKicker: string };
}) {
  return (
    <View style={[styles.card, adminCardStyle(shell as never)]}>
      <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>{title}</Text>
      <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>{meta}</Text>
      <Pressable style={styles.linkBtn} onPress={onPress}>
        <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>Gérer →</Text>
      </Pressable>
    </View>
  );
}

function fieldStyle(shell: { pageTitle: string; filterInactiveBorder: string }) {
  return { color: shell.pageTitle, borderColor: shell.filterInactiveBorder };
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 12, paddingBottom: 40 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
    marginTop: 4,
  },
  subLabel: { fontSize: 11, fontWeight: '700', marginTop: 6, marginBottom: 4 },
  card: { marginBottom: 4 },
  cardTitle: { fontSize: 14, fontWeight: '800' },
  cardMeta: { marginTop: 4, fontSize: 12, lineHeight: 16 },
  btn: { marginTop: 10, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  linkBtn: { marginTop: 10 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 },
  hint: { marginTop: 4, marginBottom: 8, fontSize: 11, lineHeight: 15, fontStyle: 'italic' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, maxWidth: '100%' },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  linkRow: { flexDirection: 'row', gap: 8 },
  linkHalf: { flex: 1 },
});
