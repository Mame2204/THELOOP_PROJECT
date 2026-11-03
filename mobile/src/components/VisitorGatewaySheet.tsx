import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useAppGates } from '@/context/AppGatesContext';
import { COMMUNITY_CONTACT_CTA } from '@/lib/community-copy';

interface PanelProps {
  onClose: () => void;
  onSignup: () => void;
  onLogin: () => void;
  onOpenContact: () => void;
}

/** Contenu « Rejoins le club » — affiché en écran stack (au-dessus des fiches détail iOS). */
export function VisitorGatewayPanel({ onClose, onSignup, onLogin, onOpenContact }: PanelProps) {
  const { shell } = useMemberTheme();
  const { gates } = useAppGates();
  const signupEnabled = gates.signupEnabled;

  return (
    <Pressable
      style={[styles.sheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}
      onPress={(e) => e.stopPropagation()}
    >
      <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
        <Text style={[styles.closeText, { color: shell.pageKicker }]}>✕</Text>
      </Pressable>

      <Text style={[styles.kicker, { color: shell.pageKicker }]}>THE LOOP</Text>
      <Text style={[styles.title, { color: shell.pageTitle }]}>Rejoins le club</Text>
      <Text style={[styles.body, { color: shell.pageKicker }]}>
        {signupEnabled
          ? 'Crée un compte gratuit pour sauvegarder tes favoris (événements, spots, outils) et recevoir des offres personnalisées.'
          : 'Connecte-toi pour tes favoris, les sondages et tes privilèges. L’accès membre se fait sur invitation.'}
      </Text>

      <View style={styles.accountRow}>
        {signupEnabled ? (
          <Pressable style={[styles.halfBtn, { backgroundColor: shell.filterActiveBg }]} onPress={onSignup}>
            <Text style={[styles.halfPrimaryText, { color: shell.filterActiveText }]}>
              Créer mon compte
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[
            styles.halfBtn,
            signupEnabled ? styles.halfSecondary : null,
            signupEnabled
              ? { borderColor: shell.filterInactiveBorder }
              : { backgroundColor: shell.filterActiveBg },
          ]}
          onPress={onLogin}
        >
          <Text
            style={[
              signupEnabled ? styles.halfSecondaryText : styles.halfPrimaryText,
              { color: signupEnabled ? shell.pageTitle : shell.filterActiveText },
            ]}
          >
            {signupEnabled ? 'Déjà un compte' : 'Se connecter'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.contactWrap}>
        <Text style={[styles.contactPrefix, { color: shell.pageKicker }]}>Besoin d'aide ?</Text>
        <Pressable onPress={onOpenContact} hitSlop={8}>
          <Text style={[styles.contactLink, { color: shell.tabIndicator }]}>{COMMUNITY_CONTACT_CTA}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  title: { marginTop: 8, fontSize: 24, fontWeight: '800' },
  body: { marginTop: 12, fontSize: 14, lineHeight: 22 },
  accountRow: { marginTop: 24, flexDirection: 'column', gap: 10 },
  halfBtn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  halfPrimaryText: { fontWeight: '800', fontSize: 14, textAlign: 'center' },
  halfSecondary: { borderWidth: 1 },
  halfSecondaryText: { fontWeight: '700', fontSize: 14, textAlign: 'center' },
  contactWrap: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  contactPrefix: { fontSize: 13 },
  contactLink: { fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
});
