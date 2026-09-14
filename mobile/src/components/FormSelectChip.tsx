import { Pressable, StyleSheet, Text } from 'react-native';
import type { ShellTheme } from '@/lib/member-grade-theme';
import { ADMIN_THEME } from '@/components/admin/AdminShell';

const TOOL_ACCENT = '#10b981';

interface Props {
  label: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
  shell: ShellTheme;
  /** Admin bordeaux, partenaire vert primaire. Variant `tool` = même accent que primary (rôle). */
  variant?: 'primary' | 'admin' | 'tool';
  /** Surcharge la couleur d'accent (prioritaire sur variant). */
  accentColor?: string;
  /** md = plus grand (types de lieu, actions). */
  size?: 'sm' | 'md';
}

function resolveAccent(variant: Props['variant'], shell: ShellTheme, accentColor?: string): string {
  if (accentColor) return accentColor;
  if (variant === 'admin') return ADMIN_THEME.accent;
  if (variant === 'tool') return shell.filterActiveBg || TOOL_ACCENT;
  return shell.filterActiveBg || '#10b981';
}

export function FormSelectChip({
  label,
  emoji,
  selected,
  onPress,
  shell,
  variant = 'primary',
  accentColor,
  size = 'sm',
}: Props) {
  const accent = resolveAccent(variant, shell, accentColor);
  const accentText = '#fff';
  const isMd = size === 'md';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      android_ripple={{
        color: selected ? 'rgba(255,255,255,0.35)' : `${accent}33`,
        borderless: false,
      }}
      style={({ pressed }) => [
        styles.chip,
        isMd && styles.chipMd,
        selected && styles.chipSelected,
        {
          borderColor: selected ? accent : pressed ? accent : shell.filterInactiveBorder,
          backgroundColor: selected ? accent : pressed ? `${accent}22` : shell.filterInactiveBg,
          borderWidth: selected ? 3 : 2,
          opacity: pressed && !selected ? 0.92 : 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
      onPress={onPress}
    >
      <Text
        style={{
          color: selected ? accentText : shell.pageTitle,
          fontSize: isMd ? 13 : 10,
          fontWeight: selected ? '800' : '600',
        }}
      >
        {selected ? '✓ ' : ''}
        {emoji ? `${emoji} ` : ''}
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
  },
  chipMd: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipSelected: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
});
