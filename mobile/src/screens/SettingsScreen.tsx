import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChangePasswordSection } from '@/components/ChangePasswordSection';
import { CountrySelectField } from '@/components/CountrySelectField';
import { LegalPreviewModal } from '@/components/LegalPreviewModal';
import { useAppLocale } from '@/context/AppLocaleContext';
import { useAuthContext } from '@/context/AuthContext';
import { useContentCountries } from '@/context/ContentCountriesContext';
import { useViewingCountry } from '@/context/ViewingCountryContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { openAccountDeletionRequest } from '@/lib/account-deletion';
import type { AppLocale } from '@/lib/app-locale-store';
import { getAppVersionLabel } from '@/lib/app-version-info';
import { DEFAULT_COUNTRY_CODE, getCountryLabel, type CountryCode } from '@/lib/countries';
import { formatLegalBodyForDisplay } from '@/lib/legal-display';
import { getLegalContent, type LegalContentKey } from '@/lib/legal-content-store';
import {
  getNotificationPreferences,
  PUSH_CATEGORY_LABELS,
  saveNotificationPreferences,
  type NotificationPreferences,
  type PushNotificationCategory,
} from '@/lib/notification-preferences-store';
import {
  registerForPushNotifications,
  unregisterPushTokenForDevice,
} from '@/lib/push-notifications';
import { settingsCopy } from '@/lib/settings-copy';
import { isSupabaseConfigured } from '@/lib/supabase';
import { SUPPORT_EMAIL_URL } from '@/lib/support-contact';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

const PUSH_CATEGORIES: PushNotificationCategory[] = ['agenda', 'privileges', 'community', 'account'];

export function SettingsScreen({ navigation }: Props) {
  const { user } = useAuthContext();
  const { shell } = useMemberTheme();
  const { locale, setLocale } = useAppLocale();
  const { enabledCountries } = useContentCountries();
  const {
    viewingCountryCode,
    setViewingCountryCode,
    countries,
    isExploringOtherCountry,
  } = useViewingCountry();
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [legalPreviewKey, setLegalPreviewKey] = useState<LegalContentKey | null>(null);
  const [legalPreviewTitle, setLegalPreviewTitle] = useState('');
  const [legalPreviewBody, setLegalPreviewBody] = useState('');

  const t = useCallback((key: Parameters<typeof settingsCopy>[1]) => settingsCopy(locale, key), [locale]);
  const isLoggedIn = Boolean(user && user.id !== 'anonymous');
  const accountCountry = (user?.countryCode ?? DEFAULT_COUNTRY_CODE) as CountryCode;
  const exploreEnabled = isExploringOtherCountry;
  const multiCountry = countries.length > 1;
  const interestCountries = countries.filter((c) => c !== accountCountry);
  const appVersion = getAppVersionLabel();

  useEffect(() => {
    void getNotificationPreferences().then(setPrefs);
  }, []);

  const persistPrefs = useCallback(async (next: NotificationPreferences) => {
    setPrefs(next);
    await saveNotificationPreferences(next);
    if (!user?.id || user.id === 'anonymous') return;
    if (next.pushEnabled) {
      await registerForPushNotifications(user.id);
    } else {
      await unregisterPushTokenForDevice();
    }
  }, [user?.id]);

  const handleToggleExplore = useCallback(async (enabled: boolean) => {
    setSaving(true);
    try {
      if (!enabled) {
        await setViewingCountryCode(accountCountry);
        return;
      }
      const fallback = interestCountries[0] ?? countries[0];
      if (fallback) await setViewingCountryCode(fallback);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }, [accountCountry, countries, interestCountries, setViewingCountryCode]);

  const handleInterestChange = useCallback(async (code: CountryCode) => {
    setSaving(true);
    try {
      await setViewingCountryCode(code);
    } catch (err) {
      Alert.alert('Erreur', err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  }, [setViewingCountryCode]);

  const openLegal = useCallback(async (key: LegalContentKey, fallbackTitle: string) => {
    const content = await getLegalContent(key);
    setLegalPreviewTitle(content.title || fallbackTitle);
    setLegalPreviewBody(formatLegalBodyForDisplay(content.body));
    setLegalPreviewKey(key);
  }, []);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(t('deleteConfirmTitle'), t('deleteConfirmBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('deleteConfirmAction'),
        style: 'destructive',
        onPress: () => {
          void openAccountDeletionRequest({
            email: user?.email,
            id: user?.id,
            firstName: user?.firstName,
            lastName: user?.lastName,
          }).then((ok) => {
            if (!ok) Alert.alert('Erreur', t('deleteMailFail'));
          });
        },
      },
    ]);
  }, [t, user?.email, user?.firstName, user?.id, user?.lastName]);

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
        <Text style={[styles.kicker, { color: shell.pageKicker }]}>{t('kicker')}</Text>
        <Text style={[styles.title, { color: shell.pageTitle }]}>{t('title')}</Text>

        {isLoggedIn ? (
          <>
            <Text style={[styles.section, { color: shell.pageKicker }]}>{t('sectionAccount')}</Text>
            <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
              <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>{t('emailLabel')}</Text>
              <Text style={[styles.fieldValue, { color: shell.pageTitle }]} selectable>
                {user?.email ?? '—'}
              </Text>
              <Text style={[styles.fieldLabel, { color: shell.pageKicker, marginTop: 12 }]}>{t('phoneLabel')}</Text>
              <Text style={[styles.fieldValue, { color: shell.pageTitle }]}>
                {user?.phoneNumber?.trim() ? user.phoneNumber : '—'}
              </Text>
              <Text style={[styles.note, { color: shell.pageKicker, marginTop: 6 }]}>{t('phoneHint')}</Text>
              <Pressable
                style={[styles.linkBtn, { borderColor: shell.filterInactiveBorder }]}
                onPress={() => navigation.navigate('EditProfil')}
              >
                <Text style={[styles.linkBtnText, { color: shell.tabIndicator }]}>{t('editProfile')}</Text>
              </Pressable>
            </View>

            {isSupabaseConfigured() ? (
              <>
                <Text style={[styles.section, { color: shell.pageKicker }]}>{t('sectionPassword')}</Text>
                <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
                  <ChangePasswordSection
                    shell={shell}
                    labels={
                      locale === 'en'
                        ? {
                            current: 'Current password',
                            next: 'New password',
                            confirm: 'Confirm password',
                            action: 'Change password',
                            saving: 'Saving…',
                          }
                        : undefined
                    }
                  />
                </View>
              </>
            ) : null}

            <Text style={[styles.section, { color: shell.pageKicker }]}>{t('sectionNotifications')}</Text>
            <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
              <View style={styles.switchRow}>
                <View style={styles.switchText}>
                  <Text style={[styles.cardLabel, { color: shell.pageTitle }]}>{t('pushMaster')}</Text>
                  <Text style={[styles.cardHint, { color: shell.pageKicker }]}>{t('pushMasterHint')}</Text>
                </View>
                <Switch
                  value={prefs?.pushEnabled !== false}
                  onValueChange={(value) => {
                    if (!prefs) return;
                    void persistPrefs({ ...prefs, pushEnabled: value });
                  }}
                  trackColor={{ false: shell.filterInactiveBorder, true: shell.tabIndicator }}
                />
              </View>
              <Text style={[styles.cardHint, { color: shell.pageKicker, marginTop: 12 }]}>{t('pushCategoriesHint')}</Text>
              {PUSH_CATEGORIES.map((category) => {
                const meta = PUSH_CATEGORY_LABELS[category];
                const label = locale === 'en' ? meta.en : meta.fr;
                const hint = locale === 'en' ? meta.hint.en : meta.hint.fr;
                return (
                  <View key={category} style={[styles.categoryRow, { borderTopColor: shell.filterInactiveBorder }]}>
                    <View style={styles.switchText}>
                      <Text style={[styles.cardLabel, { color: shell.pageTitle }]}>{label}</Text>
                      <Text style={[styles.cardHint, { color: shell.pageKicker }]}>{hint}</Text>
                    </View>
                    <Switch
                      value={prefs?.categories[category] !== false}
                      disabled={prefs?.pushEnabled === false}
                      onValueChange={(value) => {
                        if (!prefs) return;
                        void persistPrefs({
                          ...prefs,
                          categories: { ...prefs.categories, [category]: value },
                        });
                      }}
                      trackColor={{ false: shell.filterInactiveBorder, true: shell.tabIndicator }}
                    />
                  </View>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={[styles.section, { color: shell.pageKicker }]}>{t('sectionCountry')}</Text>
        <CountrySelectField
          value={accountCountry}
          onChange={() => {}}
          shell={shell}
          label={t('accountCountry')}
          countries={enabledCountries}
          readOnly
        />
        <Text style={[styles.note, { color: shell.pageKicker }]}>{t('accountCountryNote')}</Text>

        {isLoggedIn ? (
          <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={[styles.cardLabel, { color: shell.pageKicker }]}>{t('exploreCountry')}</Text>
                <Text style={[styles.cardHint, { color: shell.pageKicker, marginTop: 4 }]}>{t('exploreCountryHint')}</Text>
              </View>
              <Switch
                value={exploreEnabled}
                onValueChange={(v) => void handleToggleExplore(v)}
                disabled={saving || !multiCountry || interestCountries.length === 0}
                trackColor={{ false: shell.filterInactiveBorder, true: shell.tabIndicator }}
              />
            </View>
            {!multiCountry || interestCountries.length === 0 ? (
              <Text style={[styles.cardHint, { color: shell.pageKicker, marginTop: 8 }]}>{t('exploreUnavailable')}</Text>
            ) : null}
            {exploreEnabled && multiCountry && interestCountries.length > 0 ? (
              <CountrySelectField
                value={viewingCountryCode}
                onChange={(code) => void handleInterestChange(code)}
                shell={shell}
                label={t('interestCountry')}
                countries={interestCountries}
              />
            ) : (
              <Text style={[styles.fieldValue, { color: shell.pageTitle, marginTop: 8 }]}>
                {t('displayedContent')} : {getCountryLabel(viewingCountryCode)}
              </Text>
            )}
          </View>
        ) : (
          <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
            <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>{t('displayedContent')}</Text>
            <Text style={[styles.fieldValue, { color: shell.pageTitle }]}>{getCountryLabel(viewingCountryCode)}</Text>
          </View>
        )}

        <Text style={[styles.section, { color: shell.pageKicker }]}>{t('sectionLanguage')}</Text>
        <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
          <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>{t('languageLabel')}</Text>
          <View style={styles.languageRow}>
            {(['fr', 'en'] as AppLocale[]).map((code) => {
              const active = locale === code;
              return (
                <Pressable
                  key={code}
                  style={[
                    styles.languageChip,
                    {
                      borderColor: active ? shell.tabIndicator : shell.filterInactiveBorder,
                      backgroundColor: active ? shell.filterActiveBg : shell.filterInactiveBg,
                    },
                  ]}
                  onPress={() => void setLocale(code)}
                >
                  <Text style={{ color: active ? shell.filterActiveText : shell.pageTitle, fontWeight: '700' }}>
                    {code === 'fr' ? t('languageFr') : t('languageEn')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.note, { color: shell.pageKicker, marginTop: 8 }]}>{t('languageHint')}</Text>
        </View>

        <Text style={[styles.section, { color: shell.pageKicker }]}>{t('sectionLegal')}</Text>
        <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
          <Pressable style={styles.legalRow} onPress={() => void openLegal('cgu', t('legalCgu'))}>
            <Text style={[styles.legalText, { color: shell.pageTitle }]}>{t('legalCgu')}</Text>
            <Text style={[styles.chevron, { color: shell.pageKicker }]}>›</Text>
          </Pressable>
          <Pressable
            style={[styles.legalRow, styles.legalRowBorder, { borderTopColor: shell.filterInactiveBorder }]}
            onPress={() => void openLegal('privacy_policy', t('legalPrivacy'))}
          >
            <Text style={[styles.legalText, { color: shell.pageTitle }]}>{t('legalPrivacy')}</Text>
            <Text style={[styles.chevron, { color: shell.pageKicker }]}>›</Text>
          </Pressable>
          <Pressable
            style={[styles.legalRow, styles.legalRowBorder, { borderTopColor: shell.filterInactiveBorder }]}
            onPress={() => void openLegal('mentions_legales', t('legalMentions'))}
          >
            <Text style={[styles.legalText, { color: shell.pageTitle }]}>{t('legalMentions')}</Text>
            <Text style={[styles.chevron, { color: shell.pageKicker }]}>›</Text>
          </Pressable>
        </View>

        <Text style={[styles.section, { color: shell.pageKicker }]}>{t('sectionAbout')}</Text>
        <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
          <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>{t('appVersion')}</Text>
          <Text style={[styles.fieldValue, { color: shell.pageTitle }]}>{appVersion}</Text>
          <Pressable style={styles.supportLink} onPress={() => void Linking.openURL(SUPPORT_EMAIL_URL)}>
            <Text style={[styles.linkBtnText, { color: shell.tabIndicator }]}>{t('contactSupport')}</Text>
          </Pressable>
        </View>

        {isLoggedIn ? (
          <>
            <Text style={[styles.section, { color: shell.pageKicker }]}>{t('sectionDanger')}</Text>
            <View style={[styles.card, styles.dangerCard, { borderColor: '#fecaca', backgroundColor: '#fef2f2' }]}>
              <Text style={[styles.cardHint, { color: '#7f1d1d' }]}>{t('deleteAccountHint')}</Text>
              <Pressable style={styles.dangerBtn} onPress={handleDeleteAccount}>
                <Text style={styles.dangerBtnText}>{t('deleteAccount')}</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        <Pressable style={styles.btnGhost} onPress={() => navigation.goBack()}>
          <Text style={[styles.btnGhostText, { color: shell.pageKicker }]}>{t('back')}</Text>
        </Pressable>
      </ScrollView>

      <LegalPreviewModal
        visible={legalPreviewKey != null}
        title={legalPreviewTitle}
        body={legalPreviewBody}
        onClose={() => setLegalPreviewKey(null)}
        accentBg={shell.filterActiveBg}
        accentText={shell.filterActiveText}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  title: { marginTop: 4, fontSize: 22, fontWeight: '700', marginBottom: 16 },
  section: { marginTop: 8, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  note: { fontSize: 10, marginBottom: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  fieldLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  fieldValue: { marginTop: 6, fontSize: 16, fontWeight: '700' },
  cardLabel: { fontSize: 13, fontWeight: '700' },
  cardHint: { marginTop: 4, fontSize: 12, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1 },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  linkBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkBtnText: { fontWeight: '700', fontSize: 14 },
  languageRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  languageChip: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  legalRowBorder: { borderTopWidth: StyleSheet.hairlineWidth },
  legalText: { fontSize: 14, fontWeight: '600', flex: 1, paddingRight: 8 },
  chevron: { fontSize: 20, fontWeight: '300' },
  supportLink: { marginTop: 12, paddingVertical: 4 },
  dangerCard: { gap: 10 },
  dangerBtn: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: '#dc2626',
    paddingVertical: 14,
    alignItems: 'center',
  },
  dangerBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnGhost: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  btnGhostText: { fontWeight: '600' },
});
