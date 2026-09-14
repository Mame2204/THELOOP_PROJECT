import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { AdminActionIcon } from '@/components/admin/AdminActionIcon';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { AdminBenefitTypesPanel } from '@/components/admin/AdminBenefitTypesPanel';
import { TogglePill } from '@/components/admin/TogglePill';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { formatValidityEndFromDays } from '@/lib/date-utils';
import {
  deleteBenefitCatalogCascade,
  formatBenefitDeleteWarning,
  summarizeCatalogGrants,
} from '@/lib/benefit-catalog-delete';
import {
  BENEFIT_KIND_LABELS,
  createBenefitCatalogItemMulti,
  listStandaloneTheLoopBenefits,
  updateBenefitCatalogItem,
  type BenefitCatalogItem,
  type BenefitKind,
} from '@/lib/benefit-catalog-store';
import { EXTERNAL_PARTNER_ID } from '@/lib/partner-directory-store';
import { listBenefitTypes, type BenefitTypeDefinition } from '@/lib/benefit-types-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminStandaloneBenefit'>;
type MenuTab = 'benefit' | 'types';

export function AdminStandaloneBenefitScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('standalone_benefit');
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();

  const [menuTab, setMenuTab] = useState<MenuTab>('benefit');
  const [items, setItems] = useState<BenefitCatalogItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingItem, setEditingItem] = useState<BenefitCatalogItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editValidity, setEditValidity] = useState('30');
  const [editValidityStartsOnActivation, setEditValidityStartsOnActivation] = useState(true);
  const [editTypeId, setEditTypeId] = useState<string | null>(null);
  const [editKind, setEditKind] = useState<BenefitKind>('unlimited');
  const [editQuantity, setEditQuantity] = useState('1');
  const [editMaxUses, setEditMaxUses] = useState('1');
  const [editActive, setEditActive] = useState(true);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [validity, setValidity] = useState('30');
  const [validityStartsOnActivation, setValidityStartsOnActivation] = useState(true);
  const [types, setTypes] = useState<BenefitTypeDefinition[]>([]);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [kind, setKind] = useState<BenefitKind>('unlimited');
  const [quantity, setQuantity] = useState('1');
  const [maxUses, setMaxUses] = useState('1');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [list, typeList] = await Promise.all([
      listStandaloneTheLoopBenefits(false),
      listBenefitTypes(true),
    ]);
    setItems(list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    const activeTypes = typeList.filter((t) => t.isActive);
    setTypes(activeTypes);
    if (!typeId && activeTypes[0]) {
      setTypeId(activeTypes[0].id);
      setKind(activeTypes[0].mechanic);
      if (activeTypes[0].defaultQuantity != null) setQuantity(String(activeTypes[0].defaultQuantity));
      if (activeTypes[0].defaultMaxUses != null) setMaxUses(String(activeTypes[0].defaultMaxUses));
    }
  }, [typeId]);

  const { run } = useFocusLoad(
    async () => {
      await load();
    },
    {
      ttlMs: 90_000,
      enabled: role === 'ADMIN' && allowed && menuTab === 'benefit',
      resetKey: `${menuTab}:${countryCode}`,
    },
  );

  if (role !== 'ADMIN' || (!allowed && !isLoading)) {
    return (
      <AdminModuleDenied
        shell={shell}
        moduleLabel={permissionLabel}
        onBack={() => navigation.goBack()}
      />
    );
  }

  if (role !== 'ADMIN' || !allowed) {
    return <View style={{ flex: 1, backgroundColor: shell.pageBg }} />;
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder, color: shell.pageTitle },
  ];

  function applyType(type: BenefitTypeDefinition) {
    setTypeId(type.id);
    setKind(type.mechanic);
    if (type.defaultQuantity != null) setQuantity(String(type.defaultQuantity));
    if (type.defaultMaxUses != null) setMaxUses(String(type.defaultMaxUses));
  }

  async function onRefresh() {
    setRefreshing(true);
    await run(true);
    setRefreshing(false);
  }

  async function handleToggleActive(item: BenefitCatalogItem, next: boolean) {
    const result = await updateBenefitCatalogItem(item.id, { isActive: next });
    if (!result) {
      Alert.alert('Erreur', 'Mise à jour impossible.');
      return;
    }
    const { item: updated, syncOk, syncError } = result;
    setItems((prev) => prev.map((row) => (row.id === item.id ? updated : row)));
    if (editingItem?.id === item.id) {
      setEditingItem(updated);
      setEditActive(updated.isActive);
    }
    if (!syncOk) {
      Alert.alert(
        'Sync serveur',
        syncError
          ? `Enregistré sur cet appareil, mais la sync Supabase a échoué : ${syncError}`
          : 'Enregistré localement. Vérifiez la connexion et les droits admin.',
      );
    }
  }

  function openEdit(item: BenefitCatalogItem) {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditDescription(item.description);
    setEditValidity(String(item.defaultValidityDays));
    setEditValidityStartsOnActivation(item.validityStartsOnActivation !== false);
    setEditKind(item.benefitKind);
    setEditQuantity(item.quantityPerGrant != null ? String(item.quantityPerGrant) : '1');
    setEditMaxUses(item.maxUsesPerGrant != null ? String(item.maxUsesPerGrant) : '1');
    setEditActive(item.isActive);
    const matched = types.find((t) => t.mechanic === item.benefitKind);
    setEditTypeId(matched?.id ?? null);
  }

  function applyEditType(type: BenefitTypeDefinition) {
    setEditTypeId(type.id);
    setEditKind(type.mechanic);
    if (type.defaultQuantity != null) setEditQuantity(String(type.defaultQuantity));
    if (type.defaultMaxUses != null) setEditMaxUses(String(type.defaultMaxUses));
  }

  async function handleSaveEdit() {
    if (!editingItem || !editTitle.trim() || !editDescription.trim()) {
      Alert.alert('Champs requis', 'Titre et description obligatoires.');
      return;
    }
    setSaving(true);
    try {
      const result = await updateBenefitCatalogItem(editingItem.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        defaultValidityDays: Number(editValidity) || 30,
        validityStartsOnActivation: editValidityStartsOnActivation,
        benefitKind: editKind,
        quantityPerGrant: editKind === 'quantity' ? Number(editQuantity) || null : null,
        maxUsesPerGrant: editKind === 'usage_limit' ? Number(editMaxUses) || null : null,
        isActive: editActive,
        offeringPartners: editingItem.offeringPartners,
      });
      if (!result) {
        Alert.alert('Erreur', 'Mise à jour impossible.');
        return;
      }
      const { item: updated, syncOk, syncError } = result;
      setItems((prev) => {
        const next = prev.map((row) => (row.id === updated.id ? updated : row));
        if (!next.some((row) => row.id === updated.id)) next.unshift(updated);
        return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
      setEditingItem(null);
      if (syncOk) {
        Alert.alert('Enregistré', 'Privilège mis à jour et synchronisé.');
      } else {
        Alert.alert(
          'Enregistré localement',
          syncError
            ? `Modification sauvegardée sur cet appareil, mais Supabase a refusé : ${syncError}`
            : 'Modification sauvegardée localement. Vérifiez Supabase (migration + droits super admin).',
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBenefit(item: BenefitCatalogItem) {
    const summary = await summarizeCatalogGrants(item.id);
    Alert.alert('Suppression en cascade', formatBenefitDeleteWarning(item, summary), [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Continuer',
        style: 'destructive',
        onPress: () => {
          if (summary.grantCount === 0) {
            Alert.alert('Confirmer', 'Supprimer définitivement ce privilège ?', [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Supprimer',
                style: 'destructive',
                onPress: () => void runBenefitDelete(item.id, false),
              },
            ]);
            return;
          }

          Alert.alert(
            'Notifier les membres ?',
            `${summary.userIds.length} membre(s) ont reçu ce privilège.\n\nSouhaitez-vous leur envoyer une notification d'excuse ?`,
            [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Sans notification',
                style: 'destructive',
                onPress: () => void runBenefitDelete(item.id, false),
              },
              {
                text: 'Avec excuses',
                onPress: () => void runBenefitDelete(item.id, true),
              },
            ],
          );
        },
      },
    ]);
  }

  async function runBenefitDelete(catalogId: string, sendApology: boolean) {
    const res = await deleteBenefitCatalogCascade(catalogId, { sendApology });
    if (!res.ok) {
      Alert.alert('Erreur', res.error ?? 'Suppression impossible.');
      return;
    }
    if (editingItem?.id === catalogId) setEditingItem(null);
    await load();
    Alert.alert(
      'Supprimé',
      sendApology
        ? `Privilège retiré. ${res.removedGrants} octroi(s) supprimé(s) et notifications d'excuse envoyées.`
        : `Privilège retiré. ${res.removedGrants} octroi(s) supprimé(s).`,
    );
  }

  async function handleCreate() {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Champs requis', 'Titre et description obligatoires.');
      return;
    }
    setSaving(true);
    try {
      await createBenefitCatalogItemMulti({
        title: title.trim(),
        description: description.trim(),
        offeringPartners: [
          {
            partnerId: EXTERNAL_PARTNER_ID,
            displayName: 'THE LOOP',
            contentId: null,
            contentType: null,
            contentTitle: null,
          },
        ],
        defaultValidityDays: Number(validity) || 30,
        validityStartsOnActivation,
        benefitKind: kind,
        quantityPerGrant: kind === 'quantity' ? Number(quantity) || null : null,
        maxUsesPerGrant: kind === 'usage_limit' ? Number(maxUses) || null : null,
        countryCode,
        isActive: true,
      });
      setTitle('');
      setDescription('');
      setValidity('30');
      setShowCreate(false);
      await load();
      Alert.alert('Créé', 'Privilège THE LOOP ajouté à la liste (actif).');
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Création impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <KeyboardAwareFormScroll
        style={{ flex: 1, backgroundColor: shell.pageBg }}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />
        }
      >
        <AdminPageHeader
          title="Privilège"
          subtitle="Créer et modifier les privilèges THE LOOP · types"
          shell={shell}
          onBack={() => navigation.goBack()}
        />

        <AdminTabMenu
          tabs={[
            { id: 'benefit', label: 'Privilège' },
            { id: 'types', label: 'Type d\'privilège' },
          ]}
          active={menuTab}
          onChange={setMenuTab}
          shell={shell}
          accent={ADMIN_THEME.accent}
        />

        {menuTab === 'types' ? <AdminBenefitTypesPanel enabled={menuTab === 'types'} /> : null}

        {menuTab === 'benefit' ? (
          <>
        <Text style={[styles.hint, { color: shell.pageKicker }]}>
          Privilèges rattachés à « THE LOOP » uniquement. Pour un privilège chez un partenaire : Control Tower → Privilèges THE LOOP.
        </Text>

        <Pressable
          style={[styles.secondaryBtn, { borderColor: ADMIN_THEME.accent }]}
          onPress={() => setShowCreate((v) => !v)}
        >
          <Text style={[styles.secondaryBtnText, { color: ADMIN_THEME.accent }]}>
            {showCreate ? 'Fermer le formulaire' : '+ Créer un privilège'}
          </Text>
        </Pressable>

        {showCreate ? (
          <View style={[styles.createBox, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
            <Text style={[styles.label, { color: shell.pageKicker }]}>Titre *</Text>
            <TextInput style={inputStyle} value={title} onChangeText={setTitle} placeholder="Ex. Welcome drink" placeholderTextColor={shell.pageKicker} />

            <Text style={[styles.label, { color: shell.pageKicker }]}>Description *</Text>
            <TextInput
              style={[...inputStyle, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              placeholder="Conditions…"
              placeholderTextColor={shell.pageKicker}
              multiline
            />

            <Text style={[styles.label, { color: shell.pageKicker }]}>Type de privilège *</Text>
            <View style={styles.chipRow}>
              {types.map((type) => (
                <Pressable
                  key={type.id}
                  style={[
                    styles.chip,
                    { borderColor: shell.filterInactiveBorder },
                    typeId === type.id && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator },
                  ]}
                  onPress={() => applyType(type)}
                >
                  <Text style={{ color: typeId === type.id ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                    {type.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {types.length === 0 ? (
              <Text style={[styles.hint, { color: '#f59e0b' }]}>
                Aucun type actif — basculez sur « Type de privilège » pour en créer.
              </Text>
            ) : null}

            {kind === 'quantity' ? (
              <>
                <Text style={[styles.label, { color: shell.pageKicker }]}>Quantité</Text>
                <TextInput style={inputStyle} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholderTextColor={shell.pageKicker} />
              </>
            ) : null}
            {kind === 'usage_limit' ? (
              <>
                <Text style={[styles.label, { color: shell.pageKicker }]}>Utilisations max</Text>
                <TextInput style={inputStyle} value={maxUses} onChangeText={setMaxUses} keyboardType="numeric" placeholderTextColor={shell.pageKicker} />
              </>
            ) : null}

            <Text style={[styles.label, { color: shell.pageKicker }]}>Validité (jours) *</Text>
            <TextInput style={inputStyle} value={validity} onChangeText={setValidity} keyboardType="numeric" placeholderTextColor={shell.pageKicker} />
            <Text style={[styles.hint, { color: shell.pageKicker }]}>
              Échéance indicative : {formatValidityEndFromDays(Number(validity) || 30)}
            </Text>

            <Text style={[styles.label, { color: shell.pageKicker }]}>Début du compte</Text>
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, { borderColor: shell.filterInactiveBorder }, validityStartsOnActivation && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
                onPress={() => setValidityStartsOnActivation(true)}
              >
                <Text style={{ color: validityStartsOnActivation ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                  1ʳᵉ consommation
                </Text>
              </Pressable>
              <Pressable
                style={[styles.chip, { borderColor: shell.filterInactiveBorder }, !validityStartsOnActivation && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
                onPress={() => setValidityStartsOnActivation(false)}
              >
                <Text style={{ color: !validityStartsOnActivation ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                  Dès la réception
                </Text>
              </Pressable>
            </View>

            <Pressable
              style={[styles.submit, { backgroundColor: shell.tabIndicator, opacity: saving ? 0.6 : 1 }]}
              disabled={saving}
              onPress={() => void handleCreate()}
            >
              <Text style={styles.submitText}>{saving ? 'Création…' : 'Créer et activer'}</Text>
            </Pressable>
          </View>
        ) : null}

        <Text style={[styles.section, { color: shell.pageKicker }]}>
          Liste ({items.length})
        </Text>

        {items.length === 0 ? (
          <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun privilège THE LOOP (sans partenaire).</Text>
        ) : null}

        {items.map((item) => (
          <View key={item.id} style={adminCardStyle(shell)}>
            <View style={styles.rowTop}>
              <Pressable style={{ flex: 1 }} onPress={() => openEdit(item)}>
                <View style={styles.rowTop}>
                  <Text style={[styles.cardTitle, { color: shell.pageTitle, flex: 1 }]} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={[styles.statusChip, { color: item.isActive ? ADMIN_THEME.accent : shell.pageKicker }]}>
                    {item.isActive ? 'Actif' : 'Inactif'}
                  </Text>
                </View>
                <Text style={[styles.cardMeta, { color: shell.pageKicker }]} numberOfLines={2}>
                  {BENEFIT_KIND_LABELS[item.benefitKind]} · jusqu’au{' '}
                  {formatValidityEndFromDays(item.defaultValidityDays)}
                  {item.validityStartsOnActivation === false ? ' · dès réception' : ' · 1ʳᵉ conso'}
                </Text>
                <Text style={[styles.detailLink, { color: ADMIN_THEME.accent }]}>Modifier →</Text>
              </Pressable>
              <AdminActionIcon action="delete" onPress={() => void handleDeleteBenefit(item)} />
            </View>
            <View style={styles.toggleRow}>
              <TogglePill
                value={item.isActive}
                onChange={(next) => void handleToggleActive(item, next)}
                activeLabel="Actif"
                inactiveLabel="Inactif"
                activeColor={ADMIN_THEME.accent}
                shell={shell}
              />
            </View>
          </View>
        ))}
          </>
        ) : null}
      </KeyboardAwareFormScroll>

      <Modal visible={editingItem != null} animationType="slide" transparent onRequestClose={() => setEditingItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
            <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>Modifier le privilège</Text>
            {editingItem ? (
              <ScrollView
                style={styles.editForm}
                contentContainerStyle={{ paddingBottom: 24 }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                <Text style={[styles.label, { color: shell.pageKicker }]}>Titre *</Text>
                <TextInput style={inputStyle} value={editTitle} onChangeText={setEditTitle} placeholderTextColor={shell.pageKicker} />
                <Text style={[styles.label, { color: shell.pageKicker }]}>Description *</Text>
                <TextInput
                  style={[...inputStyle, styles.multiline]}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  multiline
                  placeholderTextColor={shell.pageKicker}
                />
                <Text style={[styles.label, { color: shell.pageKicker }]}>Type de privilège</Text>
                <View style={styles.chipRow}>
                  {types.map((type) => (
                    <Pressable
                      key={type.id}
                      style={[
                        styles.chip,
                        { borderColor: shell.filterInactiveBorder },
                        editTypeId === type.id && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator },
                      ]}
                      onPress={() => applyEditType(type)}
                    >
                      <Text style={{ color: editTypeId === type.id ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                        {type.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {editKind === 'quantity' ? (
                  <>
                    <Text style={[styles.label, { color: shell.pageKicker }]}>Quantité</Text>
                    <TextInput style={inputStyle} value={editQuantity} onChangeText={setEditQuantity} keyboardType="numeric" placeholderTextColor={shell.pageKicker} />
                  </>
                ) : null}
                {editKind === 'usage_limit' ? (
                  <>
                    <Text style={[styles.label, { color: shell.pageKicker }]}>Utilisations max</Text>
                    <TextInput style={inputStyle} value={editMaxUses} onChangeText={setEditMaxUses} keyboardType="numeric" placeholderTextColor={shell.pageKicker} />
                  </>
                ) : null}
                <Text style={[styles.label, { color: shell.pageKicker }]}>Validité (jours) *</Text>
                <TextInput style={inputStyle} value={editValidity} onChangeText={setEditValidity} keyboardType="numeric" placeholderTextColor={shell.pageKicker} />
                <Text style={[styles.hint, { color: shell.pageKicker }]}>
                  Échéance indicative : {formatValidityEndFromDays(Number(editValidity) || 30)}
                </Text>
                <Text style={[styles.label, { color: shell.pageKicker }]}>Début du compte</Text>
                <View style={styles.chipRow}>
                  <Pressable
                    style={[styles.chip, { borderColor: shell.filterInactiveBorder }, editValidityStartsOnActivation && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
                    onPress={() => setEditValidityStartsOnActivation(true)}
                  >
                    <Text style={{ color: editValidityStartsOnActivation ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                      1ʳᵉ consommation
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, { borderColor: shell.filterInactiveBorder }, !editValidityStartsOnActivation && { backgroundColor: shell.tabIndicator, borderColor: shell.tabIndicator }]}
                    onPress={() => setEditValidityStartsOnActivation(false)}
                  >
                    <Text style={{ color: !editValidityStartsOnActivation ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                      Dès la réception
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.toggleRow}>
                  <TogglePill
                    value={editActive}
                    onChange={setEditActive}
                    activeLabel="Actif"
                    inactiveLabel="Inactif"
                    activeColor={ADMIN_THEME.accent}
                    shell={shell}
                  />
                </View>
                <Pressable
                  style={[styles.submit, { backgroundColor: shell.tabIndicator, opacity: saving ? 0.6 : 1 }]}
                  disabled={saving}
                  onPress={() => void handleSaveEdit()}
                >
                  <Text style={styles.submitText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.deleteBtn, { borderColor: '#ef4444' }]}
                  onPress={() => editingItem && void handleDeleteBenefit(editingItem)}
                >
                  <Text style={styles.deleteBtnText}>Supprimer le privilège</Text>
                </Pressable>
                <Pressable style={styles.modalClose} onPress={() => setEditingItem(null)}>
                  <Text style={{ color: shell.pageKicker, fontWeight: '700' }}>Annuler</Text>
                </Pressable>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 12, fontStyle: 'italic' },
  section: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8, marginBottom: 10 },
  empty: { fontSize: 13, fontStyle: 'italic', marginBottom: 12 },
  secondaryBtn: { borderWidth: 1.5, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 12 },
  secondaryBtnText: { fontWeight: '800', fontSize: 13 },
  createBox: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 16 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 4 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 8 },
  submit: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800' },
  deleteBtn: { marginTop: 12, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5 },
  deleteBtnText: { color: '#ef4444', fontWeight: '800' },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  cardMeta: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  statusChip: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  detailLink: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  toggleRow: { marginTop: 12 },
  detailBody: { fontSize: 14, lineHeight: 20, marginVertical: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: {
    borderWidth: 1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '85%',
    marginHorizontal: 0,
    paddingTop: 16,
    paddingBottom: 8,
  },
  editForm: { maxHeight: 480, paddingHorizontal: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8, paddingHorizontal: 20 },
  modalClose: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
});
