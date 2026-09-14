import { StyleSheet, Text, View } from 'react-native';
import type { HomeLocation } from '@/lib/demo-data';
import { getToolPlatformDisplay } from '@/lib/tool-display-utils';
import { useMemberTheme } from '@/hooks/useMemberTheme';

interface ToolMetaStripProps {
  tool: HomeLocation;
}

/** Bandeau compact plateforme (une seule info). */
export function ToolMetaStrip({ tool }: ToolMetaStripProps) {
  const { shell, theme } = useMemberTheme();
  const platform = getToolPlatformDisplay(tool.ctaUrl, tool.website);

  if (!platform) return null;

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: theme.colors.accentSoft,
          borderColor: theme.colors.accentBorder,
          borderRadius: theme.radius.card,
        },
      ]}
    >
      <Text style={styles.emoji}>{platform.emoji}</Text>
      <View style={styles.textCol}>
        <Text style={[styles.kicker, { color: shell.pageKicker }]}>Plateforme</Text>
        <Text style={[styles.value, { color: shell.pageTitle }]} numberOfLines={1}>
          {platform.label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  emoji: { fontSize: 22 },
  textCol: { flex: 1, minWidth: 0 },
  kicker: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  value: { fontSize: 14, fontWeight: '600' },
});
