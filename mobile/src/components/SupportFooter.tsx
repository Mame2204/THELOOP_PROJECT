import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAppSettings } from '@/context/AppSettingsContext';
import { ContactChoiceSheet } from '@/components/ContactChoiceSheet';
import { COMMUNITY_CONTACT_CTA, COMMUNITY_PARTNERSHIP_CTA } from '@/lib/community-copy';
import { openExternalUrl } from '@/lib/open-external-url';
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_URL,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_TEL_URL,
  SUPPORT_WEBSITE_DISPLAY,
  SUPPORT_WEBSITE_URL,
} from '@/lib/support-contact';
import type { RootStackParamList } from '@/navigation/types';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface SupportFooterProps {
  shell: ShellTheme;
  showPartnership?: boolean;
}

export function SupportFooter({ shell, showPartnership = false }: SupportFooterProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { settings } = useAppSettings();
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <View style={styles.contactWrap}>
        <Text style={[styles.contactPrefix, { color: shell.pageKicker }]}>Besoin d'aide ?</Text>
        <Pressable onPress={() => setContactOpen(true)} hitSlop={8}>
          <Text style={[styles.contactLink, { color: shell.tabIndicator }]}>{COMMUNITY_CONTACT_CTA}</Text>
        </Pressable>
      </View>

      <View style={styles.coords}>
        <Pressable onPress={() => void openExternalUrl(SUPPORT_WEBSITE_URL)} hitSlop={6}>
          <Text style={[styles.coordLine, { color: shell.pageKicker }]}>{SUPPORT_WEBSITE_DISPLAY}</Text>
        </Pressable>
        <Pressable onPress={() => void openExternalUrl(SUPPORT_EMAIL_URL)} hitSlop={6}>
          <Text style={[styles.coordLine, { color: shell.pageKicker }]}>{SUPPORT_EMAIL}</Text>
        </Pressable>
        <Pressable onPress={() => void openExternalUrl(SUPPORT_PHONE_TEL_URL)} hitSlop={6}>
          <Text style={[styles.coordLine, { color: shell.pageKicker }]}>{SUPPORT_PHONE_DISPLAY}</Text>
        </Pressable>
      </View>

      {showPartnership ? (
        <Pressable style={styles.footerLink} onPress={() => navigation.navigate('PartnerApply')}>
          <Text style={[styles.footerLinkText, { color: shell.tabIndicator }]}>{COMMUNITY_PARTNERSHIP_CTA}</Text>
        </Pressable>
      ) : null}

      <ContactChoiceSheet
        visible={contactOpen}
        onClose={() => setContactOpen(false)}
        onSuggestion={() => {
          if (!settings.showCommunitySuggestion) {
            setContactOpen(false);
            return;
          }
          navigation.navigate('Suggestion');
        }}
        shell={shell}
        showSuggestion={settings.showCommunitySuggestion}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 28, marginBottom: 8, alignItems: 'center', paddingVertical: 16 },
  contactWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 6,
  },
  contactPrefix: { fontSize: 13 },
  contactLink: { fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  coords: { marginTop: 10, alignItems: 'center', gap: 4 },
  coordLine: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  footerLink: { marginTop: 10, paddingVertical: 6, paddingHorizontal: 12 },
  footerLinkText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
