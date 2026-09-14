import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextInputProps } from 'react-native';
import { KeyboardSafeTextInput } from '@/components/KeyboardSafeTextInput';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props extends Omit<TextInputProps, 'secureTextEntry'> {
  shell: ShellTheme;
  accentColor?: string;
  containerStyle?: object;
}

export function PasswordInput({
  shell,
  accentColor,
  style,
  containerStyle,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const accent = accentColor ?? shell.tabIndicator ?? '#10b981';

  return (
    <View style={[styles.wrap, containerStyle]}>
      <KeyboardSafeTextInput
        {...rest}
        secureTextEntry={!visible}
        autoCapitalize="none"
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
      <Pressable
        style={styles.eyeBtn}
        onPress={() => setVisible((v) => !v)}
        accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        hitSlop={8}
      >
        <Text style={[styles.eyeIcon, { color: shell.pageKicker }]}>{visible ? '🙈' : '👁'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', marginBottom: 12 },
  input: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingRight: 48,
    fontSize: 15,
  },
  eyeBtn: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeIcon: { fontSize: 18 },
});
