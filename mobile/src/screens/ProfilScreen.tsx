import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { useAuthContext } from '@/context/AuthContext';
import { useAppGates } from '@/context/AppGatesContext';
import { useViewingCountry } from '@/context/ViewingCountryContext';
import { CONTENT_H_PADDING } from '@/constants/layout';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { MemberQrCard } from '@/components/MemberQrCard';
import { PageHeader } from '@/components/PageHeader';
import { SupportFooter } from '@/components/SupportFooter';
import { formatDateFr } from '@/lib/date-utils';
import {
  getOrCreatePartnerValidationCode,
  getOrCreateTheLoopTeamValidationCode,
  THE_LOOP_TEAM_PARTNER_NAME,
} from '@/lib/partner-validation-code-store';
import { getReferralStats, type ReferralStats } from '@/lib/referral-store';
import {
  getUserFacingPrimePass,
  hasMeaningfulPrimePassHistory,
  passDisplayLabel,
} from '@/lib/subscription-history';
import { hydrateAndSyncPassGrantsFromSupabase } from '@/lib/pass-admin-store';
import { getCountryLabel } from '@/lib/countries';
import { getProfileAccent } from '@/lib/profile-accent';
import { isSuperAdminAccount } from '@/lib/role-benefit-eligibility';
import { resetToAccueil } from '@/lib/navigation-utils';
import { isPassPurchaseUiEnabled } from '@/lib/pass-purchase-ui';
import type { TabScreenProps } from '@/navigation/types';

type Props = TabScreenProps<'Profil'>;

export function ProfilScreen({ navigation }: Props) {
  const { user, role, signOut } = useAuthContext();
  const { gates } = useAppGates();
  const passPurchaseEnabled = isPassPurchaseUiEnabled(gates);
  const { shell, grade, theme } = useMemberTheme();
  const { isExploringOtherCountry, viewingCountryCode } = useViewingCountry();
  const isFocused = useIsFocused();
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [activePassLabel, setActivePassLabel] = useState<string | null>(null);
  const [hasPrimeHistory, setHasPrimeHistory] = useState(false);
  const [passProfileReady, setPassProfileReady] = useState(false);
  const [partnerValidationCode, setPartnerValidationCode] = useState<string | null>(null);

  const isPartner = role === 'PARTNER';
  const isAdminOrganizer = role === 'ADMIN';
  const showPartnerCode = isPartner || isAdminOrganizer;

  const loadReferral = useCallback(async () => {
    if (!user || user.id === 'anonymous') return;
    setReferralStats(await getReferralStats(user.id, user));
  }, [user?.id, user?.referralCode, user?.phoneNumber, user?.email]);

  const loadPassProfile = useCallback(async () => {
    if (!user || user.id === 'anonymous') {
      setActivePassLabel(null);
      setHasPrimeHistory(false);
      setPassProfileReady(false);
      return;
    }

    if (role === 'USER_PRIME') {
      const history = await hydrateAndSyncPassGrantsFromSupabase(user.id);
      setHasPrimeHistory(hasMeaningfulPrimePassHistory(history));
      const facing = getUserFacingPrimePass(history);
      setActivePassLabel(facing ? passDisplayLabel(facing) : null);
      setPassProfileReady(true);
      return;
    }

    if (role === 'USER_FREE') {
      const history = await hydrateAndSyncPassGrantsFromSupabase(user.id);
      setHasPrimeHistory(hasMeaningfulPrimePassHistory(history));
      setActivePassLabel(null);
      setPassProfileReady(true);
      return;
    }

    setActivePassLabel(null);
    setHasPrimeHistory(false);
    setPassProfileReady(true);
  }, [user?.id, role]);

  const loadPartnerCode = useCallback(async () => {
    if (!user || !showPartnerCode) {
      setPartnerValidationCode(null);
      return;
    }
    const entry =
      role === 'ADMIN'
        ? await getOrCreateTheLoopTeamValidationCode()
        : await getOrCreatePartnerValidationCode(
            user.id,
            user.company ?? user.fullName ?? 'Partenaire',
          );
    setPartnerValidationCode(entry.code);
  }, [user?.id, user?.company, user?.fullName, showPartnerCode, role]);

  useEffect(() => {
    void loadReferral();
  }, [loadReferral]);

  useFocusLoad(
    async () => {
      await loadPassProfile();
      await loadPartnerCode();
      // syncExpiredBenefitPendingStates retiré du focus Profil (egress) — reste sur Mes privilèges.
    },
    {
      ttlMs: 90_000,
      enabled: Boolean(user) && user?.id !== 'anonymous',
      resetKey: user?.id ?? null,
    },
  );

  if (role === 'USER_ANONYMOUS' || !user) {
    return (
      <View style={[styles.center, { backgroundColor: shell.pageBg }]}>
        <PageHeader title="Mon compte" shell={shell} />
        <View style={styles.guestBody}>
          <Text style={[styles.meta, { color: shell.pageKicker, textAlign: 'center' }]}>
            Connectez-vous pour accéder à votre carte membre.
          </Text>
          <Pressable
            style={[styles.btnGold, { backgroundColor: shell.filterActiveBg }]}
            onPress={() => navigation.navigate('Auth', { mode: 'login' })}
          >
            <Text style={[styles.btnGoldText, { color: shell.filterActiveText }]}>
              Se connecter
            </Text>
          </Pressable>
          {gates.signupEnabled ? (
            <Pressable style={styles.signupLink} onPress={() => navigation.navigate('Auth', { mode: 'signup' })}>
              <Text style={[styles.signupLinkText, { color: shell.tabIndicator }]}>Créer un compte</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  const isSuperAdmin = isSuperAdminAccount(user);
  const isDelegatedAdmin = isAdminOrganizer && !isSuperAdmin;
  const accent = getProfileAccent(role, shell, grade, theme);
  const showReferralCard = role === 'USER_FREE' || role === 'USER_PRIME' || role === 'ADMIN' || isPartner;
  // Achat PASS / Djomy — gate remote `passPurchaseEnabled`
  // Jamais Prime → carte découverte ; déjà eu un PASS → « Mon PASS » uniquement.
  const showPrimeUpgrade =
    passPurchaseEnabled && role === 'USER_FREE' && passProfileReady && !hasPrimeHistory;
  const showPassManagement =
    passPurchaseEnabled &&
    passProfileReady &&
    (role === 'USER_PRIME' || (role === 'USER_FREE' && hasPrimeHistory));
  const showPartnershipLink = role === 'USER_FREE' || role === 'USER_PRIME';
  return (
    <ScrollView style={{ backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <PageHeader title="Profil" shell={shell} />

      <MemberQrCard user={user} role={role} grade={grade} rotationActive={isFocused} />

      <View style={[styles.subCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
        <Text style={[styles.detailLabel, { color: shell.pageKicker }]}>Pays du compte</Text>
        <Text style={[styles.detailValue, { color: shell.pageTitle }]}>{getCountryLabel(user.countryCode)}</Text>
        {user.city ? (
          <>
            <Text style={[styles.detailLabel, { color: shell.pageKicker, marginTop: 10 }]}>Ville</Text>
            <Text style={[styles.detailValue, { color: shell.pageTitle }]}>{user.city}</Text>
          </>
        ) : null}
        <Text style={[styles.detailLabel, { color: shell.pageKicker, marginTop: 10 }]}>Contenu affiché</Text>
        <Text
          style={[
            styles.detailValue,
            { color: isExploringOtherCountry ? shell.tabIndicator : shell.pageTitle },
          ]}
        >
          {getCountryLabel(viewingCountryCode)}
        </Text>
      </View>

      {showPartnerCode && partnerValidationCode ? (
        <View style={[styles.subCard, { borderColor: accent.accentBorder, backgroundColor: accent.accentSoft }]}>
          <Text style={[styles.detailLabel, { color: shell.pageKicker }]}>Code partenaire</Text>
          <Text style={[styles.partnerCode, { color: accent.accent }]}>{partnerValidationCode}</Text>
          <Text style={[styles.partnerCodeHint, { color: shell.pageKicker }]}>
            {role === 'ADMIN'
              ? `Code équipe ${THE_LOOP_TEAM_PARTNER_NAME} — partagé avec toute l’administration. Validation des privilèges sur nos événements et contenus (onglet THE LOOP).`
              : 'À communiquer à votre équipe pour valider les privilèges membres au comptoir.'}
          </Text>
        </View>
      ) : null}

      {showReferralCard ? (
        <Pressable
          style={[styles.referralCard, { borderColor: accent.accentBorder, backgroundColor: accent.accentSoft }]}
          onPress={() => navigation.navigate('Referral')}
        >
          <Text style={[styles.referralKicker, { color: shell.pageKicker }]}>
            {isPartner ? 'Code parrainage membre' : 'Parrainage'}
          </Text>
          <Text style={[styles.referralCode, { color: accent.accent }]}>
            {referralStats?.referralCode ?? user.referralCode ?? '…'}
          </Text>
          <Text style={[styles.referralMeta, { color: shell.pageKicker }]}>
            {isPartner
              ? 'Invitez des membres avec ce code LOOP — distinct du code partenaire de validation.'
              : isAdminOrganizer
                ? `${referralStats?.totalReferrals ?? 0} filleul${(referralStats?.totalReferrals ?? 0) > 1 ? 's' : ''} · suivi sans récompense`
                : `${referralStats?.progressToNextReward ?? 0}/${referralStats?.referralsPerReward ?? 10} filleuls vers 1 mois Prime`}
          </Text>
          <Text style={[styles.referralLink, { color: accent.accent }]}>Voir mon parrainage →</Text>
        </Pressable>
      ) : null}

      {isDelegatedAdmin ? (
        <Text style={[styles.adminHint, { color: shell.pageKicker }]}>
          Gestion du pack admin et des comptes équipe : Control Tower → Privilèges TEAMS.
        </Text>
      ) : null}

      {role === 'USER_PRIME' && activePassLabel ? (
        <View style={[styles.subCard, { borderColor: accent.accentBorder, backgroundColor: shell.filterInactiveBg }]}>
          <Text style={[styles.detailLabel, { color: shell.pageKicker }]}>PASS en cours</Text>
          <Text style={[styles.detailValue, { color: shell.pageTitle }]}>{activePassLabel}</Text>
          {user.subscriptionExpiresAt ? (
            <Text style={[styles.subExpiry, { color: accent.accent }]}>
              Échéance : {formatDateFr(user.subscriptionExpiresAt)}
            </Text>
          ) : null}
          {passPurchaseEnabled ? (
            <Pressable style={styles.linkBtn} onPress={() => navigation.navigate('Abonnement')}>
              <Text style={[styles.linkBtnText, { color: accent.accent }]}>
                Voir l'historique →
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {showPassManagement ? (
        <Pressable
          style={[
            styles.btnGold,
            {
              backgroundColor: role === 'USER_PRIME' ? accent.accent : shell.filterActiveBg,
            },
          ]}
          onPress={() => navigation.navigate('Abonnement')}
        >
          <Text
            style={[
              styles.btnGoldText,
              { color: role === 'USER_PRIME' ? '#000' : shell.filterActiveText },
            ]}
          >
            Mon PASS
          </Text>
        </Pressable>
      ) : null}

      <View style={styles.profileActions}>
        <Pressable
          style={[styles.btnOutline, styles.btnHalf, { borderColor: shell.filterInactiveBorder }]}
          onPress={() => navigation.navigate('EditProfil')}
        >
          <Text style={[styles.btnOutlineText, { color: shell.pageTitle }]}>Modifier le profil</Text>
        </Pressable>
        <Pressable
          style={[styles.btnOutline, styles.btnHalf, { borderColor: shell.filterInactiveBorder }]}
          onPress={() => navigation.navigate('Settings')}
        >
          <Text style={[styles.btnOutlineText, { color: shell.pageTitle }]}>Paramètres</Text>
        </Pressable>
      </View>

      {showPrimeUpgrade && (
        <>
          <View style={[styles.divider, { backgroundColor: shell.filterInactiveBorder }]} />
          <Pressable style={[styles.primeCard, { borderColor: accent.accentBorder, backgroundColor: accent.accentSoft }]} onPress={() => navigation.navigate('Prime')}>
            <Text style={[styles.primeKicker, { color: accent.accent }]}>Prime</Text>
            <Text style={[styles.primeTitle, { color: accent.accent }]}>Passez à l'expérience premium</Text>
            <Text style={[styles.primeBody, { color: shell.pageKicker }]} numberOfLines={2} ellipsizeMode="tail">
              Invitations prioritaires, thème exclusif doré, accès aux meilleurs événements et privilèges membres…
            </Text>
            <Text style={[styles.primeCta, { color: accent.accent }]}>Découvrir Prime →</Text>
          </Pressable>
        </>
      )}

      <Pressable
        style={[styles.btnOutline, { borderColor: shell.filterInactiveBorder }]}
        onPress={() => {
          void (async () => {
            await signOut();
            resetToAccueil(navigation);
          })();
        }}
      >
        <Text style={[styles.btnOutlineText, { color: shell.pageTitle }]}>Déconnexion</Text>
      </Pressable>

      <SupportFooter shell={shell} showPartnership={showPartnershipLink} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, paddingHorizontal: CONTENT_H_PADDING, paddingBottom: 24 },
  guestBody: { flex: 1, width: '100%', justifyContent: 'center', paddingHorizontal: 4 },
  container: { paddingHorizontal: CONTENT_H_PADDING, paddingBottom: 40 },
  meta: { marginTop: 12, fontSize: 14, marginBottom: 8 },
  detailLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  detailValue: { marginTop: 4, fontSize: 14, fontWeight: '600' },
  partnerCode: { marginTop: 6, fontSize: 20, fontWeight: '800', letterSpacing: 2 },
  partnerCodeHint: { marginTop: 6, fontSize: 11, lineHeight: 16 },
  subCard: { marginTop: 16, borderWidth: 1, borderRadius: 14, padding: 14 },
  subExpiry: { marginTop: 6, fontSize: 13, fontWeight: '700' },
  linkBtn: { marginTop: 10 },
  linkBtnText: { fontSize: 12, fontWeight: '700' },
  btnGold: {
    marginTop: 16,
    width: '100%',
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGoldText: { fontWeight: '700', fontSize: 15, textAlign: 'center' },
  signupLink: { marginTop: 12, alignItems: 'center', paddingVertical: 8 },
  signupLinkText: { fontSize: 14, fontWeight: '700' },
  primeCard: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  primeKicker: { fontSize: 11, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  primeTitle: { marginTop: 6, fontSize: 17, fontWeight: '800' },
  primeBody: { marginTop: 8, fontSize: 13, lineHeight: 20 },
  primeCta: { marginTop: 12, fontSize: 13, fontWeight: '800' },
  btnOutline: { marginTop: 12, borderWidth: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnOutlineText: { fontWeight: '600' },
  profileActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btnHalf: { flex: 1, marginTop: 0 },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 20, marginBottom: 4 },
  referralCard: { marginTop: 16, borderWidth: 1, borderRadius: 14, padding: 14 },
  referralKicker: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  referralCode: { marginTop: 6, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  referralMeta: { marginTop: 6, fontSize: 12 },
  referralLink: { marginTop: 10, fontSize: 12, fontWeight: '700' },
  adminHint: { marginTop: 10, fontSize: 11, lineHeight: 16, fontStyle: 'italic', textAlign: 'center' },
});
