import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { requestAccountDeletion } from '@/lib/account-deletion-store';
import { formatDateFr } from '@/lib/date-utils';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP_URL } from '@/lib/support-contact';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type SheetState =
  | { step: 'confirm' }
  | { step: 'sending' }
  | { step: 'sent'; alreadyPending: boolean; createdAt: string | null }
  | { step: 'error'; message: string };

export function CloseAccountSheet({ visible, onClose }: Props) {
  const { shell } = useMemberTheme();
  const [state, setState] = useState<SheetState>({ step: 'confirm' });

  useEffect(() => {
    if (visible) setState({ step: 'confirm' });
  }, [visible]);

  async function sendRequest() {
    setState({ step: 'sending' });
    const res = await requestAccountDeletion();
    if (res.ok) {
      setState({ step: 'sent', alreadyPending: res.alreadyPending, createdAt: res.createdAt });
    } else {
      setState({ step: 'error', message: res.error });
    }
  }

  const sending = state.step === 'sending';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={sending ? undefined : onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}
          onPress={(e) => e.stopPropagation()}
        >
          {!sending ? (
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
              <Text style={[styles.closeText, { color: shell.pageKicker }]}>✕</Text>
            </Pressable>
          ) : null}

          <Text style={[styles.kicker, { color: shell.pageKicker }]}>Mon compte</Text>
          <Text style={[styles.title, { color: shell.pageTitle }]}>Fermer mon compte</Text>

          {state.step === 'sent' ? (
            <>
              <Text style={[styles.body, { color: shell.pageKicker }]}>
                {state.alreadyPending
                  ? `Une demande est déjà en cours${state.createdAt ? ` (envoyée le ${formatDateFr(state.createdAt)})` : ''}. `
                  : 'Votre demande a bien été envoyée. '}
                Votre compte et vos données personnelles seront supprimés sous 30 jours maximum. Nous pouvons
                vous recontacter pour confirmer votre identité.
              </Text>
              <Pressable style={[styles.primary, { backgroundColor: shell.filterActiveBg }]} onPress={onClose}>
                <Text style={[styles.primaryText, { color: shell.filterActiveText }]}>Fermer</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.body, { color: shell.pageKicker }]}>
                La suppression efface votre profil, votre carte membre, vos favoris, vos privilèges et votre
                historique. Certaines données de paiement peuvent être conservées si la loi l’exige.
              </Text>
              <Text style={[styles.body, { color: shell.pageKicker }]}>
                La demande est traitée par l’équipe THE LOOP sous 30 jours maximum.
              </Text>

              {state.step === 'error' ? (
                <Text style={[styles.error, { color: '#D14343' }]}>{state.message}</Text>
              ) : null}

              <Pressable
                style={[styles.danger, sending && styles.disabled]}
                onPress={() => void sendRequest()}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.dangerText}>Demander la suppression</Text>
                )}
              </Pressable>
              <Pressable
                style={[styles.secondary, { borderColor: shell.filterInactiveBorder }]}
                onPress={() => void Linking.openURL(SUPPORT_WHATSAPP_URL)}
                disabled={sending}
              >
                <Text style={[styles.secondaryText, { color: shell.pageTitle }]}>Contacter le support</Text>
              </Pressable>
              <Text style={[styles.footnote, { color: shell.pageKicker }]}>
                Ou par e-mail : {SUPPORT_EMAIL}
              </Text>
            </>
          )}
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
  error: { marginTop: 12, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  primary: { marginTop: 24, paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  primaryText: { fontWeight: '800', fontSize: 14 },
  danger: {
    marginTop: 24,
    minHeight: 50,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#B42318',
  },
  dangerText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.6 },
  secondary: { marginTop: 10, paddingVertical: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  secondaryText: { fontWeight: '700', fontSize: 13 },
  footnote: { marginTop: 12, fontSize: 12, textAlign: 'center' },
});
