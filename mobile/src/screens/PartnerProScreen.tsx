import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import { useContent } from '@/context/ContentContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useScrollContentContainerStyle } from '@/hooks/useScrollContentContainerStyle';
import { usePartnerContentScopes } from '@/hooks/usePartnerContentScopes';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { AdminKpiCard, AdminModuleCard } from '@/components/admin/AdminShell';
import { PartnerSubmissionChoiceModal } from '@/components/PartnerSubmissionChoiceModal';
import { PageHeader } from '@/components/PageHeader';
import { countPartnerValidationMetrics } from '@/lib/benefit-redemption-store';
import { listPartnerBenefitOffers } from '@/lib/partner-benefit-offers-store';
import { countPartnerPendingRewards } from '@/lib/partner-milestone-store';
import { startOfCurrentMonth } from '@/lib/partner-engagement-report';
import { listPartnerEvents, listPartnerSpots } from '@/lib/partner-staging-store';
import { resolvePartnerWorkspaceContext } from '@/lib/partner-spot-auth';
import { getOrCreatePartnerValidationCode } from '@/lib/partner-validation-code-store';
import { PARTNER_PUBLICATION_NOTICE } from '@/lib/legal-content-store';
import { countPartnerCatalogBenefits } from '@/lib/partner-benefit-matching';
import { navigateRoot } from '@/lib/navigation-utils';
import { DEFAULT_SECTIONS, getAppSections, type PartnerProBlocksConfig } from '@/lib/app-sections-store';
import type { TabScreenProps } from '@/navigation/types';

type Props = TabScreenProps<'PartnerPro'>;

export function PartnerProScreen({ navigation }: Props) {
  const { role, user } = useAuthContext();
  const { activeCountryCode } = useContent();
  const { shell } = useMemberTheme();
  const PRO_ACCENT = shell.tabIndicator;
  const { canManageEvents, canManageSpots, canManageTools, hasAnyScope } = usePartnerContentScopes();
  const [eventCount, setEventCount] = useState(0);
  const [spotCount, setSpotCount] = useState(0);
  const [toolCount, setToolCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [benefitOffers, setBenefitOffers] = useState(0);
  const [activeBenefits, setActiveBenefits] = useState(0);
  const [monthValidations, setMonthValidations] = useState(0);
  const [validationCode, setValidationCode] = useState<string | null>(null);
  const [milestonePending, setMilestonePending] = useState(0);
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);
  const [blocks, setBlocks] = useState<PartnerProBlocksConfig>(DEFAULT_SECTIONS.partnerPro);

  const loader = useCallback(async (_force: boolean) => {
    if (!user?.id || role !== 'PARTNER') return;
    const ctx = await resolvePartnerWorkspaceContext(user);
    const { effectiveUserId, partnerLabel, phone, authUserId } = ctx;
    const authHint = authUserId ?? user.id;

    try {
      const [ev, sp] = await Promise.all([
        listPartnerEvents(effectiveUserId, partnerLabel),
        listPartnerSpots(effectiveUserId, partnerLabel),
      ]);
      setEventCount(ev.length);
      setSpotCount(sp.filter((s) => s.subCategory !== 'tools').length);
      setToolCount(sp.filter((s) => s.subCategory === 'tools').length);
    } catch (err) {
      console.warn('[PartnerPro] KPI contenu:', err instanceof Error ? err.message : err);
    }

    try {
      const offers = await listPartnerBenefitOffers(effectiveUserId, partnerLabel, undefined, phone, authHint);
      const pendingCount = offers.filter((o) => o.status === 'pending').length;
      setBenefitOffers(pendingCount);
      setActiveBenefits(await countPartnerCatalogBenefits(effectiveUserId, partnerLabel, phone, authHint));
      if (__DEV__) {
        console.log('[PartnerPro] KPI privilèges', { pendingCount, total: offers.length });
      }
    } catch (err) {
      console.warn('[PartnerPro] KPI privilèges:', err instanceof Error ? err.message : err);
    }

    try {
      const codeEntry = await getOrCreatePartnerValidationCode(effectiveUserId, partnerLabel);
      setValidationCode(codeEntry.code);
      const monthStats = await countPartnerValidationMetrics(
        codeEntry.partnerId,
        partnerLabel,
        startOfCurrentMonth(),
      );
      setMonthValidations(monthStats.validations);
      setMilestonePending(await countPartnerPendingRewards(effectiveUserId));
      const sections = await getAppSections(activeCountryCode);
      setBlocks(sections.partnerPro);
    } catch (err) {
      console.warn('[PartnerPro] KPI divers:', err instanceof Error ? err.message : err);
    }
  }, [user?.id, user?.phoneNumber, user?.company, user?.fullName, role, activeCountryCode]);

  const { run } = useFocusLoad(loader, {
    ttlMs: 90_000,
    enabled: role === 'PARTNER' && Boolean(user?.id),
    resetKey: activeCountryCode,
  });

  const openPartnerValidation = useCallback(async () => {
    if (!user) return;
    const partnerLabel = user.company ?? user.fullName ?? 'Partenaire';
    try {
      let code = validationCode;
      if (!code) {
        const entry = await getOrCreatePartnerValidationCode(user.id, partnerLabel);
        code = entry.code;
        setValidationCode(code);
      }
      navigateRoot(navigation, 'PartnerBenefitScan', {
        partnerId: user.id,
        partnerName: partnerLabel,
        partnerCode: code,
      });
    } catch {
      Alert.alert(
        'Validation indisponible',
        'Impossible de charger votre code partenaire. Vérifiez votre connexion et réessayez.',
      );
    }
  }, [navigation, user, validationCode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await run(true);
    setRefreshing(false);
  }, [run]);

  const scrollContentStyle = useScrollContentContainerStyle(styles.container, {
    stickyHeaderEstimate: 0,
    includeTabBar: true,
    paddingBottom: 32,
  });

  if (role !== 'PARTNER') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={[styles.deniedTitle, { color: shell.pageTitle }]}>Espace Pro</Text>
        <Text style={[styles.deniedBody, { color: shell.pageKicker }]}>Réservé aux partenaires THE LOOP.</Text>
        <Pressable onPress={() => navigateRoot(navigation, 'Auth', { mode: 'login' })}>
          <Text style={{ color: PRO_ACCENT, fontWeight: '700' }}>Se connecter avec e-mail et mot de passe →</Text>
        </Pressable>
      </View>
    );
  }

  const canSubmitContent = canManageEvents || canManageSpots || canManageTools;

  const modules: { icon: string; title: string; description: string; badge?: number; action: () => void }[] = [
    ...(canSubmitContent && blocks.content
      ? [{
          icon: '📋',
          title: 'Mon contenu',
          description: 'Événements, spots et outils — statuts et brouillons',
          action: () => navigateRoot(navigation, 'PartnerContent'),
        }]
      : []),
    ...(blocks.stats
      ? [{
          icon: '📊',
          title: 'Performances',
          description: 'Clics, favoris, notes et étoiles par contenu (vos actions exclues)',
          action: () => navigation.navigate('PartnerStats'),
        }]
      : []),
    ...(blocks.featured
      ? [{
          icon: '⭐',
          title: 'À la une',
          description: 'Historique et mises en avant en cours — consultation seule',
          action: () => navigateRoot(navigation, 'PartnerFeatured'),
        }]
      : []),
    ...(blocks.benefits
      ? [{
          icon: '🎁',
          title: 'Privilèges offerts',
          description: 'Propositions THE LOOP — accepter, refuser et suivre',
          badge: benefitOffers,
          action: () => navigateRoot(navigation, 'PartnerBenefits'),
        }]
      : []),
    ...(blocks.rewards
      ? [{
          icon: '🏅',
          title: 'Récompenses THE LOOP',
          description: 'Paliers validations — à la une, push',
          badge: milestonePending,
          action: () => navigateRoot(navigation, 'PartnerRewards'),
        }]
      : []),
    {
      icon: '✓',
      title: 'Validation',
      description: 'Scanner le QR membre — identifier un compte THE LOOP ou valider un privilège',
      action: () => {
        void openPartnerValidation();
      },
    },
    ...(canSubmitContent && blocks.content
      ? [{
          icon: '➕',
          title: 'Nouvelle soumission',
          description: 'Événement, spot ou outil — brouillon ou soumission à validation',
          action: () => setSubmissionModalOpen(true),
        }]
      : []),
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={scrollContentStyle}
      alwaysBounceVertical
      overScrollMode="always"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={PRO_ACCENT} />}
    >
      <PageHeader title="Pro" shell={shell} />
      <Text style={[styles.subtitle, { color: shell.pageKicker }]}>
        {user?.company ?? user?.fullName ?? 'Partenaire'} · {user?.countryCode ?? 'GN'}
      </Text>

      {!hasAnyScope ? (
        <Text style={[styles.scopeNotice, { color: '#f59e0b', borderColor: 'rgba(245,158,11,0.35)' }]}>
          Aucun module de contenu activé pour votre compte. Contactez THE LOOP pour publier des événements, spots ou outils.
        </Text>
      ) : null}

      <View style={styles.kpiGrid}>
        {canManageEvents ? (
          <AdminKpiCard label="Événements" value={String(eventCount)} shell={shell} accent={PRO_ACCENT} style={styles.kpiThird} />
        ) : null}
        {canManageSpots ? (
          <AdminKpiCard label="Spots" value={String(spotCount)} shell={shell} accent={PRO_ACCENT} style={styles.kpiThird} />
        ) : null}
        {canManageTools ? (
          <AdminKpiCard label="Outils" value={String(toolCount)} shell={shell} accent="#6366f1" style={styles.kpiThird} />
        ) : null}
        <AdminKpiCard label="Validations" value={String(monthValidations)} hint="Ce mois" shell={shell} accent="#3b82f6" style={styles.kpiThird} />
        <AdminKpiCard label="Privilèges offerts" value={String(activeBenefits)} hint="Acceptés / actifs" shell={shell} accent="#f59e0b" style={styles.kpiThird} />
        <AdminKpiCard label="À valider" value={String(benefitOffers)} hint="Demandes THE LOOP" shell={shell} accent="#8b5cf6" style={styles.kpiThird} />
      </View>

      <Text style={[styles.section, { color: shell.pageKicker }]}>Modules</Text>
      {modules.map((m) => (
        <AdminModuleCard
          key={m.title}
          icon={m.icon}
          title={m.title}
          description={m.description}
          badge={m.badge}
          shell={shell}
          onPress={m.action}
        />
      ))}

      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        {PARTNER_PUBLICATION_NOTICE} Contenu publié ou désactivé : lecture seule. Pour supprimer, contactez l'administrateur.
      </Text>

      <PartnerSubmissionChoiceModal
        visible={submissionModalOpen}
        shell={shell}
        onClose={() => setSubmissionModalOpen(false)}
        onEvent={canManageEvents ? () => {
          setSubmissionModalOpen(false);
          navigateRoot(navigation, 'PartnerSubmission', { type: 'event' });
        } : undefined}
        onSpot={canManageSpots ? () => {
          setSubmissionModalOpen(false);
          navigateRoot(navigation, 'PartnerSubmission', { type: 'spot' });
        } : undefined}
        onTool={canManageTools ? () => {
          setSubmissionModalOpen(false);
          navigateRoot(navigation, 'PartnerSubmission', { type: 'spot', isTool: true });
        } : undefined}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  subtitle: { fontSize: 12, marginBottom: 12 },
  scopeNotice: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 12, lineHeight: 18 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiThird: { width: '31%', paddingVertical: 12, paddingHorizontal: 6 },
  section: { marginTop: 24, marginBottom: 12, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  hint: { marginTop: 16, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  deniedTitle: { fontSize: 18, fontWeight: '700' },
  deniedBody: { marginTop: 8, marginBottom: 16, textAlign: 'center', fontSize: 14 },
});
