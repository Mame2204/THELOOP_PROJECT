import { Pressable, StyleSheet, Text, View } from 'react-native';

interface TogglePillProps {
  value: boolean;
  onChange: (next: boolean) => void;
  activeLabel?: string;
  inactiveLabel?: string;
  activeColor?: string;
  disabled?: boolean;
  shell: {
    filterInactiveBorder: string;
    pageKicker: string;
  };
}

/** Bouton Oui / Non — style actif / désactivé. */
export function TogglePill({
  value,
  onChange,
  activeLabel = 'Oui',
  inactiveLabel = 'Non',
  activeColor = '#3b82f6',
  disabled = false,
  shell,
}: TogglePillProps) {
  return (
    <View style={[styles.wrap, { borderColor: shell.filterInactiveBorder, opacity: disabled ? 0.45 : 1 }]}>
      <Pressable
        style={[styles.btn, value && { backgroundColor: activeColor }]}
        onPress={() => onChange(true)}
        disabled={disabled}
      >
        <Text style={[styles.text, { color: value ? '#fff' : shell.pageKicker }]}>{activeLabel}</Text>
      </Pressable>
      <Pressable
        style={[styles.btn, !value && { backgroundColor: '#94a3b8' }]}
        onPress={() => onChange(false)}
        disabled={disabled}
      >
        <Text style={[styles.text, { color: !value ? '#fff' : shell.pageKicker }]}>{inactiveLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden', alignSelf: 'flex-start' },
  btn: { paddingHorizontal: 16, paddingVertical: 8, minWidth: 52, alignItems: 'center' },
  text: { fontSize: 11, fontWeight: '800' },
});
