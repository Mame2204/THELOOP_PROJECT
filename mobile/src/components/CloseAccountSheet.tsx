import { Linking, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { notifyAdminUsers } from '@/lib/user-notifications-store';
import { SUPPORT_WHATSAPP_URL } from '@/lib/support-contact';

interface Props {
  visible: boolean;
  onClose: () => void;
  userLabel: string;
  onSent?: () => void;
}

export function CloseAccountSheet({ visible, onClose, userLabel, onSent }: Props) {
  const { shell } = useMemberTheme();

  async function sendRequest() {
    await notifyAdminUsers({
      title: 'Demande suppression compte',
      message: `${userLabel} demande la suppression de son compte.`,
    });
    onSent?.();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Text style={[styles.closeText, { color: shell.pageKicker }]}>✕</Text>
          </Pressable>

          <Text style={[styles.kicker, { color: shell.pageKicker }]}>Compte membre</Text>
          <Text style={[styles.title, { color: shell.pageTitle }]}>Fermer mon compte</Text>
          <Text style={[styles.body, { color: shell.pageKicker }]}>
            Votre demande de suppression sera traitée sous 30 jours. Nous pouvons vous recontacter pour confirmer.
          </Text>

          <Pressable
            style={[styles.primary, { backgroundColor: shell.filterActiveBg }]}
            onPress={() => void sendRequest()}
          >
            <Text style={[styles.primaryText, { color: shell.filterActiveText }]}>Envoyer la demande</Text>
          </Pressable>
          <Pressable
            style={[styles.secondary, { borderColor: shell.filterInactiveBorder }]}
            onPress={() => void Linking.openURL(SUPPORT_WHATSAPP_URL)}
          >
            <Text style={[styles.secondaryText, { color: shell.pageTitle }]}>Contacter le support</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  sheet: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  closeBtn: { position: 'absolute', top: 16, right: 18, zIndex: 2, padding: 4 },
  closeText: { fontSize: 18, fontWeight: '300' },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2.5, textTransform: 'uppercase' },
  title: { marginTop: 8, fontSize: 22, fontWeight: '800' },
  body: { marginTop: 12, fontSize: 14, lineHeight: 22 },
  primary: { marginTop: 24, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  primaryText: { fontWeight: '800', fontSize: 14 },
  secondary: { marginTop: 10, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  secondaryText: { fontWeight: '700', fontSize: 13 },
});
