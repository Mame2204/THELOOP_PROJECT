import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthContext } from '@/context/AuthContext';
import { useViewingCountry } from '@/context/ViewingCountryContext';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { formatDateFr } from '@/lib/date-utils';
import { getProfileAccent } from '@/lib/profile-accent';
import { getMaxPendingPasses } from '@/lib/pass-shop-settings-store';
import {
  PRIME_PLAN_OPTIONS,
  computeSubscriptionExpiry,
  type PrimeBillingPeriod,
} from '@/lib/prime-plans';
import { listPassCatalog } from '@/lib/pass-catalog-store';
import { getPassPrices, passPriceCurrency, type PassPriceMap } from '@/lib/pass-pricing-store';
import { getActiveSubscription, getPendingSubscriptions, isFreePass, isHeritagePass, synchronizeSubscriptionHistory } from '@/lib/subscription-history';
import { isPassPurchaseUiEnabled } from '@/lib/pass-purchase-ui';
import { useAppGates } from '@/context/AppGatesContext';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Prime'>;

export function PrimeScreen({ navigation }: Props) {
  const { role, user } = useAuthContext();
  const { gates } = useAppGates();
  const passPurchaseEnabled = isPassPurchaseUiEnabled(gates);
  const { viewingCountryCode } = useViewingCountry();
  const priceCountry = (viewingCountryCode ?? user?.countryCode ?? DEFAULT_COUNTRY_CODE) as typeof viewingCountryCode;
  const priceCurrency = passPriceCurrency(priceCountry);
  const { shell, grade, theme } = useMemberTheme();
  const accent = getProfileAccent(role, shell, grade, theme);
  const [selected, setSelected] = useState<PrimeBillingPeriod>('annual');
  const [canPurchase, setCanPurchase] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [pendingInfo, setPendingInfo] = useState('');
  const [shopPeriods, setShopPeriods] = useState<PrimeBillingPeriod[]>(
    PRIME_PLAN_OPTIONS.map((p) => p.value),
  );
  const [prices, setPrices] = useState<PassPriceMap | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: shell.pageBg },
      headerTintColor: shell.tabIndicator,
      headerTitleStyle: { color: shell.pageTitle },
    });
  }, [navigation, shell]);

  useEffect(() => {
    if (passPurchaseEnabled) return;
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('Tabs');
  }, [navigation, passPurchaseEnabled]);

  const loadEligibility = useCallback(async () => {
    const [shopCatalog, loadedPrices] = await Promise.all([
      listPassCatalog({ countryCode: priceCountry, status: 'active', shopOnly: true }),
      getPassPrices(priceCountry),
    ]);
    setPrices(loadedPrices);
    const periods = shopCatalog
      .map((e) => e.shopBillingPeriod)
      .filter((p): p is PrimeBillingPeriod => p != null);
    const unique = [...new Set(periods)];
    const visible = unique.length ? unique : PRIME_PLAN_OPTIONS.map((p) => p.value);
    setShopPeriods(visible);
    setSelected((prev) => (visible.includes(prev) ? prev : visible[0] ?? 'annual'));

    if (!user?.id || user.id === 'anonymous') {
      setCanPurchase(false);
      setBlockReason('Connectez-vous pour acheter un PASS.');
      return;
    }
    if (role !== 'USER_FREE' && role !== 'USER_PRIME') {
      setCanPurchase(false);
      setBlockReason('Réservé aux membres.');
      return;
    }
    const [history, maxPending] = await Promise.all([
      synchronizeSubscriptionHistory(user.id),
      getMaxPendingPasses(priceCountry),
    ]);
    const active = getActiveSubscription(history, 'prime');
    const pending = getPendingSubscriptions(history, 'prime');
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
  }, [user?.id, role, priceCountry]);

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
    <ScrollView
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
    >
      <Text style={[styles.kicker, { color: accent.accent }]}>Prime</Text>
      <Text style={[styles.title, { color: shell.pageTitle }]}>Choisissez votre PASS</Text>
      <Text style={[styles.body, { color: shell.pageKicker }]} numberOfLines={2} ellipsizeMode="tail">
        Invitations prioritaires, thème exclusif et expérience premium…
      </Text>

      {pendingInfo ? (
        <Text style={[styles.queueHint, { color: accent.accent, borderColor: accent.accent }]}>
          {pendingInfo}
        </Text>
      ) : null}

      <View style={[styles.divider, { backgroundColor: shell.filterInactiveBorder }]} />

      <View style={styles.plans}>
        {PRIME_PLAN_OPTIONS.filter((plan) => shopPeriods.includes(plan.value)).map((plan) => {
          const isActive = selected === plan.value;
          const expiry = computeSubscriptionExpiry(plan.value);
          const priceLabel = prices
            ? `${prices[plan.value].toLocaleString('fr-FR')} ${priceCurrency}`
            : null;
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
                <Text style={[styles.planLabel, { color: shell.pageTitle }]}>{plan.label}</Text>
                {isActive ? <Text style={[styles.planCheck, { color: accent.accent }]}>✓</Text> : null}
              </View>
              <Text style={[styles.planDesc, { color: shell.pageKicker }]}>{plan.description}</Text>
              {priceLabel ? (
                <Text style={[styles.planExpiry, { color: isActive ? accent.accent : shell.pageKicker }]}>
                  {priceLabel}
                </Text>
              ) : null}
              <Text style={[styles.planExpiry, { color: isActive ? accent.accent : shell.pageKicker }]}>
                {expiry ? `Échéance : ${formatDateFr(expiry)}` : 'Sans échéance'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {canPurchase ? (
        <Pressable
          style={[styles.btn, { backgroundColor: accent.accent }]}
          onPress={handleContinue}
        >
          <Text style={styles.btnText}>Continuer vers le paiement</Text>
        </Pressable>
      ) : (
        <Text style={[styles.note, { color: shell.pageKicker }]}>
          {blockReason ?? 'Achat indisponible.'}
        </Text>
      )}

      <Pressable style={[styles.btnOutline, { borderColor: shell.filterInactiveBorder }]} onPress={() => navigation.goBack()}>
        <Text style={[styles.btnOutlineText, { color: shell.pageKicker }]}>Retour</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 8, fontSize: 24, fontWeight: '800' },
  body: { marginTop: 8, fontSize: 14, lineHeight: 20 },
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
  plans: { gap: 10 },
  planCard: { borderWidth: 1.5, borderRadius: 14, padding: 14 },
  planCardActive: { borderWidth: 2 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planLabel: { fontSize: 16, fontWeight: '800' },
  planCheck: { fontSize: 18, fontWeight: '900' },
  planDesc: { marginTop: 6, fontSize: 12, lineHeight: 17 },
  planExpiry: { marginTop: 8, fontSize: 12, fontWeight: '700' },
  btn: { marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { fontWeight: '800', color: '#000', fontSize: 15 },
  note: { marginTop: 24, textAlign: 'center', fontSize: 13, lineHeight: 18 },
  btnOutline: { marginTop: 12, borderWidth: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnOutlineText: { fontWeight: '600', fontSize: 14 },
});
