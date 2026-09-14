import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useContentCountries } from '@/context/ContentCountriesContext';
import { COUNTRY_LABELS, LOOP_COUNTRIES } from '@/lib/countries';
import type { ShellTheme } from '@/lib/member-grade-theme';
import { ADMIN_THEME } from '@/components/admin/AdminShell';

interface Props {
  shell: ShellTheme;
  compact?: boolean;
}

export function AdminCountryBar({ shell, compact }: Props) {
  const { countryCode, countryLabel, setCountryCode } = useAdminCountry();
  const { enabledCountries } = useContentCountries();
  const [open, setOpen] = useState(false);

  const pilotCountries = LOOP_COUNTRIES.filter((c) => enabledCountries.includes(c.code));
  const readOnly = pilotCountries.length <= 1;

  return (
    <>
      <Pressable
        style={[
          styles.bar,
          compact && styles.barCompact,
          { borderColor: ADMIN_THEME.accent + '55', backgroundColor: ADMIN_THEME.glow },
        ]}
        onPress={() => !readOnly && setOpen(true)}
        disabled={readOnly}
      >
        <Text style={[styles.kicker, { color: shell.pageKicker }]}>Pays piloté</Text>
        <Text style={[styles.value, { color: shell.pageTitle }]}>
          {countryLabel}
          {readOnly ? '' : ' ▾'}
        </Text>
      </Pressable>

      <Modal visible={open && !readOnly} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.sheetTitle, { color: shell.pageTitle }]}>Control Tower — pays</Text>
            <Text style={[styles.sheetHint, { color: shell.pageKicker }]}>
              Tous les modules admin (contenu, utilisateurs, partenariats, push…) sont limités à ce pays.
            </Text>
            <ScrollView style={styles.list}>
              {pilotCountries.map((c) => (
                <Pressable
                  key={c.code}
                  style={[
                    styles.row,
                    { borderBottomColor: shell.filterInactiveBorder },
                    countryCode === c.code && { backgroundColor: ADMIN_THEME.glow },
                  ]}
                  onPress={() => {
                    void setCountryCode(c.code);
                    setOpen(false);
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{c.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>{COUNTRY_LABELS[c.code]}</Text>
                    <Text style={{ color: shell.pageKicker, fontSize: 11 }}>{c.code}</Text>
                  </View>
                  {countryCode === c.code ? (
                    <Text style={{ color: ADMIN_THEME.accent, fontWeight: '800' }}>✓</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  barCompact: { marginBottom: 8, paddingVertical: 8 },
  kicker: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  value: { fontSize: 13, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  sheet: { borderWidth: 1, borderRadius: 16, maxHeight: '75%', paddingBottom: 8 },
  sheetTitle: { fontSize: 17, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16 },
  sheetHint: { fontSize: 11, lineHeight: 16, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8 },
  list: { maxHeight: 360 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
