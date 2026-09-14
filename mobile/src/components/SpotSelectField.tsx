import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import type { ShellTheme } from '@/lib/member-grade-theme';
import { ADMIN_THEME } from '@/components/admin/AdminShell';

export interface SpotOption {
  id: string;
  name: string;
  address: string;
  source?: 'database' | 'staging';
}

interface Props {
  spots: SpotOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  shell: ShellTheme;
  placeholder?: string;
  /** Accent sélection (admin bordeaux par défaut). */
  accentColor?: string;
}

export function SpotSelectField({
  spots,
  value,
  onChange,
  shell,
  placeholder = 'Choisir un spot',
  accentColor = ADMIN_THEME.accent,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = spots.find((s) => s.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return spots;
    return spots.filter(
      (s) => s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q),
    );
  }, [spots, query]);

  return (
    <>
      <Pressable
        style={[
          styles.trigger,
          {
            borderColor: selected ? accentColor : shell.filterInactiveBorder,
            backgroundColor: selected ? `${accentColor}14` : shell.filterInactiveBg,
            borderWidth: selected ? 2 : 1,
          },
        ]}
        onPress={() => setOpen(true)}
      >
        {selected ? (
          <>
            <Text style={[styles.triggerTitle, { color: shell.pageTitle }]}>{selected.name}</Text>
            <Text style={[styles.triggerMeta, { color: shell.pageKicker }]} numberOfLines={1}>
              {selected.address}
            </Text>
          </>
        ) : (
          <Text style={{ color: shell.pageKicker }}>{placeholder}</Text>
        )}
        <Text style={[styles.chevron, { color: shell.pageKicker }]}>▼</Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: shell.pageBg }]}>
            <Text style={[styles.sheetTitle, { color: shell.pageTitle }]}>Sélectionner un spot</Text>
            <TextInput
              style={[styles.search, { borderColor: shell.filterInactiveBorder, color: shell.pageTitle, backgroundColor: shell.filterInactiveBg }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher par nom ou adresse…"
              placeholderTextColor={shell.pageKicker}
              autoFocus
            />
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun spot trouvé.</Text>
              }
              renderItem={({ item }) => (
                <Pressable
                  style={[
                    styles.row,
                    { borderColor: shell.filterInactiveBorder },
                    value === item.id && { borderColor: accentColor, backgroundColor: `${accentColor}1F` },
                  ]}
                  onPress={() => {
                    onChange(item.id);
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <Text style={[styles.rowTitle, { color: shell.pageTitle }]}>{item.name}</Text>
                  <Text style={[styles.rowMeta, { color: shell.pageKicker }]}>{item.address}</Text>
                  {item.source ? (
                    <Text style={[styles.rowSource, { color: shell.pageKicker }]}>
                      {item.source === 'database' ? 'Base THE LOOP' : 'Brouillon partenaire'}
                    </Text>
                  ) : null}
                </Pressable>
              )}
            />
            <Pressable style={styles.closeBtn} onPress={() => setOpen(false)}>
              <Text style={{ color: shell.pageKicker, fontWeight: '700' }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  triggerTitle: { fontWeight: '700', fontSize: 14, flex: 1 },
  triggerMeta: { fontSize: 12, flexBasis: '100%' },
  chevron: { fontSize: 10, marginLeft: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '80%', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16 },
  sheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  search: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 8 },
  list: { maxHeight: 360 },
  row: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 8 },
  rowTitle: { fontWeight: '700', fontSize: 14 },
  rowMeta: { marginTop: 4, fontSize: 12 },
  rowSource: { marginTop: 2, fontSize: 10 },
  empty: { textAlign: 'center', padding: 24, fontStyle: 'italic' },
  closeBtn: { alignItems: 'center', paddingVertical: 14 },
});
