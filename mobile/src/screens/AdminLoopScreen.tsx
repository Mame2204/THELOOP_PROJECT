import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { useAdminCatalog } from '@/hooks/useAdminCatalog';
import { useAnyAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import type { AdminPermissionId } from '@/lib/admin-permissions';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useScrollContentContainerStyle } from '@/hooks/useScrollContentContainerStyle';
import { AdminKpiCard, AdminModuleCard, AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { PartnerSubmissionChoiceModal } from '@/components/PartnerSubmissionChoiceModal';
import { isToolLocation } from '@/lib/location-kind-utils';
import { isTeamContentOrigin } from '@/lib/content-origin';
import { matchesAdminCountry } from '@/lib/admin-country';
import {
  getOrCreateTheLoopTeamValidationCode,
  THE_LOOP_TEAM_PARTNER_KEY,
  THE_LOOP_TEAM_PARTNER_NAME,
} from '@/lib/partner-validation-code-store';
import { countPartnerValidationMetrics } from '@/lib/benefit-redemption-store';
import { countDashboardActiveCatalogBenefits } from '@/lib/benefit-catalog-store';
import { listAllPartnerBenefitOffersForAdmin } from '@/lib/partner-benefit-offers-store';
import { startOfCurrentMonth } from '@/lib/partner-engagement-report';
import { PARTNER_PUBLICATION_NOTICE } from '@/lib/legal-content-store';
import { navigateRoot } from '@/lib/navigation-utils';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AdminPanelParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<AdminPanelParamList, 'AdminLoopHub'>;

/**
 * Hub THE LOOP — même structure que l’Espace Pro partenaire
 * (sans module Récompenses). Formulaires = PartnerSubmission.
 */
export function AdminLoopScreen({ navigation }: Props) {
  const { role, user } = useAuthContext();
  const { hasPermission } = useAdminPermissions();
  const { allowed: canAccessLoop } = useAnyAdminModuleAccess(['loop_hub', 'content', 'featured', 'prime_benefits']);
  const { countryLabel, countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { publicEvents, primeEvents, getHomeLocations } = useAdminCatalog();
  const PRO_ACCENT = ADMIN_THEME.accent;

  const [eventCount, setEventCount] = useState(0);
  const [spotCount, setSpotCount] = useState(0);
  const [toolCount, setToolCount] = useState(0);
  const [monthValidations, setMonthValidations] = useState(0);
  const [activeBenefits, setActiveBenefits] = useState(0);
  const [benefitOffers, setBenefitOffers] = useState(0);
  const [validationCode, setValidationCode] = useState<string | null>(null);
  const [validationPartnerKey, setValidationPartnerKey] = useState(THE_LOOP_TEAM_PARTNER_KEY);
  const [refreshing, setRefreshing] = useState(false);
  const [submissionModalOpen, setSubmissionModalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const locs = getHomeLocations();
    const teamEvents = [...publicEvents, ...primeEvents].filter(
      (e) => isTeamContentOrigin(e.contentOrigin) && matchesAdminCountry(e.countryCode, countryCode),
    );
    const teamLocs = locs.filter(
      (l) => isTeamContentOrigin(l.contentOrigin) && matchesAdminCountry(l.countryCode, countryCode),
    );
    setEventCount(teamEvents.length);
    setSpotCount(teamLocs.filter((s) => !isToolLocation(s)).length);
    setToolCount(teamLocs.filter((s) => isToolLocation(s)).length);

    const codeEntry = await getOrCreateTheLoopTeamValidationCode();
    setValidationCode(codeEntry.code);
    setValidationPartnerKey(codeEntry.partnerId);
    const [monthStats, offers, loopBenefits] = await Promise.all([
      countPartnerValidationMetrics(codeEntry.partnerId, THE_LOOP_TEAM_PARTNER_NAME, startOfCurrentMonth()),
      listAllPartnerBenefitOffersForAdmin(countryCode),
      countDashboardActiveCatalogBenefits(countryCode, { theLoopOnly: true }),
    ]);
    setMonthValidations(monthStats.validations);
    // Demandes en attente côté partenaires pour des privilèges THE LOOP
    setBenefitOffers(offers.filter((o) => o.status === 'pending').length);
    setActiveBenefits(loopBenefits);
  }, [user?.id, getHomeLocations, publicEvents, primeEvents, countryCode]);

  const { run } = useFocusLoad(
    async () => {
      await load();
    },
    {
      ttlMs: 90_000,
      enabled: role === 'ADMIN' && canAccessLoop,
      resetKey: countryCode,
    },
  );

  const openBenefitScan = useCallback(() => {
    if (!validationCode) return;
    navigateRoot(navigation, 'PartnerBenefitScan', {
      partnerId: validationPartnerKey,
      partnerName: THE_LOOP_TEAM_PARTNER_NAME,
      partnerCode: validationCode,
    });
  }, [navigation, validationCode, validationPartnerKey]);

  const openSubmission = useCallback(
    (params: { type: 'event' | 'spot'; isTool?: boolean }) => {
      setSubmissionModalOpen(false);
      navigateRoot(navigation, 'PartnerSubmission', {
        type: params.type,
        asAdmin: true,
        contentChannel: 'loop',
        isTool: params.isTool,
      });
    },
    [navigation],
  );

  const modules = useMemo(() => {
    const list: {
      icon: string;
      title: string;
      description: string;
      permission: AdminPermissionId;
      action: () => void;
    }[] = [];

    if (hasPermission('content')) {
      list.push({
        icon: '📋',
        title: 'Mon contenu',
        description: 'Événements, spots et outils — statuts et brouillons',
        permission: 'content',
        action: () => navigateRoot(navigation, 'AdminLoopContent'),
      });
    }

    if (hasPermission('prime_benefits')) {
      list.push({
        icon: '🎁',
        title: 'Privilèges offerts',
        description: 'Privilèges liés à THE LOOP uniquement',
        permission: 'prime_benefits',
        action: () => navigateRoot(navigation, 'AdminLoopBenefits'),
      });
    }

    if (hasPermission('featured')) {
      list.push({
        icon: '⭐',
        title: 'À la une',
        description: 'Vos contenus THE LOOP actuellement mis en avant',
        permission: 'featured',
        action: () => navigateRoot(navigation, 'AdminLoopFeatured'),
      });
    }

    if (hasPermission('insights')) {
      list.push({
        icon: '📊',
        title: 'Performances',
        description: 'Clics, favoris et étoiles — contenus THE LOOP uniquement',
        permission: 'insights',
        action: () => navigateRoot(navigation, 'AdminLoopStats'),
      });
    }

    if (hasPermission('prime_benefits') && validationCode) {
      list.push({
        icon: '✓',
        title: 'Validation',
        description: 'Scanner le QR membre — identifier un compte ou valider un privilège',
        permission: 'prime_benefits',
        action: openBenefitScan,
      });
    }

    if (hasPermission('content')) {
      list.push({
        icon: '➕',
        title: 'Nouvelle soumission',
        description: 'Événement, spot ou outil — mêmes formulaires que l’Espace Pro',
        permission: 'content',
        action: () => setSubmissionModalOpen(true),
      });
    }

    return list;
  }, [navigation, hasPermission, validationCode, openBenefitScan]);

  const scrollContentStyle = useScrollContentContainerStyle(styles.container, {
    stickyHeaderEstimate: 0,
    paddingBottom: 32,
  });

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={[styles.deniedTitle, { color: shell.pageTitle }]}>THE LOOP</Text>
        <Text style={[styles.deniedBody, { color: shell.pageKicker }]}>Espace réservé à l'équipe THE LOOP.</Text>
      </View>
    );
  }

  if (!canAccessLoop) {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={[styles.deniedTitle, { color: shell.pageTitle }]}>Aucun module</Text>
        <Text style={[styles.deniedBody, { color: shell.pageKicker }]}>
          Contactez le super admin pour obtenir les accès Contenu ou Privilèges.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={scrollContentStyle}
      alwaysBounceVertical
      overScrollMode="always"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void run(true).finally(() => setRefreshing(false))}
          tintColor={PRO_ACCENT}
        />
      }
    >
      <AdminPageHeader
        title="Pro"
        subtitle={`Équipe THE LOOP · ${countryLabel}`}
        shell={shell}
        onBack={() => navigation.goBack()}
      />
      <AdminCountryBar shell={shell} compact />

      <View style={styles.kpiGrid}>
        {hasPermission('content') ? (
          <>
            <AdminKpiCard label="Événements" value={String(eventCount)} shell={shell} accent={PRO_ACCENT} style={styles.kpiThird} />
            <AdminKpiCard label="Spots" value={String(spotCount)} shell={shell} accent={PRO_ACCENT} style={styles.kpiThird} />
            <AdminKpiCard label="Outils" value={String(toolCount)} shell={shell} accent="#6366f1" style={styles.kpiThird} />
          </>
        ) : null}
        {hasPermission('prime_benefits') ? (
          <>
            <AdminKpiCard
              label="Validations"
              value={String(monthValidations)}
              hint="Ce mois"
              shell={shell}
              accent="#3b82f6"
              style={styles.kpiThird}
              onPress={validationCode ? openBenefitScan : undefined}
            />
            <AdminKpiCard
              label="Privilèges offerts"
              value={String(activeBenefits)}
              hint="Actifs · validés · THE LOOP"
              shell={shell}
              accent="#f59e0b"
              style={styles.kpiThird}
              onPress={() => navigateRoot(navigation, 'AdminLoopBenefits')}
            />
            <AdminKpiCard
              label="À valider"
              value={String(benefitOffers)}
              hint="En attente"
              shell={shell}
              accent="#8b5cf6"
              style={styles.kpiThird}
            />
          </>
        ) : null}
      </View>

      <Text style={[styles.section, { color: shell.pageKicker }]}>Modules</Text>
      {modules.map((m) => (
        <AdminModuleCard
          key={m.title}
          icon={m.icon}
          title={m.title}
          description={m.description}
          shell={shell}
          onPress={m.action}
        />
      ))}

      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        {PARTNER_PUBLICATION_NOTICE} Publication directe équipe — mêmes formulaires que les partenaires.
      </Text>

      <PartnerSubmissionChoiceModal
        visible={submissionModalOpen}
        shell={shell}
        onClose={() => setSubmissionModalOpen(false)}
        onEvent={() => openSubmission({ type: 'event' })}
        onSpot={() => openSubmission({ type: 'spot' })}
        onTool={() => openSubmission({ type: 'spot', isTool: true })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiThird: { width: '31%', paddingVertical: 12, paddingHorizontal: 6 },
  section: { marginTop: 24, marginBottom: 12, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  hint: { marginTop: 16, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  denied: { flex: 1, padding: 24, justifyContent: 'center' },
  deniedTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  deniedBody: { fontSize: 14, lineHeight: 20 },
});
