import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { useMemberTheme } from '@/hooks/useMemberTheme';

export function ThemedStatusBar() {
  const { isDark, shell } = useMemberTheme();
  return (
    <StatusBar
      style={isDark ? 'light' : 'dark'}
      backgroundColor={shell.pageBg}
      {...(Platform.OS === 'android' ? { translucent: false } : {})}
    />
  );
}
