import { StyleSheet, Text, View } from 'react-native';

interface MonthSeparatorProps {
  label: string;
  color: string;
  lineColor: string;
}

export function MonthSeparator({ label, color, lineColor }: MonthSeparatorProps) {
  return (
    <View style={styles.row}>
      <View style={[styles.line, { backgroundColor: lineColor }]} />
      <Text style={[styles.label, { color }]}>{label}</Text>
      <View style={[styles.line, { backgroundColor: lineColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 10,
  },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
