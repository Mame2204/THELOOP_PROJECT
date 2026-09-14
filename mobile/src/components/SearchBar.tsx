import { StyleSheet, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { colors } from '@/theme/colors';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  dark?: boolean;
  accentColor?: string;
  accentSoft?: string;
  borderColor?: string;
  autoFocus?: boolean;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Rechercher…',
  dark = false,
  accentColor,
  accentSoft,
  borderColor,
  autoFocus = false,
}: SearchBarProps) {
  const themed = Boolean(accentColor);
  return (
    <View style={styles.wrap}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={dark ? '#737373' : colors.publicMuted}
        autoFocus={autoFocus}
        style={[
          styles.input,
          dark && styles.inputDark,
          themed && {
            borderColor: borderColor ?? accentColor,
            backgroundColor: accentSoft ?? '#FFFFFF',
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: 4, paddingBottom: 4, width: '100%' },
  input: {
    width: '100%',
    borderWidth: 1.5,
    borderColor: colors.publicBorder,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.publicText,
  },
  inputDark: {
    borderColor: '#404040',
    backgroundColor: '#171717',
    color: '#f5f5f5',
  },
});
