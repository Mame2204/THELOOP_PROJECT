import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

export interface PartnerPickerOption {
  id: string;
  label: string;
  subtitle?: string;
}

interface Props {
  visible: boolean;
  title: string;
  options: PartnerPickerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  emptyMessage?: string;
  shell: { pageBg: string; pageTitle: string; pageKicker: string; filterInactiveBg: string; filterInactiveBorder: string };
}

export function PartnerPicker({ visible, title, options, selectedId, onSelect, onClose, emptyMessage, shell }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.title, { color: shell.pageTitle }]}>{title}</Text>
          <ScrollView style={styles.list}>
            {options.length === 0 ? (
              <Text style={[styles.empty, { color: shell.pageKicker }]}>
                {emptyMessage ?? 'Aucun lieu disponible pour ce partenaire.'}
              </Text>
            ) : null}
            {options.map((opt) => (
              <Pressable
                key={opt.id}
                style={[
                  styles.row,
                  { borderColor: shell.filterInactiveBorder, backgroundColor: selectedId === opt.id ? 'rgba(201,168,76,0.2)' : shell.filterInactiveBg },
                ]}
                onPress={() => {
                  onSelect(opt.id);
                  onClose();
                }}
              >
                <Text style={{ color: shell.pageTitle, fontWeight: selectedId === opt.id ? '800' : '600' }}>{opt.label}</Text>
                {opt.subtitle ? (
                  <Text style={{ color: shell.pageKicker, fontSize: 11, marginTop: 4 }}>{opt.subtitle}</Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={{ color: shell.pageKicker, fontWeight: '700' }}>Fermer</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1, maxHeight: '70%', paddingBottom: 16 },
  title: { fontSize: 16, fontWeight: '800', padding: 16, paddingBottom: 8 },
  list: { maxHeight: 360 },
  empty: { marginHorizontal: 16, marginBottom: 12, fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
  row: { marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 12, borderWidth: 1 },
  close: { alignItems: 'center', paddingVertical: 12 },
});
