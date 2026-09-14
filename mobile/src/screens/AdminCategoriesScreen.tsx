import { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { AdminActionIcon } from '@/components/admin/AdminActionIcon';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { TogglePill } from '@/components/admin/TogglePill';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { normalizeCategoryEmoji } from '@/lib/category-emoji-utils';
import {
  addAdminCategory,
  CATEGORY_KIND_LABELS,
  listAdminCategories,
  removeAdminCategoryPermanently,
  setAdminCategoryActive,
  updateAdminCategory,
  type AdminCategory,
  type ContentCategoryKind,
} from '@/lib/admin-categories-store';
import { useCategoryLabels } from '@/context/CategoryLabelsContext';
import { useAuthContext } from '@/context/AuthContext';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminCategories'>;
type KindTab = 'all' | ContentCategoryKind;
type ViewTab = 'active' | 'inactive' | 'all';

export function AdminCategoriesScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('categories');
  const { refresh: refreshCategoryLabels } = useCategoryLabels();

  const [kindTab, setKindTab] = useState<KindTab>('all');
  const [viewTab, setViewTab] = useState<ViewTab>('all');
  const [items, setItems] = useState<AdminCategory[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('🏷️');
  const [editingItem, setEditingItem] = useState<AdminCategory | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [createKind, setCreateKind] = useState<ContentCategoryKind>('event');

  const load = useCallback(async () => {
    if (kindTab === 'all') {
      const [ev, sp, tl] = await Promise.all([
        listAdminCategories('event', false),
        listAdminCategories('spot', false),
        listAdminCategories('tool', false),
      ]);
      setItems([...ev, ...sp, ...tl]);
      return;
    }
    setItems(await listAdminCategories(kindTab, false));
  }, [kindTab]);

  useFocusLoad(
    async () => {
      await load();
    },
    { ttlMs: 90_000, enabled: role === 'ADMIN' && allowed, resetKey: kindTab },
  );

  if (role !== 'ADMIN') {
    return (
      <View style={{ flex: 1, backgroundColor: shell.pageBg, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: shell.pageTitle }}>Accès réservé</Text>
      </View>
    );
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  const inputStyle = [styles.input, { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder, color: shell.pageTitle }];

  const filtered = items.filter((i) => {
    if (viewTab === 'active') return i.isActive;
    if (viewTab === 'inactive') return !i.isActive;
    return true;
  });

  async function applyCategoryVisibilityChange(id: string, isActive: boolean) {
    const previous = items.find((c) => c.id === id);
    setTogglingId(id);
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, isActive } : c)));
    try {
      const updated = await setAdminCategoryActive(id, isActive);
      if (!updated) throw new Error('Mise à jour impossible');
      await refreshCategoryLabels();
    } catch {
      if (previous) {
        setItems((prev) => prev.map((c) => (c.id === id ? previous : c)));
      } else {
        await load();
      }
      Alert.alert('Erreur', 'Impossible de modifier cette catégorie. Réessayez.');
    } finally {
      setTogglingId(null);
    }
  }

  function confirmToggleActive(item: AdminCategory, next: boolean) {
    if (next) {
      void applyCategoryVisibilityChange(item.id, true);
      return;
    }
    Alert.alert(
      'Désactiver la catégorie',
      `« ${item.label} » disparaîtra des filtres et les événements / spots / outils rattachés seront masqués dans l'app.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Désactiver',
          style: 'destructive',
          onPress: () => void applyCategoryVisibilityChange(item.id, false),
        },
      ],
    );
  }

  async function handleAdd() {
    if (!newLabel.trim()) {
      Alert.alert('Libellé requis', 'Saisissez le nom de la catégorie.');
      return;
    }
    const targetKind = kindTab === 'all' ? createKind : kindTab;
    const emoji = normalizeCategoryEmoji(newEmoji);
    await addAdminCategory(targetKind, newLabel, emoji);
    setNewLabel('');
    setNewEmoji('🏷️');
    await refreshCategoryLabels();
    await load();
    Alert.alert('Ajouté', 'Catégorie créée.');
  }

  function openEdit(item: AdminCategory) {
    setEditingItem(item);
    setEditLabel(item.label);
    setEditEmoji(item.emoji);
  }

  async function handleSaveEdit() {
    if (!editingItem || !editLabel.trim()) {
      Alert.alert('Libellé requis', 'Saisissez un nom de catégorie.');
      return;
    }
    await updateAdminCategory(editingItem.id, {
      label: editLabel.trim(),
      emoji: normalizeCategoryEmoji(editEmoji),
    });
    setEditingItem(null);
    await refreshCategoryLabels();
    await load();
    Alert.alert('Enregistré', 'Catégorie mise à jour.');
  }

  function confirmDelete(item: AdminCategory) {
    Alert.alert(
      'Supprimer',
      item.isBuiltin
        ? `Supprimer définitivement « ${item.label} » (catégorie intégrée) ? Les contenus existants garderont l'ancien slug en base.`
        : `Supprimer définitivement « ${item.label} » ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            const ok = await removeAdminCategoryPermanently(item.id);
            if (!ok) {
              Alert.alert('Erreur', 'Suppression impossible. Vérifiez Supabase et vos droits admin.');
              return;
            }
            await refreshCategoryLabels();
            await load();
          },
        },
      ],
    );
  }

  return (
    <>
      <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
        <AdminPageHeader
          title="Catégories"
          subtitle="Activation / désactivation — événements, spots, outils"
          shell={shell}
          onBack={() => navigation.goBack()}
        />
        <AdminCountryBar shell={shell} compact />

        <AdminTabMenu
          tabs={[
            { id: 'all', label: 'Tous' },
            { id: 'event', label: 'Événements' },
            { id: 'spot', label: 'Spots' },
            { id: 'tool', label: 'Outils' },
          ]}
          active={kindTab}
          onChange={(t) => setKindTab(t as KindTab)}
          shell={shell}
          accent={ADMIN_THEME.accent}
        />
        <AdminTabMenu
          tabs={[
            { id: 'all', label: 'Toutes' },
            { id: 'active', label: 'Activées', badge: items.filter((i) => i.isActive).length },
            { id: 'inactive', label: 'Désactivées', badge: items.filter((i) => !i.isActive).length },
          ]}
          active={viewTab}
          onChange={(t) => setViewTab(t as ViewTab)}
          shell={shell}
          accent={ADMIN_THEME.accent}
        />

        <Text style={[styles.section, { color: shell.pageKicker }]}>
          {kindTab === 'all' ? 'Toutes les catégories' : CATEGORY_KIND_LABELS[kindTab]} — {filtered.length} affichée(s)
        </Text>

        {filtered.map((item) => (
          <View key={`${item.kind}-${item.id}`} style={adminCardStyle(shell)}>
            <View style={styles.row}>
              <Text style={styles.emoji}>{item.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: shell.pageTitle }]}>{item.label}</Text>
                <Text style={[styles.meta, { color: shell.pageKicker }]}>
                  {CATEGORY_KIND_LABELS[item.kind]} · {item.isBuiltin ? 'Intégrée' : 'Personnalisée'} · {item.id}
                  {!item.isActive ? ' · désactivée' : ''}
                </Text>
              </View>
              <TogglePill
                value={item.isActive}
                onChange={(next) => confirmToggleActive(item, next)}
                disabled={togglingId === item.id}
                activeLabel="Activé"
                inactiveLabel="Désactivé"
                activeColor={shell.tabIndicator}
                shell={shell}
              />
            </View>
            <View style={styles.actionRow}>
              <AdminActionIcon action="edit" color={shell.tabIndicator} onPress={() => openEdit(item)} />
              <AdminActionIcon action="delete" onPress={() => confirmDelete(item)} />
            </View>
          </View>
        ))}

        <Text style={[styles.section, { color: shell.pageKicker }]}>Nouvelle catégorie</Text>
        {kindTab === 'all' ? (
          <AdminTabMenu
            tabs={[
              { id: 'event', label: 'Événements' },
              { id: 'spot', label: 'Spots' },
              { id: 'tool', label: 'Outils' },
            ]}
            active={createKind}
            onChange={(t) => setCreateKind(t as ContentCategoryKind)}
            shell={shell}
            accent={ADMIN_THEME.accent}
          />
        ) : null}
        <Text style={[styles.label, { color: shell.pageKicker }]}>Emoji</Text>
        <TextInput style={inputStyle} value={newEmoji} onChangeText={setNewEmoji} placeholder="🏷️" placeholderTextColor={shell.pageKicker} />
        <Text style={[styles.label, { color: shell.pageKicker }]}>Libellé *</Text>
        <TextInput style={inputStyle} value={newLabel} onChangeText={setNewLabel} placeholder="Ex. Wellness" placeholderTextColor={shell.pageKicker} />
        <Pressable style={[styles.submit, { backgroundColor: shell.tabIndicator }]} onPress={() => void handleAdd()}>
          <Text style={styles.submitText}>Ajouter la catégorie</Text>
        </Pressable>
      </KeyboardAwareFormScroll>

      <Modal visible={editingItem != null} transparent animationType="slide" onRequestClose={() => setEditingItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
            <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>Modifier la catégorie</Text>
            <Text style={[styles.label, { color: shell.pageKicker, paddingHorizontal: 16 }]}>Emoji</Text>
            <TextInput style={[...inputStyle, { marginHorizontal: 16 }]} value={editEmoji} onChangeText={setEditEmoji} placeholderTextColor={shell.pageKicker} />
            <Text style={[styles.label, { color: shell.pageKicker, paddingHorizontal: 16 }]}>Libellé *</Text>
            <TextInput style={[...inputStyle, { marginHorizontal: 16 }]} value={editLabel} onChangeText={setEditLabel} placeholderTextColor={shell.pageKicker} />
            <Pressable style={[styles.submit, { backgroundColor: shell.tabIndicator, marginHorizontal: 16 }]} onPress={() => void handleSaveEdit()}>
              <Text style={styles.submitText}>Enregistrer</Text>
            </Pressable>
            <Pressable style={styles.modalClose} onPress={() => setEditingItem(null)}>
              <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  section: { marginTop: 16, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 22 },
  title: { fontSize: 15, fontWeight: '700' },
  meta: { marginTop: 2, fontSize: 10 },
  actionRow: { flexDirection: 'row', gap: 16, marginTop: 10 },
  submit: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { fontWeight: '800', color: '#000' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { borderWidth: 1, borderRadius: 16, margin: 12, marginBottom: 24, paddingBottom: 8 },
  modalTitle: { fontSize: 16, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  modalClose: { alignItems: 'center', paddingVertical: 14 },
});
