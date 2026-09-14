import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props {
  visible: boolean;
  shell: ShellTheme;
  onClose: () => void;
  onEvent?: () => void;
  onSpot?: () => void;
  onTool?: () => void;
}

export function PartnerSubmissionChoiceModal({ visible, shell, onClose, onEvent, onSpot, onTool }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.kicker, { color: shell.pageKicker }]}>Nouvelle soumission</Text>
          <Text style={[styles.title, { color: shell.pageTitle }]}>Que souhaitez-vous créer ?</Text>
          <Text style={[styles.body, { color: shell.pageKicker }]}>
            Choisissez le type de contenu à soumettre à la modération THE LOOP.
          </Text>

          {onEvent ? (
            <Pressable style={[styles.choice, { borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.12)' }]} onPress={onEvent}>
              <Text style={styles.choiceIcon}>📅</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.choiceTitle, { color: shell.pageTitle }]}>Événement</Text>
                <Text style={[styles.choiceMeta, { color: shell.pageKicker }]}>Agenda, dates, billetterie</Text>
              </View>
            </Pressable>
          ) : null}

          {onSpot ? (
            <Pressable style={[styles.choice, { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.12)' }]} onPress={onSpot}>
              <Text style={styles.choiceIcon}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.choiceTitle, { color: shell.pageTitle }]}>Spot</Text>
                <Text style={[styles.choiceMeta, { color: shell.pageKicker }]}>Lieu, adresse, ambiance</Text>
              </View>
            </Pressable>
          ) : null}

          {onTool ? (
            <Pressable style={[styles.choice, { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.12)' }]} onPress={onTool}>
              <Text style={styles.choiceIcon}>🛠</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.choiceTitle, { color: shell.pageTitle }]}>Outil</Text>
                <Text style={[styles.choiceMeta, { color: shell.pageKicker }]}>Service utile pour les membres</Text>
              </View>
            </Pressable>
          ) : null}

          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={{ color: shell.pageKicker, fontWeight: '700' }}>Annuler</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  sheet: { borderWidth: 1, borderRadius: 20, padding: 20 },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 6, fontSize: 20, fontWeight: '800' },
  body: { marginTop: 8, fontSize: 13, lineHeight: 20 },
  choice: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14 },
  choiceIcon: { fontSize: 22 },
  choiceTitle: { fontWeight: '800', fontSize: 15 },
  choiceMeta: { marginTop: 2, fontSize: 11 },
  cancel: { marginTop: 16, alignItems: 'center', paddingVertical: 10 },
});
