import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LegalPreviewModal } from '@/components/LegalPreviewModal';
import { PrimePlanCardSkeleton } from '@/components/PrimePlanCardSkeleton';
import { useAuthContext } from '@/context/AuthContext';
import { useViewingCountry } from '@/context/ViewingCountryContext';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { DEFAULT_COUNTRY_CODE, getCountryLabel } from '@/lib/countries';
import { formatDateFr } from '@/lib/date-utils';
import { formatLegalBodyForDisplay } from '@/lib/legal-display';
import { getLegalContent } from '@/lib/legal-content-store';
import { getMaxPendingPasses } from '@/lib/pass-shop-settings-store';
import {
  PASS_CHECKOUT_PAYMENT_METHODS,
  PASS_INCLUDED_BENEFITS,
  PASS_SHOP_FAQ,
} from '@/lib/pass-shop-copy';
import { getPassPrices, passPriceCurrency, type PassPriceMap } from '@/lib/pass-pricing-store';
import { listPassCatalog } from '@/lib/pass-catalog-store';
import {
  isRecommendedPlan,
  planSavingsVsMonthly,
  RECOMMENDED_BILLING_PERIOD,
} from '@/lib/prime-plan-pricing-utils';
import {
  PRIME_PLAN_OPTIONS,
  computeSubscriptionExpiry,
  formatPassPrice,
  type PrimeBillingPeriod,
} from '@/lib/prime-plans';
import { getReferralStats, type ReferralStats } from '@/lib/referral-store';
import {
  getActiveSubscription,
  getPendingSubscriptions,
  isFreePass,
  isHeritagePass,
  synchronizeSubscriptionHistory,
  type SubscriptionRecord,
} from '@/lib/subscription-history';
import { isPassPurchaseUiEnabled } from '@/lib/pass-purchase-ui';
import { useAppGates } from '@/context/AppGatesContext';
import { getProfileAccent } from '@/lib/profile-accent';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Prime'>;

type PassStatusKind = 'none' | 'active' | 'pending' | 'heritage' | 'lifetime';

function resolvePassStatus(active: SubscriptionRecord | null, pendingCount: number): PassStatusKind {
  if (active) {
    if (isHeritagePass(active) || isFreePass(active)) return 'heritage';
    if (!active.expiresAt) return 'lifetime';
    return 'active';
  }
  if (pendingCount > 0) return 'pending';
  return 'none';
}

export function PrimeScreen({ navigation }: Props) {
  const { role, user } = useAuthContext();
  const { gates } = useAppGates();
  const passPurchaseEnabled = isPassPurchaseUiEnabled(gates);
  const { viewingCountryCode, isExploringOtherCountry } = useViewingCountry();
  const priceCountry = (viewingCountryCode ?? user?.countryCode ?? DEFAULT_COUNTRY_CODE) as typeof viewingCountryCode;
  const accountCountry = (user?.countryCode ?? DEFAULT_COUNTRY_CODE) as typeof viewingCountryCode;
  const priceCurrency = passPriceCurrency(priceCountry);
  const { shell, grade, theme } = useMemberTheme();
  const accent = getProfileAccent(role, shell, grade, theme);
  const [selected, setSelected] = useState<PrimeBillingPeriod>(RECOMMENDED_BILLING_PERIOD);
  const [canPurchase, setCanPurchase] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [pendingInfo, setPendingInfo] = useState('');
  const [passStatus, setPassStatus] = useState<PassStatusKind>('none');
  const [activePassRecord, setActivePassRecord] = useState<SubscriptionRecord | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [shopPeriods, setShopPeriods] = useState<PrimeBillingPeriod[]>(
    PRIME_PLAN_OPTIONS.map((p) => p.value),
  );
  const [prices, setPrices] = useState<PassPriceMap | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalTitle, setLegalTitle] = useState('');
  const [legalBody, setLegalBody] = useState('');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  useEffect(() => {
    if (passPurchaseEnabled) return;
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation, passPurchaseEnabled]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: shell.pageBg },
      headerTintColor: shell.tabIndicator,
      headerTitleStyle: { color: shell.pageTitle },
    });
  }, [navigation, shell]);

  const loadEligibility = useCallback(async () => {
    setLoadingShop(true);
    try {
      const [shopCatalog, loadedPrices, stats] = await Promise.all([
        listPassCatalog({ countryCode: priceCountry, status: 'active', shopOnly: true }),
        getPassPrices(priceCountry),
        user?.id && user.id !== 'anonymous'
          ? getReferralStats(user.id, user)
          : Promise.resolve(null),
      ]);
      setPrices(loadedPrices);
      setReferralStats(stats);
      const periods = shopCatalog
        .map((e) => e.shopBillingPeriod)
        .filter((p): p is PrimeBillingPeriod => p != null);
      const unique = [...new Set(periods)];
      const visible = unique.length ? unique : PRIME_PLAN_OPTIONS.map((p) => p.value);
      setShopPeriods(visible);
      const preferred = visible.includes(RECOMMENDED_BILLING_PERIOD)
        ? RECOMMENDED_BILLING_PERIOD
        : visible[0] ?? RECOMMENDED_BILLING_PERIOD;
      setSelected((prev) => (visible.includes(prev) ? prev : preferred));

      if (!user?.id || user.id === 'anonymous') {
        setCanPurchase(false);
        setBlockReason('Connectez-vous pour acheter un PASS.');
        setPassStatus('none');
        setActivePassRecord(null);
        setPendingCount(0);
        setPendingInfo('');
        return;
      }
      if (role !== 'USER_FREE' && role !== 'USER_PRIME') {
        setCanPurchase(false);
        setBlockReason('Réservé aux membres.');
        setPassStatus('none');
        return;
      }
      const [history, maxPending] = await Promise.all([
        synchronizeSubscriptionHistory(user.id),
        getMaxPendingPasses(priceCountry),
      ]);
      const active = getActiveSubscription(history, 'prime') ?? null;
      const pending = getPendingSubscriptions(history, 'prime');
      setActivePassRecord(active);
      setPendingCount(pending.length);
      setPassStatus(resolvePassStatus(active ?? null, pending.length));

      if (active && (isHeritagePass(active) || isFreePass(active) || !active.expiresAt)) {
        setCanPurchase(false);
        setBlockReason(
          isHeritagePass(active) || isFreePass(active)
            ? 'Votre PASS gratuit / Heritage est actif — aucun achat nécessaire.'
            : 'Vous avez déjà un PASS à vie.',
        );
        setPendingInfo('');
        return;
      }
      if (active && pending.length >= maxPending) {
        setCanPurchase(false);
        setBlockReason(
          `File d'attente pleine (${pending.length}/${maxPending}). Un PASS doit se déclencher avant un nouvel achat.`,
        );
        setPendingInfo('');
        return;
      }
      setCanPurchase(true);
      setBlockReason(null);
      if (active?.expiresAt) {
        setPendingInfo(
          `PASS actif jusqu'au ${formatDateFr(active.expiresAt)}. Un nouvel achat sera mis en file (${pending.length}/${maxPending}).`,
        );
      } else {
        setPendingInfo('');
      }
    } finally {
      setLoadingShop(false);
    }
  }, [user, role, priceCountry]);

  useFocusLoad(
    async () => {
      if (!passPurchaseEnabled) return;
      await loadEligibility();
    },
    {
      ttlMs: 90_000,
      enabled: passPurchaseEnabled,
      resetKey: `${user?.id ?? ''}:${priceCountry}`,
    },
  );

  function handleContinue() {
    if (!passPurchaseEnabled) return;
    if (!canPurchase) {
      Alert.alert('Achat indisponible', blockReason ?? 'Impossible d\'acheter ce PASS.');
      return;
    }
    navigation.navigate('PassPayment', { period: selected });
  }

  async function openPassConditions() {
    const content = await getLegalContent('conditions_pass_prime');
    setLegalTitle(content.title);
    setLegalBody(formatLegalBodyForDisplay(content.body));
    setLegalOpen(true);
  }

  const selectedPlan = PRIME_PLAN_OPTIONS.find((p) => p.value === selected);
  const selectedPrice = prices?.[selected];
  const selectedExpiry = computeSubscriptionExpiry(selected);
  const selectedPriceLabel =
    prices && selectedPrice != null
      ? formatPassPrice(selected, prices, priceCurrency)
      : null;

  function renderStatusBanner() {
    if (passStatus === 'heritage' && activePassRecord) {
      return (
        <View style={[styles.statusBanner, { borderColor: accent.accent, backgroundColor: accent.accentSoft }]}>
          <Text style={[styles.statusTitle, { color: accent.accent }]}>PASS Heritage actif</Text>
          <Text style={[styles.statusBody, { color: shell.pageKicker }]}>
            {activePassRecord.grantNote ?? 'Accès Prime sans achat supplémentaire.'}
          </Text>
        </View>
      );
    }
    if (passStatus === 'lifetime') {
      return (
        <View style={[styles.statusBanner, { borderColor: accent.accent, backgroundColor: accent.accentSoft }]}>
          <Text style={[styles.statusTitle, { color: accent.accent }]}>PASS à vie actif</Text>
          <Text style={[styles.statusBody, { color: shell.pageKicker }]}>Aucun renouvellement nécessaire.</Text>
        </View>
      );
    }
    if (passStatus === 'active' && activePassRecord?.expiresAt) {
      return (
        <View style={[styles.statusBanner, { borderColor: accent.accent, backgroundColor: accent.accentSoft }]}>
          <Text style={[styles.statusTitle, { color: accent.accent }]}>Vous êtes Loop Prime</Text>
          <Text style={[styles.statusBody, { color: shell.pageKicker }]}>
            PASS actif jusqu'au {formatDateFr(activePassRecord.expiresAt)}.
          </Text>
          <Pressable onPress={() => navigation.navigate('Abonnement')} hitSlop={8}>
            <Text style={[styles.statusLink, { color: accent.accent }]}>Voir Mon PASS →</Text>
          </Pressable>
        </View>
      );
    }
    if (passStatus === 'pending') {
      return (
        <View style={[styles.statusBanner, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
          <Text style={[styles.statusTitle, { color: shell.pageTitle }]}>
            {pendingCount} PASS en file d'attente
          </Text>
          <Text style={[styles.statusBody, { color: shell.pageKicker }]}>
            Consultez Mon PASS pour le détail des activations à venir.
          </Text>
          <Pressable onPress={() => navigation.navigate('Abonnement')} hitSlop={8}>
            <Text style={[styles.statusLink, { color: accent.accent }]}>Mon PASS →</Text>
          </Pressable>
        </View>
      );
    }
    return null;
  }

  if (!passPurchaseEnabled) {
    return (
      <View style={[styles.container, { flex: 1, backgroundColor: shell.pageBg, justifyContent: 'center' }]}>
        <Text style={[styles.note, { color: shell.pageKicker }]}>
          L'achat de PASS n'est pas disponible pour le moment.
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: shell.pageBg }}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={[styles.kicker, { color: accent.accent }]}>Prime</Text>
          <Text style={[styles.title, { color: shell.pageTitle }]}>Choisissez votre PASS</Text>
          <Text style={[styles.body, { color: shell.pageKicker }]}>
            Invitations prioritaires, thème exclusif et expérience premium…
          </Text>

          {isExploringOtherCountry && accountCountry !== priceCountry ? (
            <View style={[styles.countryHint, { borderColor: shell.tabIndicator, backgroundColor: shell.filterInactiveBg }]}>
              <Text style={[styles.countryHintText, { color: shell.pageKicker }]}>
                Tarifs affichés pour {getCountryLabel(priceCountry)} ({priceCurrency}).
                Pays du compte : {getCountryLabel(accountCountry)}.
              </Text>
            </View>
          ) : (
            <Text style={[styles.currencyHint, { color: shell.pageKicker }]}>
              Tarifs en {priceCurrency} · {getCountryLabel(priceCountry)}
            </Text>
          )}

          {renderStatusBanner()}

          {pendingInfo && passStatus === 'active' ? (
            <Text style={[styles.queueHint, { color: accent.accent, borderColor: accent.accent }]}>
              {pendingInfo}
            </Text>
          ) : null}

          <View style={[styles.divider, { backgroundColor: shell.filterInactiveBorder }]} />

          <Text style={[styles.sectionLabel, { color: shell.pageKicker }]}>Inclus dans le PASS</Text>
          <View style={[styles.benefitsCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
            {PASS_INCLUDED_BENEFITS.map((benefit) => (
              <View key={benefit} style={styles.benefitRow}>
                <Text style={[styles.benefitBullet, { color: accent.accent }]}>✓</Text>
                <Text style={[styles.benefitText, { color: shell.pageTitle }]}>{benefit}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: shell.pageKicker }]}>Forfaits</Text>
          <View style={styles.plans}>
            {loadingShop
              ? [0, 1, 2].map((i) => (
                  <PrimePlanCardSkeleton
                    key={i}
                    borderColor={shell.filterInactiveBorder}
                    backgroundColor={shell.filterInactiveBg}
                    pulseColor={shell.pageKicker}
                  />
                ))
              : PRIME_PLAN_OPTIONS.filter((plan) => shopPeriods.includes(plan.value)).map((plan) => {
                  const isActive = selected === plan.value;
                  const expiry = computeSubscriptionExpiry(plan.value);
                  const priceLabel = prices
                    ? formatPassPrice(plan.value, prices, priceCurrency)
                    : null;
                  const savings = prices ? planSavingsVsMonthly(plan.value, prices) : null;
                  const recommended = isRecommendedPlan(plan.value);
                  return (
                    <Pressable
                      key={plan.value}
                      onPress={() => setSelected(plan.value)}
                      style={[
                        styles.planCard,
                        {
                          backgroundColor: shell.filterInactiveBg,
                          borderColor: isActive ? accent.accent : shell.filterInactiveBorder,
                        },
                        isActive && styles.planCardActive,
                      ]}
                    >
                      <View style={styles.planHeader}>
                        <View style={styles.planTitleWrap}>
                          <Text style={[styles.planLabel, { color: shell.pageTitle }]}>{plan.label}</Text>
                          {recommended ? (
                            <View style={[styles.badge, { backgroundColor: accent.accent }]}>
                              <Text style={styles.badgeText}>Meilleur rapport</Text>
                            </View>
                          ) : null}
                        </View>
                        {isActive ? <Text style={[styles.planCheck, { color: accent.accent }]}>✓</Text> : null}
                      </View>
                      <Text style={[styles.planDesc, { color: shell.pageKicker }]}>{plan.description}</Text>
                      {priceLabel ? (
                        <Text style={[styles.planPrice, { color: isActive ? accent.accent : shell.pageTitle }]}>
                          {priceLabel}
                        </Text>
                      ) : null}
                      {savings ? (
                        <Text style={[styles.planSavings, { color: accent.accent }]}>
                          −{savings.percent} % vs {savings.equivalentMonthly.toLocaleString('fr-FR')} {priceCurrency}/mois en mensuel
                        </Text>
                      ) : null}
                      <Text style={[styles.planExpiry, { color: shell.pageKicker }]}>
                        {expiry ? `Échéance si activé aujourd'hui : ${formatDateFr(expiry)}` : 'Sans échéance'}
                      </Text>
                    </Pressable>
                  );
                })}
          </View>

          <Text style={[styles.sectionLabel, { color: shell.pageKicker }]}>Moyens de paiement</Text>
          <View style={[styles.paymentRow, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
            {PASS_CHECKOUT_PAYMENT_METHODS.map((method) => (
              <View key={method} style={[styles.paymentChip, { borderColor: shell.filterInactiveBorder }]}>
                <Text style={[styles.paymentChipText, { color: shell.pageTitle }]}>{method}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.noteInline, { color: shell.pageKicker }]}>
            Paiement sécurisé sur le portail — choisissez votre moyen à l'étape suivante.
          </Text>

          {referralStats ? (
            <>
              <Text style={[styles.sectionLabel, { color: shell.pageKicker }]}>Parrainage</Text>
              <Pressable
                style={[styles.referralCard, { borderColor: accent.accentBorder, backgroundColor: accent.accentSoft }]}
                onPress={() => navigation.navigate('Referral')}
              >
                <Text style={[styles.referralCode, { color: accent.accent }]}>{referralStats.referralCode}</Text>
                <Text style={[styles.referralMeta, { color: shell.pageKicker }]}>
                  {referralStats.totalReferrals} filleul{referralStats.totalReferrals > 1 ? 's' : ''} ·{' '}
                  {referralStats.monthsGrantedThisYear} mois Prime gagnés cette année
                </Text>
                <Text style={[styles.referralLink, { color: accent.accent }]}>Voir le parrainage →</Text>
              </Pressable>
            </>
          ) : null}

          <Text style={[styles.sectionLabel, { color: shell.pageKicker }]}>Questions fréquentes</Text>
          <View style={[styles.faqCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
            {PASS_SHOP_FAQ.map((item, index) => {
              const open = expandedFaq === index;
              return (
                <Pressable
                  key={item.q}
                  style={[
                    styles.faqItem,
                    index > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: shell.filterInactiveBorder } : null,
                  ]}
                  onPress={() => setExpandedFaq(open ? null : index)}
                >
                  <Text style={[styles.faqQuestion, { color: shell.pageTitle }]}>{item.q}</Text>
                  {open ? (
                    <Text style={[styles.faqAnswer, { color: shell.pageKicker }]}>{item.a}</Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={() => void openPassConditions()} style={styles.legalLink}>
            <Text style={[styles.legalLinkText, { color: shell.tabIndicator }]}>
              Conditions du PASS Prime
            </Text>
          </Pressable>

          {!canPurchase ? (
            <Text style={[styles.note, { color: shell.pageKicker }]}>
              {blockReason ?? 'Achat indisponible.'}
            </Text>
          ) : null}

          <View style={{ height: 120 }} />
        </ScrollView>

        {canPurchase && selectedPlan ? (
          <View style={[styles.stickyFooter, { borderTopColor: shell.filterInactiveBorder, backgroundColor: shell.pageBg }]}>
            <View style={styles.recapRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.recapLabel, { color: shell.pageKicker }]}>{selectedPlan.label}</Text>
                <Text style={[styles.recapPrice, { color: shell.pageTitle }]}>
                  {selectedPriceLabel ?? '…'}
                </Text>
                {selectedExpiry ? (
                  <Text style={[styles.recapMeta, { color: shell.pageKicker }]}>
                    Échéance : {formatDateFr(selectedExpiry)}
                  </Text>
                ) : (
                  <Text style={[styles.recapMeta, { color: shell.pageKicker }]}>Sans échéance</Text>
                )}
              </View>
              <Pressable
                style={[styles.btn, { backgroundColor: accent.accent }]}
                onPress={handleContinue}
              >
                <Text style={styles.btnText}>Continuer</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <LegalPreviewModal
        visible={legalOpen}
        title={legalTitle}
        body={legalBody}
        onClose={() => setLegalOpen(false)}
        accentBg={shell.filterActiveBg}
        accentText={shell.filterActiveText}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 24 },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 8, fontSize: 24, fontWeight: '800' },
  body: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  currencyHint: { marginTop: 10, fontSize: 11, fontWeight: '600' },
  countryHint: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  countryHintText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  statusBanner: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  statusTitle: { fontSize: 13, fontWeight: '800' },
  statusBody: { fontSize: 12, lineHeight: 18 },
  statusLink: { marginTop: 6, fontSize: 12, fontWeight: '800' },
  queueHint: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 20 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  benefitsCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16, gap: 8 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  benefitBullet: { fontSize: 12, fontWeight: '900', marginTop: 1 },
  benefitText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: '600' },
  plans: { gap: 10, marginBottom: 16 },
  planCard: { borderWidth: 1.5, borderRadius: 14, padding: 14 },
  planCardActive: { borderWidth: 2 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  planTitleWrap: { flex: 1, gap: 6, paddingRight: 8 },
  planLabel: { fontSize: 16, fontWeight: '800' },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 9, fontWeight: '800', color: '#000', textTransform: 'uppercase', letterSpacing: 0.5 },
  planCheck: { fontSize: 18, fontWeight: '900' },
  planDesc: { marginTop: 6, fontSize: 12, lineHeight: 17 },
  planPrice: { marginTop: 8, fontSize: 15, fontWeight: '800' },
  planSavings: { marginTop: 4, fontSize: 11, fontWeight: '700', lineHeight: 16 },
  planExpiry: { marginTop: 6, fontSize: 11, fontWeight: '600' },
  paymentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  paymentChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  paymentChipText: { fontSize: 11, fontWeight: '700' },
  noteInline: { marginTop: 8, marginBottom: 16, fontSize: 11, lineHeight: 16 },
  referralCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 16 },
  referralCode: { fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  referralMeta: { marginTop: 6, fontSize: 12, lineHeight: 18 },
  referralLink: { marginTop: 8, fontSize: 12, fontWeight: '800' },
  faqCard: { borderWidth: 1, borderRadius: 14, marginBottom: 12, overflow: 'hidden' },
  faqItem: { padding: 14 },
  faqQuestion: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  faqAnswer: { marginTop: 8, fontSize: 12, lineHeight: 18 },
  legalLink: { alignItems: 'center', paddingVertical: 8, marginBottom: 8 },
  legalLinkText: { fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  note: { marginTop: 12, textAlign: 'center', fontSize: 13, lineHeight: 18 },
  stickyFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 20,
  },
  recapRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recapLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  recapPrice: { marginTop: 2, fontSize: 17, fontWeight: '800' },
  recapMeta: { marginTop: 2, fontSize: 11 },
  btn: { paddingVertical: 14, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', minWidth: 130 },
  btnText: { fontWeight: '800', color: '#000', fontSize: 14 },
});
