import { useState } from 'react';
import { StyleSheet, type TextInputProps } from 'react-native';
import { KeyboardSafeTextInput } from '@/components/KeyboardSafeTextInput';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props extends TextInputProps {
  shell: ShellTheme;
  /** Couleur de bordure au focus (admin = bleu, partenaire = vert). */
  accentColor?: string;
}

export function FormTextInput({ shell, accentColor, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const accent = accentColor ?? shell.tabIndicator ?? '#10b981';

  return (
    <KeyboardSafeTextInput
      {...rest}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        styles.input,
        {
          backgroundColor: focused ? shell.pageBg : shell.filterInactiveBg,
          borderColor: focused ? accent : shell.filterInactiveBorder,
          borderWidth: focused ? 2 : 1,
          color: shell.pageTitle,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    fontSize: 15,
  },
});
