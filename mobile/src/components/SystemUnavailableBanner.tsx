import { StyleSheet, Text, View } from 'react-native';
import type { ShellTheme } from '@/lib/member-grade-theme';
import { SYSTEM_UNAVAILABLE_MESSAGE } from '@/lib/offline-store';

interface Props {
  shell: ShellTheme;
  compact?: boolean;
}

/** Indicateur discret — n'interrompt pas le flux (octroi, validation, navigation). */
export function SystemUnavailableBanner({ shell, compact }: Props) {
  return (
    <View
      style={[
        styles.banner,
        compact ? styles.bannerCompact : null,
        { borderColor: 'rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.08)' },
      ]}
      pointerEvents="none"
    >
      <Text style={[styles.body, { color: shell.pageKicker }]} numberOfLines={2}>
        {SYSTEM_UNAVAILABLE_MESSAGE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginVertical: 6,
  },
  bannerCompact: { marginHorizontal: 0, marginVertical: 4, paddingVertical: 6 },
  body: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
});
