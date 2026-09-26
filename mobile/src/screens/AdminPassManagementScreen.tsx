import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { FormTextInput } from '@/components/FormTextInput';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { formatDateFr } from '@/lib/date-utils';
import {
  archivePassActivationMessage,
  createPassActivationMessage,
  deletePassActivationMessage,
  listPassActivationMessages,
  PASS_ACTIVATION_TYPE_LABELS,
  PASS_ACTIVATION_VARIABLES,
  setPassActivationMessageStatus,
  updatePassActivationMessage,
  type PassActivationMessage,
  type PassActivationMessageStatus,
  type PassActivationType,
} from '@/lib/pass-activation-messages-store';
import {
  archivePassCatalogEntry,
  createPassCatalogEntry,
  deletePassCatalogEntry,
  HERITAGE_CATALOG_ID,
  listPassCatalog,
  passCatalogValidityLabel,
  setPassCatalogStatus,
  SHOP_PERIOD_VALIDITY_DAYS,
  shopPeriodLabel,
  updatePassCatalogEntry,
  type PassCatalogEntry,
  type PassCatalogStatus,
  type PassShopBillingPeriod,
} from '@/lib/pass-catalog-store';
import {
  countActivePassCatalogUsers,
  grantPassFromCatalog,
  listActiveGrantedPasses,
  revokeGrantedPass,
  type GrantedPassRow,
} from '@/lib/pass-admin-store';
import { defaultPassPricesForCountry, getPassPrices, passPriceCurrency, savePassPrices, type PassPriceMap } from '@/lib/pass-pricing-store';
import {
  DEFAULT_MAX_PENDING_PASSES,
  getPassShopSettings,
  savePassShopSettings,
} from '@/lib/pass-shop-settings-store';
import { PRIME_PLAN_OPTIONS, type PrimeBillingPeriod } from '@/lib/prime-plans';
import {
  findRegistryUserById,
  searchRegistryUsersForPassGrant,
  type RegistryUser,
} from '@/lib/user-registry-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminPassManagement'>;

const PASS_TYPES: PassActivationType[] = [
  'heritage',
  'monthly',
  'quarterly',
  'annual',
  'lifetime',
  'referral',
  'default',
];

const MESSAGE_STATUS_LABELS: Record<PassActivationMessageStatus, string> = {
  active: 'Automatisme actif',
  inactive: 'Automatisme désactivé',
  archived: 'Archivé',
};

const CATALOG_STATUS_LABELS: Record<PassCatalogStatus, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  archived: 'Archivé',
};

interface CatalogFormState {
  label: string;
  description: string;
  validityDays: string;
  priceGnf: string;
  grantableBySuperAdmin: boolean;
  purchasableInShop: boolean;
  shopBillingPeriod: PassShopBillingPeriod | null;
}

function emptyCatalogForm(): CatalogFormState {
  return {
    label: '',
    description: '',
    validityDays: '',
    priceGnf: '0',
    grantableBySuperAdmin: true,
    purchasableInShop: false,
    shopBillingPeriod: null,
  };
}

function catalogFormFromEntry(entry: PassCatalogEntry): CatalogFormState {
  return {
    label: entry.label,
    description: entry.description,
    validityDays: entry.validityDays == null ? '' : String(entry.validityDays),
    priceGnf: String(entry.priceGnf),
    grantableBySuperAdmin: entry.grantableBySuperAdmin,
    purchasableInShop: entry.purchasableInShop,
    shopBillingPeriod: entry.shopBillingPeriod,
  };
}

interface MessageFormState {
  passType: PassActivationType;
  name: string;
  titleTemplate: string;
  messageTemplate: string;
}

function emptyMessageForm(): MessageFormState {
  return {
    passType: 'heritage',
    name: '',
    titleTemplate: 'Bonjour {firstName} !',
    messageTemplate:
      'Félicitations — ton {passLabel} vient d\'être activé. Bienvenue dans Loop Prime !',
  };
}

function parsePriceInput(value: string): number | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function AdminPassManagementScreen({ navigation, route }: Props) {
  const { user } = useAuthContext();
  const { countryCode, countryLabel } = useAdminCountry();
  const { hasSubPermission } = useAdminPermissions();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('pass_management');
  const { shell } = useMemberTheme();
  const priceCurrency = passPriceCurrency(countryCode);
  const pricesOnly = route.params?.section === 'prices';
  const messagesOnly = route.params?.section === 'messages';
  const operationsOnly = !pricesOnly && !messagesOnly;
  const canCatalog = hasSubPermission('pass_management', 'pass_catalog');
  const canMessages = hasSubPermission('pass_management', 'pass_messages');
  const canPrices = hasSubPermission('pass_management', 'pass_prices');
  const showOperations = operationsOnly && canCatalog;
  const showMessagesSection = messagesOnly ? canMessages : !pricesOnly && canMessages;
  const showPricesSection = pricesOnly ? canPrices : !messagesOnly && canPrices;
  const [prices, setPrices] = useState<PassPriceMap>(() => defaultPassPricesForCountry(countryCode));
  const [priceInputs, setPriceInputs] = useState<Record<PrimeBillingPeriod, string>>({
    monthly: '',
    quarterly: '',
    annual: '',
    lifetime: '',
  });
  const [savingPrices, setSavingPrices] = useState(false);
  const [maxPendingInput, setMaxPendingInput] = useState(String(DEFAULT_MAX_PENDING_PASSES));
  const [search, setSearch] = useState('');
  const [grantNote, setGrantNote] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [bonusPasses, setBonusPasses] = useState<GrantedPassRow[]>([]);
  const [passCatalog, setPassCatalog] = useState<PassCatalogEntry[]>([]);
  const [selectedCatalogId, setSelectedCatalogId] = useState<string | null>(null);
  const [catalogModalVisible, setCatalogModalVisible] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState<PassCatalogEntry | null>(null);
  const [catalogForm, setCatalogForm] = useState<CatalogFormState>(emptyCatalogForm());
  const [searchResults, setSearchResults] = useState<RegistryUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedMember, setSelectedMember] = useState<RegistryUser | null>(null);
  const [passMessages, setPassMessages] = useState<PassActivationMessage[]>([]);
  const [messageModalVisible, setMessageModalVisible] = useState(false);
  const [editingMessage, setEditingMessage] = useState<PassActivationMessage | null>(null);
  const [messageForm, setMessageForm] = useState<MessageFormState>(emptyMessageForm());
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [loadedPrices, bonus, messages, catalog, shop] = await Promise.all([
      getPassPrices(countryCode),
      listActiveGrantedPasses(),
      listPassActivationMessages({ countryCode, includeArchived: true }),
      listPassCatalog({ countryCode, includeArchived: true }),
      getPassShopSettings(countryCode),
    ]);
    setPrices(loadedPrices);
    setPriceInputs({
      monthly: String(loadedPrices.monthly),
      quarterly: String(loadedPrices.quarterly),
      annual: String(loadedPrices.annual),
      lifetime: String(loadedPrices.lifetime),
    });
    setMaxPendingInput(String(shop.maxPendingPasses));
    setBonusPasses(bonus);
    setPassMessages(messages);
    setPassCatalog(catalog);
    setSelectedCatalogId((prev) => {
      if (prev && catalog.some((c) => c.id === prev && c.status === 'active')) {
        return prev;
      }
      return catalog.find((c) => c.status === 'active')?.id ?? null;
    });
  }, [countryCode]);

  const { run } = useFocusLoad(
    async () => {
      await load();
    },
    { ttlMs: 90_000, enabled: allowed, resetKey: countryCode },
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await run(true);
    setRefreshing(false);
  }, [run]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    const timer = setTimeout(() => {
      void searchRegistryUsersForPassGrant(q, countryCode, 8)
        .then((rows) => {
          if (!cancelled) setSearchResults(rows);
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 280);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, countryCode]);

  async function handleSavePrices() {
    const next: PassPriceMap = { ...prices };
    for (const opt of PRIME_PLAN_OPTIONS) {
      const parsed = parsePriceInput(priceInputs[opt.value]);
      if (parsed == null) {
        Alert.alert('Prix invalides', `Vérifiez le prix pour ${opt.label}.`);
        return;
      }
      next[opt.value] = parsed;
    }
    const maxPending = Number(maxPendingInput.replace(/\D/g, ''));
    if (!Number.isFinite(maxPending) || maxPending < 0 || maxPending > 20) {
      Alert.alert('Limite invalide', 'Indiquez un nombre de PASS en attente entre 0 et 20.');
      return;
    }
    setSavingPrices(true);
    try {
      await savePassPrices(countryCode, next);
      await savePassShopSettings(countryCode, { maxPendingPasses: maxPending });
      setPrices(next);
      setMaxPendingInput(String(maxPending));
      Alert.alert('Enregistré', `Prix ${countryLabel} (${priceCurrency}) et limite de file d'attente mis à jour.`);
    } finally {
      setSavingPrices(false);
    }
  }

  const grantableCatalog = useMemo(
    () => passCatalog.filter((c) => c.status === 'active'),
    [passCatalog],
  );

  const selectedCatalog = useMemo(
    () => grantableCatalog.find((c) => c.id === selectedCatalogId) ?? null,
    [grantableCatalog, selectedCatalogId],
  );

  async function handleGrantPass() {
    if (!user || !selectedUserId || !selectedCatalogId) {
      Alert.alert('Sélection requise', 'Choisissez un type de PASS et un membre.');
      return;
    }
    const catalog = selectedCatalog;
    if (!catalog) return;
    const target =
      selectedMember ??
      (selectedUserId ? await findRegistryUserById(selectedUserId) : null);
    const name = target
      ? [target.firstName, target.lastName].filter(Boolean).join(' ').trim() || target.email
      : 'ce membre';
    Alert.alert(
      `Octroi ${catalog.label}`,
      `Accorder « ${catalog.label} » à ${name} ?\n\n${passCatalogValidityLabel(catalog)} · Seul le super admin pourra le retirer.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Accorder',
          onPress: async () => {
            try {
              await grantPassFromCatalog(selectedCatalogId, selectedUserId, user.id, grantNote, countryCode);
              setGrantNote('');
              setSearch('');
              setSelectedUserId(null);
              setSelectedMember(null);
              setSearchResults([]);
              await load();
              Alert.alert('PASS accordé', `${name} bénéficie de ${catalog.label}.`);
            } catch {
              Alert.alert('Erreur', 'Octroi impossible.');
            }
          },
        },
      ],
    );
  }

  function openCatalogEditor(entry?: PassCatalogEntry) {
    if (entry) {
      setEditingCatalog(entry);
      setCatalogForm(catalogFormFromEntry(entry));
    } else {
      setEditingCatalog(null);
      setCatalogForm(emptyCatalogForm());
    }
    setCatalogModalVisible(true);
  }

  async function handleSaveCatalog() {
    if (!catalogForm.label.trim()) {
      Alert.alert('Champs requis', 'Le libellé du PASS est obligatoire.');
      return;
    }
    if (editingCatalog?.id === HERITAGE_CATALOG_ID && catalogForm.purchasableInShop) {
      Alert.alert('Vitrine', 'Le PASS Heritage ne peut pas être affiché en boutique. Choisissez une formule mensuelle, trimestrielle, annuelle ou à vie.');
      return;
    }
    if (catalogForm.purchasableInShop && !catalogForm.shopBillingPeriod) {
      Alert.alert(
        'Formule vitrine requise',
        'Pour la boutique, sélectionnez Mensuel, Trimestriel, Annuel ou À vie — pas un type libre comme Heritage.',
      );
      return;
    }

    const period = catalogForm.purchasableInShop ? catalogForm.shopBillingPeriod : null;
    const validityDays = period
      ? SHOP_PERIOD_VALIDITY_DAYS[period]
      : (() => {
          const validityRaw = catalogForm.validityDays.trim();
          const days = validityRaw ? Number(validityRaw) : null;
          return days;
        })();
    if (!period) {
      const validityRaw = catalogForm.validityDays.trim();
      if (validityRaw && (!Number.isFinite(validityDays) || (validityDays ?? 0) <= 0)) {
        Alert.alert('Durée invalide', 'Indiquez un nombre de jours ou laissez vide pour sans expiration.');
        return;
      }
    }
    const priceGnf = Number(catalogForm.priceGnf.replace(/\D/g, '')) || 0;

    if (editingCatalog) {
      await updatePassCatalogEntry(countryCode, editingCatalog.id, {
        label: catalogForm.label,
        description: catalogForm.description,
        validityDays,
        priceGnf,
        grantableBySuperAdmin: catalogForm.grantableBySuperAdmin,
        purchasableInShop: Boolean(period),
        shopBillingPeriod: period,
      });
    } else {
      await createPassCatalogEntry(countryCode, {
        label: catalogForm.label,
        description: catalogForm.description,
        validityDays,
        priceGnf,
        grantableBySuperAdmin: true,
        purchasableInShop: Boolean(period),
        shopBillingPeriod: period,
        status: 'active',
      });
    }

    if (period && priceGnf > 0) {
      const currentPrices = await getPassPrices(countryCode);
      await savePassPrices(countryCode, { ...currentPrices, [period]: priceGnf });
    }

    setCatalogModalVisible(false);
    await load();
  }

  async function toggleCatalogStatus(entry: PassCatalogEntry) {
    if (entry.status === 'active') {
      const activeCount = await countActivePassCatalogUsers(entry.id);
      if (activeCount > 0) {
        Alert.alert(
          'Désactivation impossible',
          `${activeCount} membre(s) ont encore « ${entry.label} » actif. Retirez ce PASS des comptes concernés avant de désactiver l'entrée catalogue.`,
        );
        return;
      }
    }
    const next: PassCatalogStatus = entry.status === 'active' ? 'inactive' : 'active';
    await setPassCatalogStatus(countryCode, entry.id, next);
    await load();
  }

  async function handleArchiveCatalog(entry: PassCatalogEntry) {
    if (entry.isBuiltin) return;
    Alert.alert('Archiver ce PASS ?', entry.label, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Archiver',
        onPress: async () => {
          await archivePassCatalogEntry(countryCode, entry.id);
          await load();
        },
      },
    ]);
  }

  async function handleDeleteCatalog(entry: PassCatalogEntry) {
    if (entry.isBuiltin) return;
    Alert.alert('Supprimer ce PASS ?', entry.label, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deletePassCatalogEntry(countryCode, entry.id);
          await load();
        },
      },
    ]);
  }

  function openMessageEditor(message?: PassActivationMessage) {
    if (message) {
      setEditingMessage(message);
      setMessageForm({
        passType: message.passType,
        name: message.name,
        titleTemplate: message.titleTemplate,
        messageTemplate: message.messageTemplate,
      });
    } else {
      setEditingMessage(null);
      setMessageForm(emptyMessageForm());
    }
    setMessageModalVisible(true);
  }

  async function handleSaveMessage() {
    if (!messageForm.name.trim() || !messageForm.titleTemplate.trim() || !messageForm.messageTemplate.trim()) {
      Alert.alert('Champs requis', 'Nom, titre et message obligatoires.');
      return;
    }
    if (editingMessage) {
      await updatePassActivationMessage(countryCode, editingMessage.id, {
        passType: messageForm.passType,
        name: messageForm.name,
        titleTemplate: messageForm.titleTemplate,
        messageTemplate: messageForm.messageTemplate,
      });
    } else {
      await createPassActivationMessage(countryCode, {
        passType: messageForm.passType,
        name: messageForm.name,
        titleTemplate: messageForm.titleTemplate,
        messageTemplate: messageForm.messageTemplate,
        status: 'inactive',
      });
    }
    setMessageModalVisible(false);
    await load();
  }

  async function toggleMessageStatus(message: PassActivationMessage) {
    const next: PassActivationMessageStatus = message.status === 'active' ? 'inactive' : 'active';
    await setPassActivationMessageStatus(countryCode, message.id, next);
    await load();
  }

  async function handleArchiveMessage(message: PassActivationMessage) {
    Alert.alert('Archiver ce modèle ?', message.name, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Archiver',
        onPress: async () => {
          await archivePassActivationMessage(countryCode, message.id);
          await load();
        },
      },
    ]);
  }

  async function handleDeleteMessage(message: PassActivationMessage) {
    Alert.alert('Supprimer définitivement ?', message.name, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          await deletePassActivationMessage(countryCode, message.id);
          await load();
        },
      },
    ]);
  }

  async function handleRevoke(item: GrantedPassRow) {
    Alert.alert(
      'Retirer le PASS',
      `Retirer « ${item.catalogLabel} » de ${item.userName} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Retirer',
          style: 'destructive',
          onPress: async () => {
            const ok = await revokeGrantedPass(item.userId, item.pass.id);
            if (!ok) {
              Alert.alert('Erreur', 'Retrait impossible.');
              return;
            }
            await load();
          },
        },
      ],
    );
  }

  if (!allowed && !isLoading) {
    return (
      <AdminModuleDenied
        shell={shell}
        moduleLabel={permissionLabel}
        onBack={() => navigation.goBack()}
      />
    );
  }

  if (pricesOnly && !canPrices) {
    return <AdminModuleDenied shell={shell} moduleLabel="Prix PASS" onBack={() => navigation.goBack()} />;
  }
  if (messagesOnly && !canMessages) {
    return <AdminModuleDenied shell={shell} moduleLabel="Modèles notification PASS" onBack={() => navigation.goBack()} />;
  }
  if (operationsOnly && !canCatalog) {
    return <AdminModuleDenied shell={shell} moduleLabel="Catalogue PASS" onBack={() => navigation.goBack()} />;
  }

  return (
    <KeyboardAwareFormScroll
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />
      }
    >
      <AdminPageHeader
        title={
          pricesOnly
            ? 'Prix PASS'
            : messagesOnly
              ? 'Modèles notification PASS'
              : 'Gestion PASS'
        }
        subtitle={
          pricesOnly
            ? `Tarifs standards · ${countryLabel} (${priceCurrency})`
            : messagesOnly
              ? 'Messages envoyés à l\'activation d\'un PASS'
              : 'Catalogue, octroi & suivi paiements Djomy'
        }
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <AdminCountryBar shell={shell} compact />

      {!pricesOnly && !messagesOnly ? (
        <>
          <Pressable
            style={[styles.paymentsLink, { borderColor: ADMIN_THEME.accent }]}
            onPress={() => navigation.navigate('AdminPayments')}
          >
            <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700', fontSize: 13 }}>
              Suivre les paiements Djomy / PASS →
            </Text>
          </Pressable>
          <Pressable
            style={[styles.paymentsLink, { borderColor: ADMIN_THEME.accent }]}
            onPress={() => navigation.navigate('AdminCompta')}
          >
            <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700', fontSize: 13 }}>
              Compta · virements & reste à percevoir →
            </Text>
          </Pressable>
        </>
      ) : null}

      {pricesOnly ? (
        <>
          <Text style={[styles.section, { color: shell.pageKicker }]}>
            Prix PASS standards · {countryLabel} ({priceCurrency})
          </Text>
          {PRIME_PLAN_OPTIONS.map((opt) => (
            <View key={opt.value} style={styles.priceRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.priceLabel, { color: shell.pageTitle }]}>{opt.label}</Text>
                <Text style={[styles.priceHint, { color: shell.pageKicker }]}>{opt.description}</Text>
              </View>
              <TextInput
                style={[styles.priceInput, { borderColor: shell.filterInactiveBorder, color: shell.pageTitle }]}
                value={priceInputs[opt.value]}
                onChangeText={(text) => setPriceInputs((prev) => ({ ...prev, [opt.value]: text }))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={shell.pageKicker}
              />
            </View>
          ))}
          <Text style={[styles.section, { color: shell.pageKicker }]}>File d'attente (achat)</Text>
          <Text style={[styles.intro, { color: shell.pageKicker }]}>
            Nombre max de PASS qu'un membre peut avoir en attente pendant qu'un PASS payant est déjà actif.
          </Text>
          <View style={styles.priceRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.priceLabel, { color: shell.pageTitle }]}>PASS en attente max</Text>
              <Text style={[styles.priceHint, { color: shell.pageKicker }]}>0 = aucun renouvellement anticipé</Text>
            </View>
            <TextInput
              style={[styles.priceInput, { borderColor: shell.filterInactiveBorder, color: shell.pageTitle }]}
              value={maxPendingInput}
              onChangeText={setMaxPendingInput}
              keyboardType="number-pad"
              placeholder={String(DEFAULT_MAX_PENDING_PASSES)}
              placeholderTextColor={shell.pageKicker}
            />
          </View>
          <Pressable
            style={[styles.primaryBtn, { backgroundColor: ADMIN_THEME.accent, opacity: savingPrices ? 0.6 : 1 }]}
            onPress={() => void handleSavePrices()}
            disabled={savingPrices}
          >
            <Text style={styles.primaryBtnText}>{savingPrices ? 'Enregistrement…' : 'Enregistrer prix & file'}</Text>
          </Pressable>
        </>
      ) : null}

      {messagesOnly ? (
        <>
          <Text style={[styles.section, { color: shell.pageKicker }]}>Notifications automatiques PASS</Text>
          <Text style={[styles.intro, { color: shell.pageKicker }]}>
            Message envoyé à l'activation d'un PASS. Variables : {PASS_ACTIVATION_VARIABLES}
          </Text>
          <Pressable
            style={[styles.secondaryBtn, { borderColor: ADMIN_THEME.accent }]}
            onPress={() => openMessageEditor()}
          >
            <Text style={[styles.secondaryBtnText, { color: ADMIN_THEME.accent }]}>+ Nouveau modèle</Text>
          </Pressable>

          {passMessages.map((msg) => (
            <View key={msg.id} style={adminCardStyle(shell)}>
              <View style={styles.cardTopRow}>
                <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>{msg.name}</Text>
                <Text style={[styles.statusChip, { color: msg.status === 'active' ? ADMIN_THEME.accent : shell.pageKicker }]}>
                  {MESSAGE_STATUS_LABELS[msg.status]}
                </Text>
              </View>
              <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                Type : {PASS_ACTIVATION_TYPE_LABELS[msg.passType]}
              </Text>
              <Text style={[styles.previewTitle, { color: shell.pageTitle }]}>{msg.titleTemplate}</Text>
              <Text style={[styles.previewBody, { color: shell.pageKicker }]} numberOfLines={3}>
                {msg.messageTemplate}
              </Text>
              <View style={styles.messageActions}>
                <Pressable style={styles.msgActionBtn} onPress={() => openMessageEditor(msg)}>
                  <Text style={[styles.msgActionText, { color: ADMIN_THEME.accent }]}>Modifier</Text>
                </Pressable>
                {msg.status !== 'archived' ? (
                  <Pressable style={styles.msgActionBtn} onPress={() => void toggleMessageStatus(msg)}>
                    <Text style={[styles.msgActionText, { color: shell.pageTitle }]}>
                      {msg.status === 'active' ? 'Désactiver' : 'Activer'}
                    </Text>
                  </Pressable>
                ) : null}
                {msg.status !== 'archived' ? (
                  <Pressable style={styles.msgActionBtn} onPress={() => void handleArchiveMessage(msg)}>
                    <Text style={[styles.msgActionText, { color: shell.pageKicker }]}>Archiver</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.msgActionBtn} onPress={() => void handleDeleteMessage(msg)}>
                  <Text style={[styles.msgActionText, { color: '#ef4444' }]}>Supprimer</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      ) : null}

      {operationsOnly ? (
        <>
      <Text style={[styles.section, { color: shell.pageKicker }]}>Catalogue PASS</Text>
          <Text style={[styles.intro, { color: shell.pageKicker }]}>
            Créez vos types de PASS (durée, octroi super admin). PASS Heritage reste hors boutique.
            Pour la vitrine, affectez une formule Mensuel / Trimestriel / Annuel / À vie.
            Désactivation possible uniquement si aucun compte n’a ce PASS actif.
          </Text>
      <Pressable
        style={[styles.secondaryBtn, { borderColor: ADMIN_THEME.accent }]}
        onPress={() => openCatalogEditor()}
      >
        <Text style={[styles.secondaryBtnText, { color: ADMIN_THEME.accent }]}>+ Nouveau PASS</Text>
      </Pressable>

      {passCatalog.map((entry) => (
        <View key={entry.id} style={adminCardStyle(shell)}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>{entry.label}</Text>
            <Text style={[styles.statusChip, { color: entry.status === 'active' ? ADMIN_THEME.accent : shell.pageKicker }]}>
              {CATALOG_STATUS_LABELS[entry.status]}
            </Text>
          </View>
          {entry.description ? (
            <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>{entry.description}</Text>
          ) : null}
          <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
            {passCatalogValidityLabel(entry)}
            {entry.grantableBySuperAdmin ? ' · Octroi admin' : ''}
            {entry.purchasableInShop && entry.shopBillingPeriod
              ? ` · Vitrine ${shopPeriodLabel(entry.shopBillingPeriod)}`
              : entry.purchasableInShop
                ? ` · Boutique ${entry.priceGnf.toLocaleString('fr-FR')} GNF`
                : ''}
            {entry.isBuiltin ? ' · Intégré' : ''}
          </Text>
          <View style={styles.messageActions}>
            <Pressable style={styles.msgActionBtn} onPress={() => openCatalogEditor(entry)}>
              <Text style={[styles.msgActionText, { color: ADMIN_THEME.accent }]}>Modifier</Text>
            </Pressable>
            {entry.status !== 'archived' ? (
              <Pressable style={styles.msgActionBtn} onPress={() => void toggleCatalogStatus(entry)}>
                <Text style={[styles.msgActionText, { color: shell.pageTitle }]}>
                  {entry.status === 'active' ? 'Désactiver' : 'Activer'}
                </Text>
              </Pressable>
            ) : null}
            {!entry.isBuiltin && entry.status !== 'archived' ? (
              <Pressable style={styles.msgActionBtn} onPress={() => void handleArchiveCatalog(entry)}>
                <Text style={[styles.msgActionText, { color: shell.pageKicker }]}>Archiver</Text>
              </Pressable>
            ) : null}
            {!entry.isBuiltin ? (
              <Pressable style={styles.msgActionBtn} onPress={() => void handleDeleteCatalog(entry)}>
                <Text style={[styles.msgActionText, { color: '#ef4444' }]}>Supprimer</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}

      <Text style={[styles.section, { color: shell.pageKicker, marginTop: 24 }]}>Octroi PASS</Text>
      <Text style={[styles.intro, { color: shell.pageKicker }]}>
        Choisissez un PASS du catalogue, puis le membre bénéficiaire.
      </Text>

      <KeyboardAwareFormScroll horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
        {grantableCatalog.map((entry) => {
          const selected = selectedCatalogId === entry.id;
          return (
            <Pressable
              key={entry.id}
              style={[
                styles.typeChip,
                { borderColor: shell.filterInactiveBorder },
                selected && { borderColor: ADMIN_THEME.accent, backgroundColor: ADMIN_THEME.glow },
              ]}
              onPress={() => setSelectedCatalogId(entry.id)}
            >
              <Text style={{ color: selected ? ADMIN_THEME.accent : shell.pageTitle, fontSize: 11, fontWeight: '700' }}>
                {entry.label}
              </Text>
            </Pressable>
          );
        })}
      </KeyboardAwareFormScroll>

      {grantableCatalog.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun PASS octroyable actif.</Text>
      ) : null}

      <FormTextInput
        shell={shell}
        accentColor={ADMIN_THEME.accent}
        value={search}
        onChangeText={(text) => {
          setSearch(text);
          setSelectedUserId(null);
          setSelectedMember(null);
        }}
        placeholder="Rechercher membre (nom, email, téléphone…)"
        placeholderTextColor={shell.pageKicker}
      />

      {search.trim().length > 0 && search.trim().length < 2 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>
          Saisissez au moins 2 caractères pour rechercher un membre.
        </Text>
      ) : null}

      {searchLoading ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Recherche…</Text>
      ) : null}

      {!searchLoading && search.trim().length >= 2 && searchResults.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>
          Aucun membre trouvé pour « {search.trim()} » — vérifiez l’orthographe ou le pays ({countryLabel}).
        </Text>
      ) : null}

      {searchResults.map((m) => {
        const name = [m.firstName, m.lastName].filter(Boolean).join(' ').trim() || m.email;
        const selected = selectedUserId === m.id;
        return (
          <Pressable
            key={m.id}
            style={[
              styles.memberRow,
              { borderColor: shell.filterInactiveBorder },
              selected && { borderColor: ADMIN_THEME.accent, backgroundColor: ADMIN_THEME.glow },
            ]}
            onPress={() => {
              setSelectedUserId(m.id);
              setSelectedMember(m);
            }}
          >
            <Text style={[styles.memberName, { color: shell.pageTitle }]}>{name}</Text>
            <Text style={[styles.memberMeta, { color: shell.pageKicker }]}>
              {m.phoneNumber ?? m.email}
            </Text>
          </Pressable>
        );
      })}

      <FormTextInput
        shell={shell}
        accentColor={ADMIN_THEME.accent}
        value={grantNote}
        onChangeText={setGrantNote}
        placeholder="Note d'octroi (optionnel)"
        placeholderTextColor={shell.pageKicker}
      />

      <Pressable
        style={[
          styles.primaryBtn,
          { backgroundColor: ADMIN_THEME.accent, opacity: !selectedCatalogId || !selectedUserId ? 0.5 : 1 },
        ]}
        onPress={() => void handleGrantPass()}
        disabled={!selectedCatalogId || !selectedUserId}
      >
        <Text style={styles.primaryBtnText}>
          {selectedCatalog ? `Accorder ${selectedCatalog.label}` : 'Accorder le PASS'}
        </Text>
      </Pressable>

      <Text style={[styles.section, { color: shell.pageKicker, marginTop: 24 }]}>
        Octrois admin actifs ({bonusPasses.length})
      </Text>
      <Text style={[styles.intro, { color: shell.pageKicker }]}>
        Heritage et PASS offerts par l’équipe uniquement — les achats membres sont dans Paiements Djomy.
      </Text>
      {bonusPasses.map((item) => (
        <View key={item.pass.id} style={adminCardStyle(shell)}>
          <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>{item.userName}</Text>
          <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
            {item.catalogLabel} · {item.userPhone ?? item.userId}
          </Text>
          <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
            Depuis le {formatDateFr(item.pass.startedAt)}
            {item.pass.expiresAt ? ` · Jusqu'au ${formatDateFr(item.pass.expiresAt)}` : ' · Sans expiration'}
          </Text>
          {item.pass.grantNote ? (
            <Text style={[styles.cardNote, { color: shell.pageTitle }]}>{item.pass.grantNote}</Text>
          ) : null}
          <Pressable
            style={[styles.revokeBtn, { borderColor: '#ef4444' }]}
            onPress={() => void handleRevoke(item)}
          >
            <Text style={styles.revokeText}>Retirer le PASS</Text>
          </Pressable>
        </View>
      ))}

      {bonusPasses.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun PASS accordé actif.</Text>
      ) : null}
        </>
      ) : null}

      <Modal visible={catalogModalVisible} animationType="slide" transparent onRequestClose={() => setCatalogModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAwareFormScroll contentContainerStyle={styles.modalScroll}>
            <View style={[styles.modalCard, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
              <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>
                {editingCatalog ? 'Modifier le PASS' : 'Nouveau PASS'}
              </Text>
              <FormTextInput
                shell={shell}
                accentColor={ADMIN_THEME.accent}
                value={catalogForm.label}
                onChangeText={(text) => setCatalogForm((prev) => ({ ...prev, label: text }))}
                placeholder="Libellé (ex. PASS Ambassadeur)"
                placeholderTextColor={shell.pageKicker}
              />
              <TextInput
                style={[styles.messageInput, { borderColor: shell.filterInactiveBorder, color: shell.pageTitle, minHeight: 72 }]}
                value={catalogForm.description}
                onChangeText={(text) => setCatalogForm((prev) => ({ ...prev, description: text }))}
                placeholder="Description courte"
                placeholderTextColor={shell.pageKicker}
                multiline
                textAlignVertical="top"
              />
              <FormTextInput
                shell={shell}
                accentColor={ADMIN_THEME.accent}
                value={catalogForm.validityDays}
                onChangeText={(text) => setCatalogForm((prev) => ({ ...prev, validityDays: text }))}
                placeholder="Durée en jours (vide = sans expiration)"
                placeholderTextColor={shell.pageKicker}
                keyboardType="number-pad"
                editable={!catalogForm.purchasableInShop}
              />
              <FormTextInput
                shell={shell}
                accentColor={ADMIN_THEME.accent}
                value={catalogForm.priceGnf}
                onChangeText={(text) => setCatalogForm((prev) => ({ ...prev, priceGnf: text }))}
                placeholder="Prix GNF (0 = gratuit)"
                placeholderTextColor={shell.pageKicker}
                keyboardType="number-pad"
              />
              <Pressable
                style={styles.toggleRow}
                onPress={() =>
                  setCatalogForm((prev) => ({ ...prev, grantableBySuperAdmin: !prev.grantableBySuperAdmin }))
                }
              >
                <Text style={{ color: shell.pageTitle, fontWeight: '600' }}>Octroi super admin</Text>
                <Text style={{ color: catalogForm.grantableBySuperAdmin ? ADMIN_THEME.accent : shell.pageKicker }}>
                  {catalogForm.grantableBySuperAdmin ? 'Oui' : 'Non'}
                </Text>
              </Pressable>
              {editingCatalog?.id !== HERITAGE_CATALOG_ID ? (
                <>
                  <Pressable
                    style={styles.toggleRow}
                    onPress={() =>
                      setCatalogForm((prev) => {
                        const next = !prev.purchasableInShop;
                        if (!next) {
                          return { ...prev, purchasableInShop: false, shopBillingPeriod: null };
                        }
                        const period = prev.shopBillingPeriod ?? 'monthly';
                        const days = SHOP_PERIOD_VALIDITY_DAYS[period];
                        return {
                          ...prev,
                          purchasableInShop: true,
                          shopBillingPeriod: period,
                          validityDays: days == null ? '' : String(days),
                          label: prev.label.trim() || shopPeriodLabel(period),
                        };
                      })
                    }
                  >
                    <Text style={{ color: shell.pageTitle, fontWeight: '600' }}>Afficher en vitrine</Text>
                    <Text style={{ color: catalogForm.purchasableInShop ? ADMIN_THEME.accent : shell.pageKicker }}>
                      {catalogForm.purchasableInShop ? 'Oui' : 'Non'}
                    </Text>
                  </Pressable>
                  {catalogForm.purchasableInShop ? (
                    <>
                      <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>
                        Formule boutique (obligatoire)
                      </Text>
                      <Text style={{ color: shell.pageKicker, fontSize: 11, marginBottom: 8, lineHeight: 16 }}>
                        La vitrine n’accepte que Mensuel, Trimestriel, Annuel ou À vie — pas Heritage ni un type libre.
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        {PRIME_PLAN_OPTIONS.map((opt) => {
                          const selected = catalogForm.shopBillingPeriod === opt.value;
                          return (
                            <Pressable
                              key={opt.value}
                              onPress={() => {
                                const days = SHOP_PERIOD_VALIDITY_DAYS[opt.value];
                                setCatalogForm((prev) => ({
                                  ...prev,
                                  shopBillingPeriod: opt.value,
                                  validityDays: days == null ? '' : String(days),
                                  label:
                                    !prev.label.trim() ||
                                    PRIME_PLAN_OPTIONS.some((p) => p.label === prev.label.trim())
                                      ? opt.label
                                      : prev.label,
                                }));
                              }}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: selected ? ADMIN_THEME.accent : shell.filterInactiveBorder,
                                backgroundColor: selected ? ADMIN_THEME.accent : 'transparent',
                              }}
                            >
                              <Text style={{ color: selected ? '#fff' : shell.pageTitle, fontSize: 12, fontWeight: '700' }}>
                                {opt.label.replace(/^PASS /, '')}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : null}
                </>
              ) : (
                <Text style={{ color: shell.pageKicker, fontSize: 12, marginBottom: 12 }}>
                  Heritage : octroi admin uniquement — hors vitrine boutique.
                </Text>
              )}
              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancel} onPress={() => setCatalogModalVisible(false)}>
                  <Text style={{ color: shell.pageKicker }}>Annuler</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: ADMIN_THEME.accent, flex: 1 }]}
                  onPress={() => void handleSaveCatalog()}
                >
                  <Text style={styles.primaryBtnText}>Enregistrer</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAwareFormScroll>
        </View>
      </Modal>

      <Modal visible={messageModalVisible} animationType="slide" transparent onRequestClose={() => setMessageModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <KeyboardAwareFormScroll contentContainerStyle={styles.modalScroll}>
            <View style={[styles.modalCard, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
              <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>
                {editingMessage ? 'Modifier le modèle' : 'Nouveau modèle'}
              </Text>
              <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>Type de PASS</Text>
              <KeyboardAwareFormScroll horizontal showsHorizontalScrollIndicator={false} style={styles.typeRow}>
                {PASS_TYPES.map((type) => {
                  const selected = messageForm.passType === type;
                  return (
                    <Pressable
                      key={type}
                      style={[
                        styles.typeChip,
                        { borderColor: shell.filterInactiveBorder },
                        selected && { borderColor: ADMIN_THEME.accent, backgroundColor: ADMIN_THEME.glow },
                      ]}
                      onPress={() => setMessageForm((prev) => ({ ...prev, passType: type }))}
                    >
                      <Text style={{ color: selected ? ADMIN_THEME.accent : shell.pageTitle, fontSize: 11, fontWeight: '700' }}>
                        {PASS_ACTIVATION_TYPE_LABELS[type]}
                      </Text>
                    </Pressable>
                  );
                })}
              </KeyboardAwareFormScroll>
              <FormTextInput
                shell={shell}
                accentColor={ADMIN_THEME.accent}
                value={messageForm.name}
                onChangeText={(text) => setMessageForm((prev) => ({ ...prev, name: text }))}
                placeholder="Nom interne du modèle"
                placeholderTextColor={shell.pageKicker}
              />
              <FormTextInput
                shell={shell}
                accentColor={ADMIN_THEME.accent}
                value={messageForm.titleTemplate}
                onChangeText={(text) => setMessageForm((prev) => ({ ...prev, titleTemplate: text }))}
                placeholder="Titre (ex. Bonjour {firstName} !)"
                placeholderTextColor={shell.pageKicker}
              />
              <TextInput
                style={[styles.messageInput, { borderColor: shell.filterInactiveBorder, color: shell.pageTitle }]}
                value={messageForm.messageTemplate}
                onChangeText={(text) => setMessageForm((prev) => ({ ...prev, messageTemplate: text }))}
                placeholder="Message valorisant avec {passLabel} et {passType}"
                placeholderTextColor={shell.pageKicker}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />
              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancel} onPress={() => setMessageModalVisible(false)}>
                  <Text style={{ color: shell.pageKicker }}>Annuler</Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, { backgroundColor: ADMIN_THEME.accent, flex: 1 }]}
                  onPress={() => void handleSaveMessage()}
                >
                  <Text style={styles.primaryBtnText}>Enregistrer</Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAwareFormScroll>
        </View>
      </Modal>
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  section: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  paymentsLink: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  intro: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  priceLabel: { fontSize: 14, fontWeight: '700' },
  priceHint: { fontSize: 11, marginTop: 2 },
  priceInput: {
    width: 120,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'right',
  },
  primaryBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  memberRow: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  memberName: { fontSize: 14, fontWeight: '700' },
  memberMeta: { fontSize: 11, marginTop: 2 },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  cardMeta: { fontSize: 11, marginTop: 4 },
  cardNote: { fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  revokeBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  revokeText: { color: '#ef4444', fontWeight: '800', fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 12, fontSize: 13 },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  secondaryBtnText: { fontWeight: '800', fontSize: 13 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  statusChip: { fontSize: 9, fontWeight: '800', textTransform: 'uppercase' },
  previewTitle: { fontSize: 13, fontWeight: '700', marginTop: 8 },
  previewBody: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  messageActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  msgActionBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  msgActionText: { fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalScroll: { padding: 16, paddingBottom: 32 },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 4 },
  fieldLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  typeRow: { marginBottom: 4 },
  typeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  messageInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 120,
    fontSize: 14,
    lineHeight: 20,
  },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  modalCancel: { paddingVertical: 14, paddingHorizontal: 8 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
});
