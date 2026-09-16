import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Contraste lecture longue — indépendant du thème Auth. */
const LEGAL_READING = {
  cardBg: '#FFFFFF',
  cardBorder: '#CBD5E1',
  title: '#111827',
  body: '#1F2937',
  bodyBg: '#F8FAFC',
  bodyBorder: '#E2E8F0',
  backdrop: 'rgba(15, 23, 42, 0.78)',
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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
          >
            <Text style={styles.closeLink}>Fermer</Text>
          </Pressable>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.bodyPanel}>
            <Text style={styles.body} selectable>
              {body}
            </Text>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            style={[styles.btn, { backgroundColor: accentBg }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fermer le document"
          >
            <Text style={[styles.btnText, { color: accentText }]}>J&apos;ai lu</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: LEGAL_READING.cardBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: LEGAL_READING.bodyBorder,
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: LEGAL_READING.title,
    lineHeight: 26,
  },
  closeLink: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2563EB',
    paddingTop: 2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  bodyPanel: {
    borderWidth: 1,
    borderColor: LEGAL_READING.bodyBorder,
    borderRadius: 12,
    backgroundColor: LEGAL_READING.bodyBg,
    padding: 16,
  },
  body: {
    fontSize: 16,
    lineHeight: 26,
    color: LEGAL_READING.body,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: LEGAL_READING.bodyBorder,
  },
  btn: {
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
    fontSize: 16,
    textAlign: 'center',
  },
});
