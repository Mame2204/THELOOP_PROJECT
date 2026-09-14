import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import {
  COUNTRY_LABELS,
  LOOP_COUNTRIES,
  getCountry,
  phoneHint,
  type CountryCode,
} from '@/lib/countries';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props {
  countryCode: CountryCode;
  onCountryChange: (code: CountryCode) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  shell: ShellTheme;
  label?: string;
}

export function CountryPhoneField({
  countryCode,
  onCountryChange,
  phone,
  onPhoneChange,
  shell,
  label = 'Téléphone',
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const country = useMemo(() => getCountry(countryCode), [countryCode]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: shell.pageKicker }]}>{label}</Text>

      <View style={styles.phoneRow}>
        <Pressable
          style={[styles.prefixBtn, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
          onPress={() => setPickerOpen(true)}
          accessibilityLabel="Choisir l'indicatif pays"
        >
          <Text style={{ fontSize: 16 }}>{country.flag}</Text>
          <Text style={{ color: shell.pageTitle, fontWeight: '700', fontSize: 13 }}>+{country.callingCode}</Text>
          <Text style={{ color: shell.pageKicker, fontSize: 10 }}>▾</Text>
        </Pressable>
        <TextInput
          style={[styles.phoneInput, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg, color: shell.pageTitle }]}
          value={phone}
          onChangeText={onPhoneChange}
          placeholder={phoneHint(countryCode).replace(`+${country.callingCode} `, '')}
          placeholderTextColor={shell.pageKicker}
          keyboardType="phone-pad"
        />
      </View>

      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        Pays du compte : {country.flag} {country.name}
      </Text>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>Indicatif pays</Text>
            <ScrollView style={styles.modalList}>
              {LOOP_COUNTRIES.map((c) => (
                <Pressable
                  key={c.code}
                  style={[
                    styles.modalRow,
                    { borderBottomColor: shell.filterInactiveBorder },
                    countryCode === c.code && { backgroundColor: shell.filterActiveBg },
                  ]}
                  onPress={() => {
                    onCountryChange(c.code);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{c.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: shell.pageTitle, fontWeight: '700', fontSize: 14 }}>{COUNTRY_LABELS[c.code]}</Text>
                    <Text style={{ color: shell.pageKicker, fontSize: 11 }}>+{c.callingCode}</Text>
                  </View>
                  {countryCode === c.code ? (
                    <Text style={{ color: shell.filterActiveText, fontWeight: '800' }}>✓</Text>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  phoneRow: { flexDirection: 'row', gap: 8 },
  prefixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    minWidth: 108,
  },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 14,
  },
  hint: { marginTop: 6, fontSize: 11 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalSheet: {
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalList: { maxHeight: 360 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
