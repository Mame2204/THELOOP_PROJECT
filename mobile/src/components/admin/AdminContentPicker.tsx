import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { ADMIN_THEME } from '@/components/admin/AdminShell';
import {
  filterPickerEntries,
  type AdminPickerEntry,
  type AdminPickerKind,
} from '@/lib/admin-content-picker';

const KINDS: { id: AdminPickerKind; label: string }[] = [
  { id: 'event', label: 'Événements' },
  { id: 'spot', label: 'Spots' },
  { id: 'tool', label: 'Outils' },
];

type PickerShell = {
  pageTitle: string;
  pageKicker: string;
  filterInactiveBorder: string;
  filterInactiveBg: string;
};

interface AdminContentPickerProps {
  shell: PickerShell;
  items: AdminPickerEntry[];
  selected: AdminPickerEntry[];
  mode: 'single' | 'multiple';
  max?: number;
  loading?: boolean;
  onToggle: (item: AdminPickerEntry) => void;
}

export function AdminContentPicker({
  shell,
  items,
  selected,
  mode,
  max = 8,
  loading = false,
  onToggle,
}: AdminContentPickerProps) {
  const [kind, setKind] = useState<AdminPickerKind>('spot');
  const [query, setQuery] = useState('');

  const visible = useMemo(() => filterPickerEntries(items, kind, query), [items, kind, query]);
  const kindCount = useMemo(() => items.filter((item) => item.kind === kind).length, [items, kind]);

  return (
    <View>
      {selected.length > 0 ? (
        <View style={styles.selectedBox}>
          {selected.map((item, index) => (
            <View key={`${item.kind}-${item.id}`} style={styles.selectedRow}>
              <Text style={[styles.selectedTitle, { color: shell.pageTitle }]} numberOfLines={1}>
                {mode === 'multiple' ? `${index + 1}. ` : ''}
                {item.title}
              </Text>
              <Pressable onPress={() => onToggle(item)} hitSlop={8}>
                <Text style={styles.remove}>Retirer</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.hint, { color: shell.pageKicker }]}>
          {mode === 'multiple' ? `Choisis au moins 2 étapes (max ${max}).` : 'Aucun contenu lié.'}
        </Text>
      )}

      <View style={styles.tabs}>
        {KINDS.map((tab) => {
          const on = kind === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setKind(tab.id)}
              style={[
                styles.tab,
                {
                  borderColor: on ? ADMIN_THEME.accent : shell.filterInactiveBorder,
                  backgroundColor: on ? ADMIN_THEME.glow : shell.filterInactiveBg,
                },
              ]}
            >
              <Text style={{ color: shell.pageTitle, fontSize: 12, fontWeight: '700' }}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Rechercher…"
        placeholderTextColor={shell.pageKicker}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.search,
          { color: shell.pageTitle, borderColor: shell.filterInactiveBorder },
        ]}
      />
      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        {visible.length} affiché{visible.length > 1 ? 's' : ''} · {kindCount} publié{kindCount > 1 ? 's' : ''}
      </Text>

      <ScrollView
        style={[styles.list, { borderColor: shell.filterInactiveBorder }]}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        {visible.map((item) => {
          const on = selected.some((s) => s.kind === item.kind && s.id === item.id);
          return (
            <Pressable
              key={`${item.kind}-${item.id}`}
              onPress={() => onToggle(item)}
              style={[styles.row, { borderBottomColor: shell.filterInactiveBorder }]}
            >
              <Text style={{ color: shell.pageTitle, fontWeight: '700' }} numberOfLines={1}>
                {on ? '✓ ' : ''}
                {item.title}
              </Text>
              {item.subtitle ? (
                <Text style={{ color: shell.pageKicker, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        {visible.length === 0 ? (
          <Text style={[styles.empty, { color: shell.pageKicker }]}>
            {loading ? 'Chargement du catalogue…' : query.trim() ? 'Aucun résultat.' : 'Aucun contenu publié.'}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  selectedBox: { gap: 6, marginBottom: 8 },
  selectedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  selectedTitle: { flex: 1, fontWeight: '700', fontSize: 13 },
  remove: { color: '#ef4444', fontWeight: '700', fontSize: 12 },
  hint: { fontSize: 11, marginBottom: 6 },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  tab: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  search: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 4,
  },
  list: { maxHeight: 240, borderWidth: 1, borderRadius: 12, marginBottom: 8 },
  row: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { padding: 12, fontSize: 12 },
});
