import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormTextInput } from '@/components/FormTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { useAuthContext } from '@/context/AuthContext';
import { useViewingCountry } from '@/context/ViewingCountryContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { formatDateFr } from '@/lib/date-utils';
import { getProfileAccent } from '@/lib/profile-accent';
import { processPassPayment } from '@/lib/pass-payment-service';
import {
  isDjomyPaymentConfigured,
  waitForDjomyFulfillment,
  forceSandboxPaymentComplete,
  fetchPaymentServerSandboxMode,
  fetchDjomyPaymentStatus,
  isTransientPaymentNetworkError,
  sandboxPayerHint,
  warmPaymentApi,
} from '@/lib/djomy-payment-api';
import { syncPassAfterDjomyPayment } from '@/lib/pass-purchase-store';
import * as WebBrowser from 'expo-web-browser';
import { getPassPrices, passPriceCurrency, type PassPriceMap } from '@/lib/pass-pricing-store';
import { getMaxPendingPasses } from '@/lib/pass-shop-settings-store';
import {
  computeSubscriptionExpiry,
  formatPassPrice,
  primePlanLabel,
} from '@/lib/prime-plans';
import {
  getActiveSubscription,
  getPendingSubscriptions,
  synchronizeSubscriptionHistory,
} from '@/lib/subscription-history';
import { isPassPurchaseUiEnabled } from '@/lib/pass-purchase-ui';
import { subscribePaymentReturn } from '@/lib/payment-return-events';
import {
  clearPendingPaymentIntent,
  savePendingPaymentIntent,
} from '@/lib/payment-pending-store';
import { useAppGates } from '@/context/AppGatesContext';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PassPayment'>;

export function PassPaymentScreen({ navigation, route }: Props) {
  const { period } = route.params;
  const { purchasePrimePass, role, user, refreshUserSession } = useAuthContext();
  const { gates } = useAppGates();
  const passPurchaseEnabled = isPassPurchaseUiEnabled(gates);
  const { viewingCountryCode } = useViewingCountry();
  const priceCountry = (viewingCountryCode ?? user?.countryCode ?? DEFAULT_COUNTRY_CODE) as typeof viewingCountryCode;
  const priceCurrency = passPriceCurrency(priceCountry);
  const { shell, grade, theme } = useMemberTheme();
  const accent = getProfileAccent(role, shell, grade, theme);
  const [payerPhone, setPayerPhone] = useState(
    user?.phoneNumber?.replace(/\D/g, '').slice(-9) || '',
  );
  const [passPrices, setPassPrices] = useState<PassPriceMap | null>(null);
  const [activeExpiry, setActiveExpiry] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [maxPending, setMaxPending] = useState(3);
  const [queueStartAt, setQueueStartAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'review' | 'processing' | 'done'>('review');
  const [lastSandboxIntentId, setLastSandboxIntentId] = useState<string | null>(null);
  /** null = health pas encore reçu — pas d’UX sandbox tant qu’on ne sait pas. */
  const [serverSandboxMode, setServerSandboxMode] = useState<boolean | null>(null);
  const pendingIntentIdRef = useRef<string | null>(null);
  const finishAfterFulfillmentRef = useRef<(() => Promise<void>) | null>(null);
  const fulfillmentHandledRef = useRef(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Paiement PASS',
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

  useEffect(() => {
    if (!isDjomyPaymentConfigured()) {
      setServerSandboxMode(false);
      return;
    }
    void fetchPaymentServerSandboxMode().then((sandbox) => {
      setServerSandboxMode(sandbox);
    });
  }, []);

  const loadSummary = useCallback(async () => {
    if (!user?.id) return;
    const [prices, history, limit] = await Promise.all([
      getPassPrices(priceCountry),
      synchronizeSubscriptionHistory(user.id),
      getMaxPendingPasses(priceCountry),
    ]);
    setPassPrices(prices);
    setMaxPending(limit);
    const active = getActiveSubscription(history, 'prime');
    const pending = getPendingSubscriptions(history, 'prime');
    setActiveExpiry(active?.expiresAt ?? null);
    setPendingCount(pending.length);
    const last = pending[pending.length - 1];
    setQueueStartAt(last?.scheduledStartAt ?? active?.expiresAt ?? null);
  }, [user?.id, priceCountry]);

  useLayoutEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const planName = primePlanLabel(period);
  const amountGnf = passPrices?.[period] ?? null;
  const displayPrice = amountGnf != null ? formatPassPrice(period, passPrices ?? undefined, priceCurrency) : '…';
  const previewExpiry = computeSubscriptionExpiry(period);
  const hasActivePass = Boolean(activeExpiry) || role === 'USER_PRIME';
  const willQueue = hasActivePass && Boolean(activeExpiry);
  const isSandboxMode = serverSandboxMode === true;
  const showSandboxTools = isDjomyPaymentConfigured() && isSandboxMode;
  useEffect(() => {
    if (!showSandboxTools) return;
    const hint = sandboxPayerHint('all');
    if (hint.local) setPayerPhone(hint.local);
  }, [showSandboxTools]);

  const finishAfterFulfillment = useCallback(async () => {
    if (!user?.id || fulfillmentHandledRef.current) return;
    fulfillmentHandledRef.current = true;
    pendingIntentIdRef.current = null;
    const outcome = await syncPassAfterDjomyPayment(user.id, user.firstName);
    await clearPendingPaymentIntent();
    if (outcome.activated) {
      await refreshUserSession();
    }
    setStep('done');

    if (outcome.activated) {
      const validity = outcome.activated.expiresAt
        ? `Valable jusqu'au ${formatDateFr(outcome.activated.expiresAt)}.`
        : 'Sans expiration.';
      Alert.alert(
        'Paiement confirmé',
        `Votre ${planName} est actif.\n${validity}`,
        [{ text: 'Voir Mon PASS', onPress: () => navigation.replace('Abonnement') }],
      );
    } else if (outcome.queued) {
      const start = outcome.queued.scheduledStartAt;
      Alert.alert(
        'Paiement confirmé',
        start
          ? `Votre ${planName} est en file d'attente.\nIl démarrera le ${formatDateFr(start)}.`
          : `Votre ${planName} est en file d'attente.\nIl démarrera à la fin de votre PASS actuel.`,
        [{ text: 'Voir Mon PASS', onPress: () => navigation.replace('Abonnement') }],
      );
    } else {
      Alert.alert(
        'Paiement reçu',
        'Votre PASS sera visible dans Mon PASS dans quelques instants.',
        [{ text: 'OK', onPress: () => navigation.replace('Abonnement') }],
      );
    }
  }, [navigation, period, planName, refreshUserSession, user?.firstName, user?.id]);

  useEffect(() => {
    finishAfterFulfillmentRef.current = finishAfterFulfillment;
  }, [finishAfterFulfillment]);

  useEffect(() => {
    if (step !== 'processing') return;

    const dismissBrowser = () => {
      void WebBrowser.dismissBrowser().catch(() => undefined);
    };

    const onReturn = () => {
      dismissBrowser();
      void (async () => {
        const intentId = pendingIntentIdRef.current;
        if (!intentId || !user?.id) return;
        if (await tryLateFulfillmentCheck(intentId)) {
          await finishAfterFulfillmentRef.current?.();
        }
      })();
    };

    const paymentSub = subscribePaymentReturn(onReturn);
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onReturn();
    });

    return () => {
      paymentSub();
      appStateSub.remove();
    };
  }, [step, user?.id]);

  function offerSandboxForce(reason: string): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(
        'Paiement test non validé',
        `${reason}\n\nEn environnement test, le portail refuse parfois OTP ou numéro réel. Forcer le succès côté serveur pour tester l'activation PASS ?`,
        [
          { text: 'Annuler', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Forcer succès sandbox', onPress: () => resolve(true) },
        ],
      );
    });
  }

  /** Après un plantage réseau : ne pas confondre avec un refus OTP sandbox. */
  function offerAfterNetworkGap(reason: string): Promise<'retry' | 'pass' | 'force' | 'cancel'> {
    return new Promise((resolve) => {
      const buttons: {
        text: string;
        style?: 'cancel' | 'destructive' | 'default';
        onPress: () => void;
      }[] = [
        { text: 'Annuler', style: 'cancel', onPress: () => resolve('cancel') },
        { text: 'Voir Mon PASS', onPress: () => resolve('pass') },
        { text: 'Réessayer', onPress: () => resolve('retry') },
      ];
      if (isSandboxMode) {
        buttons.push({ text: 'Forcer sandbox', onPress: () => resolve('force') });
      }
      Alert.alert(
        'Confirmation en attente',
        `${reason}\n\nCe n’est pas forcément un refus Soutra : le serveur de paiement a pu être injoignable un moment (réveil Render). Si le débit est passé, Mon PASS se mettra à jour.`,
        buttons,
      );
    });
  }

  async function tryLateFulfillmentCheck(paymentIntentId: string): Promise<boolean> {
    try {
      await warmPaymentApi();
      const late = await fetchDjomyPaymentStatus(paymentIntentId);
      return late.fulfillmentStatus === 'fulfilled';
    } catch {
      return false;
    }
  }

  function alertPurchaseError(msg: string) {
    if (msg === 'lifetime_active') {
      Alert.alert('PASS à vie actif', 'Vous avez déjà un PASS à vie.');
    } else if (msg === 'bonus_active') {
      Alert.alert('PASS Heritage actif', 'Vous bénéficiez déjà d\'un PASS Heritage sans expiration.');
    } else if (msg === 'pending_limit') {
      Alert.alert(
        'File d\'attente pleine',
        `Vous avez déjà ${maxPending} PASS en attente. Attendez qu'un PASS se déclenche pour en acheter un autre.`,
      );
    } else if (msg === 'lifetime_queued') {
      Alert.alert('File d\'attente', 'Un PASS à vie est déjà en file — impossible d\'en ajouter d\'autres.');
    } else if (/Network request failed|connexion.*interrompue/i.test(msg)) {
      Alert.alert(
        'Connexion interrompue',
        'Le serveur de paiement n’a pas répondu à temps. Si Soutra a confirmé le débit, ouvrez Mon PASS dans 1–2 minutes.',
        [
          { text: 'Voir Mon PASS', onPress: () => navigation.replace('Abonnement') },
          { text: 'OK', style: 'cancel' },
        ],
      );
    } else if (/Mon PASS/i.test(msg)) {
      void (async () => {
        try {
          if (user?.id) {
            await syncPassAfterDjomyPayment(user.id, user.firstName);
            await refreshUserSession();
          }
        } catch {
          /* ignore */
        }
      })();
      Alert.alert('Paiement en cours', msg, [
        { text: 'Voir Mon PASS', onPress: () => navigation.replace('Abonnement') },
        { text: 'OK', style: 'cancel' },
      ]);
    } else {
      Alert.alert('Erreur', msg);
    }
  }

  async function handlePay() {
    if (!passPurchaseEnabled) return;
    if (!user?.id || amountGnf == null) return;

    setLoading(true);
    setStep('processing');
    fulfillmentHandledRef.current = false;
    try {
      const payment = await processPassPayment({
        userId: user.id,
        period,
        amountGnf,
        method: 'all',
        payerPhone,
      });

      if (payment.status === 'failed') {
        setStep('review');
        Alert.alert('Paiement refusé', payment.message ?? 'Réessayez ou changez de mode de paiement.');
        return;
      }

      if (payment.status === 'pending' && payment.paymentUrl && payment.paymentIntentId) {
        if (payment.sandboxMode) {
          setServerSandboxMode(true);
        }
        setLastSandboxIntentId(payment.paymentIntentId);
        pendingIntentIdRef.current = payment.paymentIntentId;
        await savePendingPaymentIntent(payment.paymentIntentId, user.id);

        const paymentReturnUrl =
          Linking.createURL('payment/complete') || 'theloop://payment/complete';

        // Polling dès l’ouverture du portail (webhook / reconcile pendant paiement).
        const waitPromise = waitForDjomyFulfillment(payment.paymentIntentId);
        void waitPromise
          .then(() => WebBrowser.dismissBrowser())
          .catch(() => undefined);

        const browserResult = await WebBrowser.openAuthSessionAsync(
          payment.paymentUrl,
          paymentReturnUrl,
        );
        void WebBrowser.dismissBrowser().catch(() => undefined);

        if (browserResult.type === 'cancel') {
          if (!(await tryLateFulfillmentCheck(payment.paymentIntentId))) {
            await clearPendingPaymentIntent();
            pendingIntentIdRef.current = null;
          }
        }

        try {
          await waitPromise;
        } catch (waitErr) {
          if (await tryLateFulfillmentCheck(payment.paymentIntentId)) {
            await finishAfterFulfillment();
            return;
          }

          const reason = waitErr instanceof Error ? waitErr.message : 'Confirmation impossible.';
          const canForce = isSandboxMode || Boolean(payment.sandboxMode);

          if (isTransientPaymentNetworkError(waitErr) || /connexion.*interrompue/i.test(reason)) {
            const choice = await offerAfterNetworkGap(reason);
            if (choice === 'retry') {
              await waitForDjomyFulfillment(payment.paymentIntentId, { timeoutMs: 120_000 });
            } else if (choice === 'pass') {
              try {
                await syncPassAfterDjomyPayment(user.id, user.firstName);
                await refreshUserSession();
              } catch {
                /* ignore */
              }
              navigation.replace('Abonnement');
              return;
            } else if (choice === 'force' && canForce) {
              await forceSandboxPaymentComplete(payment.paymentIntentId);
            } else {
              // Annuler : tenter quand même une sync (paiement peut déjà être fulfilled).
              try {
                await syncPassAfterDjomyPayment(user.id, user.firstName);
                await refreshUserSession();
              } catch {
                /* ignore */
              }
              throw waitErr;
            }
          } else if (canForce && (await offerSandboxForce(reason))) {
            await forceSandboxPaymentComplete(payment.paymentIntentId);
          } else {
            throw waitErr;
          }
        }

        await finishAfterFulfillment();
        return;
      }

      if (payment.status !== 'success') {
        setStep('review');
        Alert.alert('Paiement', payment.message ?? 'Statut inconnu.');
        return;
      }

      const outcome = await purchasePrimePass(period, 'all', priceCountry);
      setStep('done');

      if (outcome.activated) {
        const validity = outcome.activated.expiresAt
          ? `Valable jusqu'au ${formatDateFr(outcome.activated.expiresAt)}.`
          : 'Sans expiration.';
        Alert.alert(
          'Paiement confirmé',
          `Votre ${planName} est actif.\n${validity}`,
          [{ text: 'Voir Mon PASS', onPress: () => navigation.replace('Abonnement') }],
        );
      } else if (outcome.queued) {
        const start = outcome.queued.scheduledStartAt;
        Alert.alert(
          'Paiement confirmé',
          start
            ? `Votre ${planName} est en file d'attente.\nIl démarrera le ${formatDateFr(start)}.`
            : `Votre ${planName} est en file d'attente.\nIl démarrera à la fin de votre PASS actuel.`,
          [{ text: 'Voir Mon PASS', onPress: () => navigation.replace('Abonnement') }],
        );
      }
    } catch (err) {
      setStep('review');
      alertPurchaseError(err instanceof Error ? err.message : 'Paiement impossible');
    } finally {
      setLoading(false);
    }
  }

  /** Crée l’intent puis force le fulfillment sans ouvrir le portail (tests internes). */
  async function handleSandboxForcePay() {
    if (!passPurchaseEnabled || !user?.id || amountGnf == null) return;

    setLoading(true);
    setStep('processing');
    try {
      const payment = await processPassPayment({
        userId: user.id,
        period,
        amountGnf,
        method: 'all',
        payerPhone,
      });

      if (payment.status === 'failed' || !payment.paymentIntentId) {
        setStep('review');
        Alert.alert('Paiement refusé', payment.message ?? 'Impossible de créer la commande.');
        return;
      }

      setServerSandboxMode(true);
      setLastSandboxIntentId(payment.paymentIntentId);

      await forceSandboxPaymentComplete(payment.paymentIntentId);
      await finishAfterFulfillment();
    } catch (err) {
      setStep('review');
      alertPurchaseError(err instanceof Error ? err.message : 'Simulation impossible');
    } finally {
      setLoading(false);
    }
  }

  async function handleRetrySandboxForce() {
    if (!lastSandboxIntentId || !user?.id) return;
    setLoading(true);
    setStep('processing');
    try {
      await forceSandboxPaymentComplete(lastSandboxIntentId);
      await finishAfterFulfillment();
    } catch (err) {
      setStep('review');
      alertPurchaseError(err instanceof Error ? err.message : 'Simulation impossible');
    } finally {
      setLoading(false);
    }
  }

  if (!passPurchaseEnabled) {
    return (
      <View style={{ flex: 1, backgroundColor: shell.pageBg, justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: shell.pageKicker, textAlign: 'center', fontSize: 14 }}>
          L'achat de PASS n'est pas disponible pour le moment.
        </Text>
      </View>
    );
  }

  const djomyReady = isDjomyPaymentConfigured();
  const showSandboxBanner = !djomyReady || isSandboxMode;
  const sandboxHint = sandboxPayerHint('all');
  const payerPlaceholder = isSandboxMode ? `Ex. ${sandboxHint.display}` : 'Ex. 620 00 00 01';
  const payerHint = isSandboxMode
    ? `${sandboxHint.tip} Orange Money est indisponible en test — choisissez un autre moyen sur l’écran suivant.`
    : 'Utilisez le même numéro ou compte que sur l’écran de paiement (Mobile Money, PayCard, carte…).';

  return (
    <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      {showSandboxBanner ? (
        <View
          style={[
            styles.sandboxBanner,
            {
              backgroundColor: djomyReady ? '#ecfdf5' : '#fef3c7',
              borderColor: djomyReady ? '#10b981' : '#f59e0b',
            },
          ]}
        >
          <Text style={[styles.sandboxTitle, { color: djomyReady ? '#065f46' : '#92400e' }]}>
            {djomyReady ? 'Paiement en environnement test' : 'Mode simulation'}
          </Text>
          <Text style={[styles.sandboxBody, { color: djomyReady ? '#047857' : '#78350f' }]}>
            {djomyReady
              ? `Montants test ≤ 10 000 GNF. Orange Money est indisponible en test — utilisez PayCard, Soutra ou carte.`
              : 'Paiement simulé localement. Configurez le serveur de paiement pour un parcours réel.'}
          </Text>
        </View>
      ) : null}

      <Text style={[styles.kicker, { color: accent.accent }]}>Récapitulatif</Text>
      <View style={[styles.summaryCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
        <Text style={[styles.planName, { color: shell.pageTitle }]}>{planName}</Text>
        <Text style={[styles.planPrice, { color: accent.accent }]}>{displayPrice}</Text>
        <Text style={[styles.planMeta, { color: shell.pageKicker }]}>
          {willQueue
            ? `Mise en file d'attente (${pendingCount}/${maxPending}) — démarrage prévu : ${
                queueStartAt ? formatDateFr(queueStartAt) : 'fin du PASS actuel'
              }`
            : previewExpiry
              ? `Échéance estimée : ${formatDateFr(previewExpiry)}`
              : 'PASS sans échéance'}
        </Text>
      </View>

      <Text style={[styles.providerHint, { color: shell.pageKicker }]}>
        Vous choisirez Orange Money, Soutra, PayCard ou carte sur le portail de paiement sécurisé.
      </Text>

      <Text style={[styles.sectionLabel, { color: shell.pageKicker }]}>Numéro de paiement</Text>
      <FormTextInput
        shell={shell}
        accentColor={accent.accent}
        value={payerPhone}
        onChangeText={setPayerPhone}
        placeholder={payerPlaceholder}
        placeholderTextColor={shell.pageKicker}
        keyboardType="number-pad"
      />
      <Text style={[styles.phoneHint, { color: shell.pageKicker }]}>
        {payerHint}
      </Text>

      {step === 'processing' ? (
        <Text style={[styles.processing, { color: shell.pageKicker }]}>
          {isDjomyPaymentConfigured()
            ? 'Ouverture du portail de paiement…'
            : 'Traitement du paiement test…'}
        </Text>
      ) : null}

      <Pressable
        style={[styles.btn, { backgroundColor: accent.accent, opacity: loading ? 0.65 : 1 }]}
        onPress={() => void handlePay()}
        disabled={loading || amountGnf == null}
      >
        <Text style={styles.btnText}>
          {loading ? 'Paiement en cours…' : 'Ouvrir le paiement'}
        </Text>
      </Pressable>

      {showSandboxTools ? (
        <Pressable
          style={[styles.btnOutline, { borderColor: '#92400e', opacity: loading ? 0.65 : 1 }]}
          onPress={() => void handleSandboxForcePay()}
          disabled={loading || amountGnf == null || !djomyReady}
        >
          <Text style={[styles.btnOutlineText, { color: '#92400e' }]}>
            Simuler succès sandbox (sans portail)
          </Text>
        </Pressable>
      ) : null}

      {lastSandboxIntentId && showSandboxTools ? (
        <Pressable
          style={[styles.btnOutline, { borderColor: shell.filterInactiveBorder, opacity: loading ? 0.65 : 1 }]}
          onPress={() => void handleRetrySandboxForce()}
          disabled={loading}
        >
          <Text style={[styles.btnOutlineText, { color: shell.pageKicker }]}>
            Relancer force sur la dernière commande
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        style={[styles.btnOutline, { borderColor: shell.filterInactiveBorder }]}
        onPress={() => navigation.goBack()}
        disabled={loading}
      >
        <Text style={[styles.btnOutlineText, { color: shell.pageKicker }]}>Retour</Text>
      </Pressable>
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  sandboxBanner: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
  sandboxTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, color: '#92400e' },
  sandboxBody: { marginTop: 4, fontSize: 12, lineHeight: 18, color: '#78350f' },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  summaryCard: { marginTop: 10, borderWidth: 1, borderRadius: 14, padding: 16 },
  planName: { fontSize: 18, fontWeight: '800' },
  planPrice: { marginTop: 8, fontSize: 22, fontWeight: '900' },
  planMeta: { marginTop: 8, fontSize: 13 },
  sectionLabel: { marginTop: 20, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  payRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  providerHint: { marginTop: 8, fontSize: 11, fontStyle: 'italic', lineHeight: 16 },
  phoneHint: { marginTop: 6, fontSize: 11, lineHeight: 16 },
  processing: { marginTop: 16, textAlign: 'center', fontSize: 13, fontWeight: '600' },
  btn: { marginTop: 24, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { fontWeight: '800', color: '#000', fontSize: 15 },
  btnOutline: { marginTop: 12, borderWidth: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnOutlineText: { fontWeight: '600', fontSize: 14 },
});
