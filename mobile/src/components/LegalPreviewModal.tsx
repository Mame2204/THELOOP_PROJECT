import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';

/** Contraste lecture longue — indépendant du thème Auth (évite fond/teintes trop proches). */
const LEGAL_READING = {
  cardBg: '#FFFFFF',
  cardBorder: '#CBD5E1',
  title: '#111827',
  body: '#1F2937',
  bodyBg: '#F8FAFC',
  bodyBorder: '#E2E8F0',
  backdrop: 'rgba(15, 23, 42, 0.72)',
} as const;

interface LegalPreviewModalProps {
  visible: boolean;
  title: string;
  body: string;
  onClose: () => void;
  accentBg: string;
  accentText: string;
}

export function LegalPreviewModal({
  visible,
  title,
  body,
  onClose,
  accentBg,
  accentText,
}: LegalPreviewModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <KeyboardAwareFormScroll style={styles.scroll}>
            <View style={styles.bodyPanel}>
              <Text style={styles.body} selectable>
                {body}
              </Text>
            </View>
          </KeyboardAwareFormScroll>
          <Pressable
            style={[styles.btn, { backgroundColor: accentBg }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <Text style={[styles.btnText, { color: accentText }]}>Fermer</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: LEGAL_READING.backdrop,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    maxHeight: '88%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: LEGAL_READING.cardBorder,
    backgroundColor: LEGAL_READING.cardBg,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: LEGAL_READING.title,
    marginBottom: 12,
    lineHeight: 24,
  },
  scroll: {
    maxHeight: 420,
  },
  bodyPanel: {
    borderWidth: 1,
    borderColor: LEGAL_READING.bodyBorder,
    borderRadius: 12,
    backgroundColor: LEGAL_READING.bodyBg,
    padding: 14,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: LEGAL_READING.body,
  },
  btn: {
    marginTop: 14,
    width: '100%',
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontWeight: '700',
    fontSize: 15,
    textAlign: 'center',
  },
});
