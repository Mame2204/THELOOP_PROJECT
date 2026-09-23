import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { ADMIN_THEME } from '@/components/admin/AdminShell';
import type { ShellTheme } from '@/lib/member-grade-theme';

export type PublishedContentKind = 'spot' | 'event' | 'tool';

export type PublishedContentPick = {
  kind: PublishedContentKind;
  id: string;
  slug: string;
  label: string;
};

type SpotRow = { id: string; slug: string; name: string };
type EventRow = { id: string; slug: string; title: string };

interface Props {
  label: string;
  hint?: string;
  required?: boolean;
  shell: ShellTheme;
  spots: SpotRow[];
  events: EventRow[];
  tools: SpotRow[];
  value: PublishedContentPick | null;
  onChange: (next: PublishedContentPick | null) => void;
}

function kindLabel(kind: PublishedContentKind): string {
  if (kind === 'event') return 'Événement';
  if (kind === 'tool') return 'Outil';
  return 'Spot';
}

export function AdminPublishedContentPicker({
  label,
  hint,
  required,
  shell,
  spots,
  events,
  tools,
  value,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const rows: PublishedContentPick[] = [];
    for (const s of spots) {
      rows.push({ kind: 'spot', id: s.id, slug: s.slug, label: s.name });
    }
    for (const e of events) {
      rows.push({ kind: 'event', id: e.id, slug: e.slug, label: e.title });
    }
    for (const t of tools) {
      rows.push({ kind: 'tool', id: t.id, slug: t.slug, label: t.name });
    }
    rows.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    return rows;
  }, [spots, events, tools]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        kindLabel(o.kind).toLowerCase().includes(q),
    );
  }, [options, query]);

  const summary = value
    ? `${kindLabel(value.kind)} · ${value.label}`
    : required
      ? 'Choisir un contenu publié…'
      : 'Aucun (optionnel)';

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: shell.pageKicker }]}>{label}</Text>
      {hint ? <Text style={[styles.hint, { color: shell.pageKicker }]}>{hint}</Text> : null}

      <Pressable
        onPress={() => {
          setQuery('');
          setOpen(true);
        }}
        style={[
          styles.trigger,
          {
            borderColor: shell.filterInactiveBorder,
            backgroundColor: shell.filterInactiveBg,
          },
        ]}
      >
        <Text style={{ color: value ? shell.pageTitle : shell.pageKicker, fontWeight: '600' }} numberOfLines={2}>
          {summary}
        </Text>
        <Text style={{ color: ADMIN_THEME.accent, fontWeight: '800', fontSize: 12 }}>▼</Text>
      </Pressable>

      {!required && value ? (
        <Pressable onPress={() => onChange(null)} style={styles.clearBtn}>
          <Text style={{ color: shell.pageKicker, fontSize: 12, fontWeight: '600' }}>Retirer la liaison</Text>
        </Pressable>
      ) : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder }]}>
            <Text style={[styles.sheetTitle, { color: shell.pageTitle }]}>{label}</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher…"
              placeholderTextColor={shell.pageKicker}
              style={[
                styles.search,
                {
                  borderColor: shell.filterInactiveBorder,
                  color: shell.pageTitle,
                  backgroundColor: shell.filterInactiveBg,
                },
              ]}
              autoCapitalize="none"
            />
            <Text style={[styles.count, { color: shell.pageKicker }]}>
              {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
              {options.length !== filtered.length ? ` · ${options.length} au total` : ''}
            </Text>
            <FlatList
              data={filtered}
              keyExtractor={(item) => `${item.kind}-${item.id}`}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun contenu correspondant.</Text>
              }
              renderItem={({ item }) => {
                const selected = value?.kind === item.kind && value.id === item.id;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                    style={[
                      styles.row,
                      {
                        borderColor: selected ? ADMIN_THEME.accent : shell.filterInactiveBorder,
                        backgroundColor: selected ? ADMIN_THEME.glow : 'transparent',
                      },
                    ]}
                  >
                    <Text style={{ color: shell.pageKicker, fontSize: 10, fontWeight: '700' }}>
                      {kindLabel(item.kind).toUpperCase()}
                    </Text>
                    <Text style={{ color: shell.pageTitle, fontWeight: '600' }} numberOfLines={2}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />
            <Pressable onPress={() => setOpen(false)} style={styles.closeBtn}>
              <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Fermer</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  hint: { fontSize: 11, lineHeight: 16, marginBottom: 6 },
  trigger: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  clearBtn: { marginTop: 6, alignSelf: 'flex-start' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  sheetTitle: { fontSize: 16, fontWeight: '800', marginBottom: 10 },
  search: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  count: { fontSize: 11, marginTop: 8, marginBottom: 6 },
  list: { flexGrow: 0 },
  row: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 4,
  },
  empty: { textAlign: 'center', paddingVertical: 24, fontSize: 13 },
  closeBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
