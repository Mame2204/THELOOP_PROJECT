import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import type { PartnerRewardContentKind } from '@/lib/partner-milestone-store';

export interface PartnerContentPick {
  kind: PartnerRewardContentKind;
  id: string;
  title: string;
  subtitle?: string;
}

interface Props {
  visible: boolean;
  rewardLabel: string;
  items: PartnerContentPick[];
  onClose: () => void;
  onPick: (item: PartnerContentPick) => void;
}

export function PartnerRewardSelectModal({ visible, rewardLabel, items, onClose, onPick }: Props) {
  const { shell } = useMemberTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Text style={{ color: shell.pageKicker, fontSize: 18 }}>✕</Text>
          </Pressable>

          <Text style={[styles.kicker, { color: shell.pageKicker }]}>Récompense THE LOOP</Text>
          <Text style={[styles.title, { color: shell.pageTitle }]}>Choisissez votre contenu</Text>
          <Text style={[styles.body, { color: shell.pageKicker }]}>
            {rewardLabel} — sélectionnez l'événement, spot ou outil concerné.
          </Text>

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {items.map((item) => (
              <Pressable
                key={`${item.kind}-${item.id}`}
                style={[styles.row, { borderColor: shell.filterInactiveBorder }]}
                onPress={() => onPick(item)}
              >
                <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>{item.title}</Text>
                <Text style={{ color: shell.pageKicker, fontSize: 11, marginTop: 4 }}>
                  {item.kind === 'event' ? 'Événement' : item.kind === 'tool' ? 'Outil' : 'Spot'}
                  {item.subtitle ? ` · ${item.subtitle}` : ''}
                </Text>
              </Pressable>
            ))}
            {items.length === 0 ? (
              <Text style={[styles.empty, { color: shell.pageKicker }]}>
                Aucun contenu publié. Publiez d'abord un événement, spot ou outil.
              </Text>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 20, borderWidth: 1, padding: 20, maxHeight: '80%' },
  closeBtn: { position: 'absolute', top: 14, right: 14, zIndex: 2 },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 6, fontSize: 20, fontWeight: '800' },
  body: { marginTop: 8, fontSize: 13, lineHeight: 20 },
  list: { marginTop: 16, maxHeight: 320 },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  empty: { fontSize: 12, fontStyle: 'italic', textAlign: 'center', paddingVertical: 16 },
});
