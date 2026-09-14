import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useMemberTheme } from '@/hooks/useMemberTheme';

interface FilterPillsProps<T extends string> {
  options: { value: T; label: string }[];
  active: T;
  onChange: (value: T) => void;
  activeBg?: string;
  activeText?: string;
  inactiveBg?: string;
  inactiveText?: string;
  inactiveBorder?: string;
  activeShadow?: object;
}

export function FilterPills<T extends string>({
  options,
  active,
  onChange,
  activeBg = '#000000',
  activeText = '#ffffff',
  inactiveBg = '#ffffff',
  inactiveText = '#0a0a0a',
  inactiveBorder = '#e5e7eb',
  activeShadow,
}: FilterPillsProps<T>) {
  const { theme } = useMemberTheme();
  const pillShadow = activeShadow ?? theme.elevation.pillActive;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {options.map((opt) => {
        const isActive = active === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.pill,
              isActive
                ? [{ backgroundColor: activeBg }, pillShadow]
                : { backgroundColor: inactiveBg, borderWidth: 1, borderColor: inactiveBorder },
            ]}
          >
            <Text
              style={[styles.label, { color: isActive ? activeText : inactiveText }]}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 8, gap: 8 },
  pill: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, flexShrink: 0 },
  label: { fontSize: 13, fontWeight: '600' },
});
