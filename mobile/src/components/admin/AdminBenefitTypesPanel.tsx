import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { TogglePill } from '@/components/admin/TogglePill';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import {
  createBenefitType,
  deleteBenefitType,
  listBenefitTypes,
  setBenefitTypeActive,
  updateBenefitType,
  type BenefitTypeDefinition,
} from '@/lib/benefit-types-store';

type ViewTab = 'active' | 'inactive' | 'all';

/** Panneau création / gestion des types d'avantage (libellé libre + description). */
export function AdminBenefitTypesPanel({ enabled = true }: { enabled?: boolean }) {
  const { shell } = useMemberTheme();

  const [viewTab, setViewTab] = useState<ViewTab>('all');
  const [items, setItems] = useState<BenefitTypeDefinition[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editing, setEditing] = useState<BenefitTypeDefinition | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(await listBenefitTypes(false));
  }, []);

  useFocusLoad(
    async () => {
      await load();
    },
    { ttlMs: 90_000, enabled },
  );

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (viewTab === 'active') return i.isActive;
      if (viewTab === 'inactive') return !i.isActive;
      return true;
    });
  }, [items, viewTab]);

  const inputStyle = [
    styles.input,
    { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder, color: shell.pageTitle },
  ];

  async function handleAdd() {
    if (!newLabel.trim()) {
      Alert.alert('Libellé requis', 'Saisissez le nom du type d\'avantage.');
      return;
    }
    await createBenefitType({
      label: newLabel.trim(),
      description: newDesc.trim(),
      mechanic: 'unlimited',
    });
    setNewLabel('');
    setNewDesc('');
    await load();
    Alert.alert('Ajouté', 'Type d\'avantage créé.');
  }

  function openEdit(item: BenefitTypeDefinition) {
    setEditing(item);
    setEditLabel(item.label);
    setEditDesc(item.description);
  }

  async function handleSaveEdit() {
    if (!editing || !editLabel.trim()) {
      Alert.alert('Libellé requis', 'Saisissez un nom.');
      return;
    }
    await updateBenefitType(editing.id, {
      label: editLabel.trim(),
      description: editDesc.trim(),
    });
    setEditing(null);
    await load();
    Alert.alert('Enregistré', 'Type d\'avantage mis à jour.');
  }

  async function applyToggle(item: BenefitTypeDefinition, next: boolean) {
    setTogglingId(item.id);
    setItems((prev) => prev.map((t) => (t.id === item.id ? { ...t, isActive: next } : t)));
    try {
      await setBenefitTypeActive(item.id, next);
    } catch {
      await load();
      Alert.alert('Erreur', 'Impossible de modifier ce type.');
    } finally {
      setTogglingId(null);
    }
  }

  function confirmDelete(item: BenefitTypeDefinition) {
    if (item.isBuiltIn) {
      Alert.alert(
        'Type intégré',
        'Les types intégrés ne peuvent pas être supprimés. Vous pouvez les désactiver.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Désactiver', style: 'destructive', onPress: () => void applyToggle(item, false) },
        ],
      );
      return;
    }
    Alert.alert('Supprimer', `Supprimer définitivement « ${item.label} » ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => void deleteBenefitType(item.id).then(load),
      },
    ]);
  }

  return (
    <>
      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        Un type = un modèle nommé (ex. « Cocktail offert »). Saisissez librement le libellé et la description.
      </Text>

      <AdminTabMenu
        tabs={[
          { id: 'all', label: 'Tous', badge: items.length },
          { id: 'active', label: 'Actifs', badge: items.filter((i) => i.isActive).length },
          { id: 'inactive', label: 'Inactifs', badge: items.filter((i) => !i.isActive).length },
        ]}
        active={viewTab}
        onChange={setViewTab}
        shell={shell}
      />

      {editing ? (
        <View
          style={[
            styles.editBox,
            { borderColor: shell.tabIndicator, backgroundColor: shell.filterInactiveBg },
          ]}
        >
          <Text style={[styles.section, { color: shell.pageKicker, marginTop: 0 }]}>Modifier le type</Text>
          <Text style={[styles.label, { color: shell.pageKicker }]}>Nom du type *</Text>
          <TextInput
            style={inputStyle}
            value={editLabel}
            onChangeText={setEditLabel}
            placeholder="Libellé du type"
            placeholderTextColor={shell.pageKicker}
          />
          <Text style={[styles.label, { color: shell.pageKicker }]}>Description</Text>
          <TextInput
            style={[...inputStyle, styles.multiline]}
            value={editDesc}
            onChangeText={setEditDesc}
            multiline
            placeholder="Description (modifiable)"
            placeholderTextColor={shell.pageKicker}
          />
          <Pressable style={[styles.submit, { backgroundColor: shell.tabIndicator }]} onPress={() => void handleSaveEdit()}>
            <Text style={styles.submitText}>Enregistrer les modifications</Text>
          </Pressable>
          <Pressable style={styles.modalClose} onPress={() => setEditing(null)}>
            <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Annuler</Text>
          </Pressable>
        </View>
      ) : null}

      {filtered.map((item) => (
        <View
          key={item.id}
          style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
        >
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>{item.label}</Text>
              <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
                {item.isBuiltIn ? 'Intégré' : 'Personnalisé'}
                {!item.isActive ? ' · inactif' : ''}
              </Text>
              {item.description ? (
                <Text style={[styles.cardBody, { color: shell.pageTitle }]} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
            </View>
            <TogglePill
              value={item.isActive}
              disabled={togglingId === item.id}
              shell={shell}
              activeLabel="Actif"
              inactiveLabel="Off"
              activeColor="#10b981"
              onChange={(next) => {
                if (!next) {
                  Alert.alert('Désactiver', `Masquer « ${item.label} » à la création d'avantages ?`, [
                    { text: 'Annuler', style: 'cancel' },
                    { text: 'Désactiver', style: 'destructive', onPress: () => void applyToggle(item, false) },
                  ]);
                  return;
                }
                void applyToggle(item, true);
              }}
            />
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => openEdit(item)} hitSlop={8}>
              <Text style={{ color: shell.tabIndicator, fontWeight: '800', fontSize: 13 }}>Modifier</Text>
            </Pressable>
            <Pressable onPress={() => confirmDelete(item)} hitSlop={8} style={{ marginLeft: 16 }}>
              <Text style={{ color: '#ef4444', fontWeight: '800', fontSize: 13 }}>Supprimer</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {filtered.length === 0 ? (
        <Text style={[styles.hint, { color: shell.pageKicker }]}>Aucun type pour ce filtre.</Text>
      ) : null}

      {!editing ? (
        <>
          <Text style={[styles.section, { color: shell.pageKicker }]}>Nouveau type d'avantage</Text>
          <Text style={[styles.label, { color: shell.pageKicker }]}>Nom du type *</Text>
          <TextInput
            style={inputStyle}
            value={newLabel}
            onChangeText={setNewLabel}
            placeholder="Libellé du type (saisissable)"
            placeholderTextColor={shell.pageKicker}
          />
          <Text style={[styles.label, { color: shell.pageKicker }]}>Description</Text>
          <TextInput
            style={[...inputStyle, styles.multiline]}
            value={newDesc}
            onChangeText={setNewDesc}
            placeholder="Quand utiliser ce type…"
            placeholderTextColor={shell.pageKicker}
            multiline
          />
          <Pressable style={[styles.submit, { backgroundColor: shell.tabIndicator }]} onPress={() => void handleAdd()}>
            <Text style={styles.submitText}>Créer le type</Text>
          </Pressable>
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 12, fontStyle: 'italic' },
  section: { marginTop: 20, marginBottom: 8, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, marginBottom: 4 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardMeta: { marginTop: 4, fontSize: 11 },
  cardBody: { marginTop: 6, fontSize: 12, lineHeight: 18 },
  actions: { flexDirection: 'row', marginTop: 8, alignItems: 'center' },
  submit: { marginTop: 14, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '800' },
  editBox: { borderWidth: 2, borderRadius: 14, padding: 14, marginTop: 16, marginBottom: 8 },
  modalClose: { alignItems: 'center', paddingVertical: 14 },
});
