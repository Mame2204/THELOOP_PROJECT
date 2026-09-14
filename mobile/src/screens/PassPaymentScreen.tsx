import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormSelectChip } from '@/components/FormSelectChip';
import { FormTextInput } from '@/components/FormTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { useAuthContext } from '@/context/AuthContext';
import { useViewingCountry } from '@/context/ViewingCountryContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { DEFAULT_COUNTRY_CODE } from '@/lib/countries';
import { formatDateFr } from '@/lib/date-utils';
import { getProfileAccent } from '@/lib/profile-accent';
import {
  PASS_PAYMENT_PROVIDER_LABEL,
  processPassPayment,
} from '@/lib/pass-payment-service';
import {
  isDjomyPaymentConfigured,
  waitForDjomyFulfillment,
  forceSandboxPaymentComplete,
  fetchPaymentServerSandboxMode,
  fetchDjomyPaymentStatus,
  isTransientPaymentNetworkError,
  sandboxPayerHint,
  warmPaymentApi,
  DJOMY_SANDBOX_TEST,
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
  PASS_PAYMENT_LABELS,
  PASS_PAYMENT_METHODS_ORDER,
  synchronizeSubscriptionHistory,
  type PassPaymentMethod,
} from '@/lib/subscription-history';
import { isPassPurchaseUiEnabled } from '@/lib/pass-purchase-ui';
import { useAppGates } from '@/context/AppGatesContext';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PassPayment'>;

const PAYMENT_METHODS = PASS_PAYMENT_METHODS_ORDER;

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
  const [paymentMethod, setPaymentMethod] = useState<PassPaymentMethod>('all');
  const [payerPhone, setPayerPhone] = useState(
    user?.phoneNumber?.replace(/\D/g, '').slice(-9) ||
      (isDjomyPaymentConfigured() ? DJOMY_SANDBOX_TEST.soutra.account : ''),
  );
  const [chargedAmountGnf, setChargedAmountGnf] = useState<number | null>(null);
  const [passPrices, setPassPrices] = useState<PassPriceMap | null>(null);
  const [activeExpiry, setActiveExpiry] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [maxPending, setMaxPending] = useState(3);
  const [queueStartAt, setQueueStartAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'review' | 'processing' | 'done'>('review');
  const [lastSandboxIntentId, setLastSandboxIntentId] = useState<string | null>(null);
  /** null = health pas encore reçu — on assume sandbox pour l’autofill. */
  const [serverSandboxMode, setServerSandboxMode] = useState<boolean | null>(null);

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
  const showSandboxTools =
    isDjomyPaymentConfigured() &&
    (serverSandboxMode === true || (chargedAmountGnf != null && chargedAmountGnf < 50_000));
  /** Autofill comptes/téléphone test tant que le serveur n’a pas dit « pas sandbox ». */
  const prefillSandboxPayer = isDjomyPaymentConfigured() && serverSandboxMode !== false;

  async function finishAfterFulfillment() {
    if (!user?.id) return;
    const outcome = await syncPassAfterDjomyPayment(user.id, user.firstName);
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
  }

  function offerSandboxForce(reason: string): Promise<boolean> {
    return new Promise((resolve) => {
      Alert.alert(
        'Portail Djomy non validé',
        `${reason}\n\nLe sandbox Djomy refuse souvent OTP / vrai numéro. Forcer le succès côté serveur pour tester l'activation PASS ?`,
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
      if (showSandboxTools || serverSandboxMode === true) {
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

    if (
      (showSandboxTools || serverSandboxMode === true) &&
      paymentMethod === 'orange_money'
    ) {
      Alert.alert(
        'Orange Money indisponible en sandbox',
        'Djomy confirme que tous les paiements OM échouent en sandbox. Choisissez PayCard, Soutra Money ou Carte avec leurs comptes de test.',
      );
      return;
    }

    setLoading(true);
    setStep('processing');
    try {
      const payment = await processPassPayment({
        userId: user.id,
        period,
        amountGnf,
        method: paymentMethod,
        payerPhone,
      });

      if (payment.status === 'failed') {
        setStep('review');
        Alert.alert('Paiement refusé', payment.message ?? 'Réessayez ou changez de mode de paiement.');
        return;
      }

      if (payment.status === 'pending' && payment.paymentUrl && payment.paymentIntentId) {
        if (payment.chargedAmountGnf != null) {
          setChargedAmountGnf(payment.chargedAmountGnf);
        }
        if (payment.sandboxMode) {
          setServerSandboxMode(true);
        }
        setLastSandboxIntentId(payment.paymentIntentId);

        // Polling dès l’ouverture du portail (webhook / reconcile pendant Soutra).
        const waitPromise = waitForDjomyFulfillment(payment.paymentIntentId);
        // Évite « Unhandled promise rejection » si le poll échoue pendant que le navigateur est ouvert.
        void waitPromise.catch(() => undefined);

        await WebBrowser.openBrowserAsync(payment.paymentUrl, {
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });

        try {
          await waitPromise;
        } catch (waitErr) {
          if (await tryLateFulfillmentCheck(payment.paymentIntentId)) {
            await finishAfterFulfillment();
            return;
          }

          const reason = waitErr instanceof Error ? waitErr.message : 'Confirmation impossible.';
          const canForce =
            Boolean(payment.sandboxMode) ||
            (payment.chargedAmountGnf != null && payment.chargedAmountGnf < 50_000);

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

      const outcome = await purchasePrimePass(period, paymentMethod, priceCountry);
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
        method: paymentMethod,
        payerPhone,
      });

      if (payment.status === 'failed' || !payment.paymentIntentId) {
        setStep('review');
        Alert.alert('Paiement refusé', payment.message ?? 'Impossible de créer la commande.');
        return;
      }

      if (payment.chargedAmountGnf != null) setChargedAmountGnf(payment.chargedAmountGnf);
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
  const showSandboxBanner =
    !djomyReady || showSandboxTools || Boolean(chargedAmountGnf && chargedAmountGnf < 50_000);
  const sandboxHint = sandboxPayerHint(paymentMethod);

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
            {djomyReady ? 'Environnement de test Djomy' : 'Mode simulation'}
          </Text>
          <Text style={[styles.sandboxBody, { color: djomyReady ? '#047857' : '#78350f' }]}>
            {djomyReady
              ? `Montants sandbox ≤ 10 000 GNF (Soutra/PayCard). Orange Money échoue toujours en sandbox — utilisez PayCard, Soutra ou Carte.`
              : 'Paiement simulé localement. Configurez EXPO_PUBLIC_PAYMENT_API_URL + le serveur Djomy pour un vrai parcours.'}
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

      <Text style={[styles.sectionLabel, { color: shell.pageKicker }]}>Mode de paiement</Text>
      <View style={styles.payRow}>
        {PAYMENT_METHODS.map((method) => (
          <FormSelectChip
            key={method}
            label={PASS_PAYMENT_LABELS[method]}
            selected={paymentMethod === method}
            onPress={() => {
              setPaymentMethod(method);
              if (prefillSandboxPayer) {
                const hint = sandboxPayerHint(method);
                setPayerPhone(hint.local);
              }
            }}
            shell={shell}
          />
        ))}
      </View>
      <Text style={[styles.providerHint, { color: shell.pageKicker }]}>
        {paymentMethod === 'all'
          ? 'Vous serez redirigé vers le portail Djomy pour choisir parmi tous les modes activés sur votre compte marchand.'
          : `Préférence : ${PASS_PAYMENT_LABELS[paymentMethod]} — finalisation sur le portail sécurisé ${PASS_PAYMENT_PROVIDER_LABEL}.`}
      </Text>

      <Text style={[styles.sectionLabel, { color: shell.pageKicker }]}>Identifiant payeur</Text>
      <FormTextInput
        shell={shell}
        accentColor={accent.accent}
        value={payerPhone}
        onChangeText={setPayerPhone}
        placeholder={`Ex. ${sandboxHint.display}`}
        placeholderTextColor={shell.pageKicker}
        keyboardType="number-pad"
      />
      <Text style={[styles.phoneHint, { color: paymentMethod === 'orange_money' ? '#b45309' : shell.pageKicker }]}>
        {prefillSandboxPayer || showSandboxBanner || showSandboxTools
          ? sandboxHint.tip
          : 'Mettez le même identifiant payeur sur Djomy (préremplissage du portail).'}
      </Text>

      {step === 'processing' ? (
        <Text style={[styles.processing, { color: shell.pageKicker }]}>
          {isDjomyPaymentConfigured()
            ? 'Ouverture du portail Djomy…'
            : 'Traitement du paiement test…'}
        </Text>
      ) : null}

      <Pressable
        style={[styles.btn, { backgroundColor: accent.accent, opacity: loading ? 0.65 : 1 }]}
        onPress={() => void handlePay()}
        disabled={loading || amountGnf == null}
      >
        <Text style={styles.btnText}>
          {loading
            ? 'Paiement en cours…'
            : isDjomyPaymentConfigured()
              ? `Continuer sur Djomy — ${displayPrice}`
              : `Payer ${displayPrice}`}
        </Text>
      </Pressable>

      {showSandboxTools || showSandboxBanner ? (
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
