import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { COMMUNITY_CONTACT_SUGGESTION_CTA } from '@/lib/community-copy';
import { openExternalUrlAfterModalClose } from '@/lib/open-external-url';
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_URL,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_TEL_URL,
  SUPPORT_WEBSITE_DISPLAY,
  SUPPORT_WEBSITE_URL,
  SUPPORT_WHATSAPP_URL,
} from '@/lib/support-contact';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuggestion: () => void;
  onWhatsAppDone?: () => void;
  shell?: ShellTheme;
  showSuggestion?: boolean;
}

export function ContactChoiceSheet({
  visible,
  onClose,
  onSuggestion,
  onWhatsAppDone,
  shell: shellProp,
  showSuggestion = true,
}: Props) {
  const { shell: themeShell } = useMemberTheme();
  const shell = shellProp ?? themeShell;

  function open(url: string, after?: () => void) {
    onClose();
    openExternalUrlAfterModalClose(url);
    if (after) {
      const delay = Platform.OS === 'android' ? 320 : 0;
      if (delay > 0) {
        setTimeout(after, delay);
      } else {
        after();
      }
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        />
        <View
          style={[styles.sheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}
        >
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
            <Text style={[styles.closeText, { color: shell.pageKicker }]}>✕</Text>
          </Pressable>

          <Text style={[styles.kicker, { color: shell.pageKicker }]}>THE LOOP</Text>
          <Text style={[styles.title, { color: shell.pageTitle }]}>Nous contacter</Text>
          <Text style={[styles.body, { color: shell.pageKicker }]}>
            Site, e-mail, téléphone ou WhatsApp — à vous de choisir.
          </Text>

          <View style={styles.list}>
            <Pressable
              style={[styles.row, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
              onPress={() => open(SUPPORT_WEBSITE_URL)}
            >
              <Text style={styles.rowIcon}>🌐</Text>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: shell.pageTitle }]}>Site web</Text>
                <Text style={[styles.rowMeta, { color: shell.pageKicker }]}>{SUPPORT_WEBSITE_DISPLAY}</Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.row, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
              onPress={() => open(SUPPORT_EMAIL_URL)}
            >
              <Text style={styles.rowIcon}>✉️</Text>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: shell.pageTitle }]}>E-mail</Text>
                <Text style={[styles.rowMeta, { color: shell.pageKicker }]}>{SUPPORT_EMAIL}</Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.row, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
              onPress={() => open(SUPPORT_PHONE_TEL_URL)}
            >
              <Text style={styles.rowIcon}>📞</Text>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: shell.pageTitle }]}>Téléphone</Text>
                <Text style={[styles.rowMeta, { color: shell.pageKicker }]}>{SUPPORT_PHONE_DISPLAY}</Text>
              </View>
            </Pressable>

            <Pressable
              style={[styles.row, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
              onPress={() => open(SUPPORT_WHATSAPP_URL, onWhatsAppDone)}
            >
              <Text style={styles.rowIcon}>💬</Text>
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: shell.pageTitle }]}>WhatsApp</Text>
                <Text style={[styles.rowMeta, { color: shell.pageKicker }]}>{SUPPORT_PHONE_DISPLAY}</Text>
              </View>
            </Pressable>

            {showSuggestion ? (
              <Pressable
                style={[styles.row, { borderColor: shell.filterActiveBg, backgroundColor: shell.filterActiveBg }]}
                onPress={() => {
                  onClose();
                  onSuggestion();
                }}
              >
                <Text style={styles.rowIcon}>💡</Text>
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: shell.filterActiveText }]}>
                    {COMMUNITY_CONTACT_SUGGESTION_CTA}
                  </Text>
                  <Text style={[styles.rowMeta, { color: shell.filterActiveText, opacity: 0.85 }]}>
                    Idée événement, spot ou outil
                  </Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  sheet: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    elevation: 8,
  },
  closeBtn: { position: 'absolute', top: 16, right: 18, zIndex: 2, padding: 4 },
  closeText: { fontSize: 18, fontWeight: '300' },
  kicker: { fontSize: 10, fontWeight: '800', letterSpacing: 2.5, textTransform: 'uppercase' },
  title: { marginTop: 8, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  body: { marginTop: 10, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  list: { marginTop: 18, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  rowIcon: { fontSize: 18, width: 28, textAlign: 'center' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontWeight: '800' },
  rowMeta: { marginTop: 2, fontSize: 12 },
});
