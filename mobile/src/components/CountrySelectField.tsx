import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCountry, getCountryName, LOOP_COUNTRIES, type CountryCode } from '@/lib/countries';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props {
  value: CountryCode;
  onChange: (code: CountryCode) => void;
  shell: ShellTheme;
  label?: string;
  /** Sous-ensemble de pays affichés (ex. pays activés pour le contenu). */
  countries?: CountryCode[];
  readOnly?: boolean;
  placeholder?: string;
}

export function CountrySelectField({
  value,
  onChange,
  shell,
  label = 'Pays',
  countries,
  readOnly,
  placeholder = 'Choisir un pays',
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const list = useMemo(
    () =>
      countries?.length
        ? LOOP_COUNTRIES.filter((c) => countries.includes(c.code))
        : LOOP_COUNTRIES,
    [countries],
  );

  const selected = getCountry(value);

  if (readOnly || list.length <= 1) {
    const c = list.find((item) => item.code === value) ?? list[0] ?? LOOP_COUNTRIES[0];
    return (
      <View style={styles.wrap}>
        <Text style={[styles.label, { color: shell.pageKicker }]}>{label}</Text>
        <Text style={[styles.readOnlyValue, { color: shell.pageTitle }]}>
          {c.flag} {c.name}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: shell.pageKicker }]}>{label}</Text>
      <Pressable
        style={[styles.trigger, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
        onPress={() => setPickerOpen(true)}
        accessibilityLabel={label}
      >
        <Text style={{ fontSize: 18 }}>{selected.flag}</Text>
        <Text style={[styles.triggerText, { color: shell.pageTitle }]}>{getCountryName(value)}</Text>
        <Text style={[styles.chevron, { color: shell.pageKicker }]}>▾</Text>
      </Pressable>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>{label || placeholder}</Text>
            <ScrollView style={styles.modalList}>
              {list.map((c) => (
                <Pressable
                  key={c.code}
                  style={[
                    styles.modalRow,
                    { borderBottomColor: shell.filterInactiveBorder },
                    value === c.code && { backgroundColor: shell.filterActiveBg },
                  ]}
                  onPress={() => {
                    onChange(c.code);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{c.flag}</Text>
                  <Text style={[styles.modalRowLabel, { color: shell.pageTitle }]}>{c.name}</Text>
                  {value === c.code ? (
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
  wrap: { marginBottom: 10 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 4 },
  readOnlyValue: { fontSize: 14, fontWeight: '700' },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  triggerText: { flex: 1, fontSize: 14, fontWeight: '700' },
  chevron: { fontSize: 12 },
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
  modalRowLabel: { flex: 1, fontWeight: '700', fontSize: 14 },
});
