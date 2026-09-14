import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { PHONE_DIAL_COUNTRIES, nationalPhonePlaceholder, getPhoneDialCountry, type PhoneDialCode } from '@/lib/countries';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props {
  dialCode: PhoneDialCode;
  onDialCodeChange: (code: PhoneDialCode) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  shell: ShellTheme;
  label?: string;
  hint?: string | null;
}

export function InternationalPhoneField({
  dialCode,
  onDialCodeChange,
  phone,
  onPhoneChange,
  shell,
  label = 'Numéro de téléphone',
  hint,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const country = useMemo(() => getPhoneDialCountry(dialCode), [dialCode]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: shell.pageKicker }]}>{label}</Text>

      <View style={styles.phoneRow}>
        <Pressable
          style={[styles.prefixBtn, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
          onPress={() => setPickerOpen(true)}
          accessibilityLabel="Choisir l'indicatif téléphonique"
        >
          <Text style={{ fontSize: 16 }}>{country.flag}</Text>
          <Text style={{ color: shell.pageTitle, fontWeight: '700', fontSize: 13 }}>+{country.callingCode}</Text>
          <Text style={{ color: shell.pageKicker, fontSize: 10 }}>▾</Text>
        </Pressable>
        <TextInput
          style={[styles.phoneInput, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg, color: shell.pageTitle }]}
          value={phone}
          onChangeText={onPhoneChange}
          placeholder={nationalPhonePlaceholder(dialCode)}
          placeholderTextColor={shell.pageKicker}
          keyboardType="phone-pad"
        />
      </View>

      {hint ? (
        <Text style={[styles.hint, { color: shell.pageKicker }]}>{hint}</Text>
      ) : null}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>Indicatif téléphonique</Text>
            <ScrollView style={styles.modalList}>
              {PHONE_DIAL_COUNTRIES.map((c) => (
                <Pressable
                  key={c.code}
                  style={[
                    styles.modalRow,
                    { borderBottomColor: shell.filterInactiveBorder },
                    dialCode === c.code && { backgroundColor: shell.filterActiveBg },
                  ]}
                  onPress={() => {
                    onDialCodeChange(c.code);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{c.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: shell.pageTitle, fontWeight: '700', fontSize: 14 }}>{c.name}</Text>
                    <Text style={{ color: shell.pageKicker, fontSize: 11 }}>+{c.callingCode}</Text>
                  </View>
                  {dialCode === c.code ? (
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
  hint: { marginTop: 6, fontSize: 11, lineHeight: 16 },
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
