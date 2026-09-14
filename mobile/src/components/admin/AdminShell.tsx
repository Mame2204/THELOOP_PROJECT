import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { CONTENT_H_PADDING } from '@/constants/layout';
import type { ShellTheme } from '@/lib/theme-config';

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  shell: ShellTheme;
  onBack?: () => void;
  /** Dans le workspace admin (barre latérale) — pas de safe-area doublée. */
  embedded?: boolean;
}

export function AdminPageHeader({
  title,
  subtitle,
  shell,
  onBack,
  embedded = true,
}: AdminPageHeaderProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useMemberTheme();
  const accent = theme.colors.accent;
  const paddingTop = embedded ? 10 : Math.max(insets.top, 8);

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop,
          paddingHorizontal: embedded ? 0 : CONTENT_H_PADDING,
          backgroundColor: embedded ? 'transparent' : shell.pageBg,
        },
      ]}
    >
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={[styles.back, { color: accent }]}>← Retour</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.title, { color: shell.pageTitle }]} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: shell.pageKicker }]} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

interface AdminKpiCardProps {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  shell: ShellTheme;
  onPress?: () => void;
  /** Surcharge largeur / mise en page (ex. grille 3 colonnes partenaire). */
  style?: StyleProp<ViewStyle>;
}

export function AdminKpiCard({ label, value, hint, accent: accentOverride, shell, onPress, style }: AdminKpiCardProps) {
  const { theme } = useMemberTheme();
  const accent = accentOverride ?? theme.colors.kpiValue;
  const cardStyle: StyleProp<ViewStyle> = [
    styles.kpi,
    { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder },
    style,
  ];
  const inner = (
    <>
      <View style={[styles.kpiGlow, { backgroundColor: theme.colors.accentSoft }]} />
      <Text style={[styles.kpiValue, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.kpiLabel, { color: shell.pageKicker }]} numberOfLines={2}>
        {label}
      </Text>
      {hint ? <Text style={[styles.kpiHint, { color: shell.pageKicker }]} numberOfLines={2}>{hint}</Text> : null}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={cardStyle}
        accessibilityRole="button"
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <View style={cardStyle}>
      {inner}
    </View>
  );
}

interface AdminModuleCardProps {
  icon: string;
  title: string;
  description: string;
  badge?: number;
  featured?: boolean;
  shell: ShellTheme;
  onPress: () => void;
}

export function AdminModuleCard({ icon, title, description, badge, featured = false, shell, onPress }: AdminModuleCardProps) {
  const { theme } = useMemberTheme();
  const accent = theme.colors.accent;
  const accentSoft = theme.colors.accentSoft;

  return (
    <Pressable onPress={onPress}>
      <View
        style={[
          styles.module,
          featured && styles.moduleFeatured,
          { backgroundColor: shell.filterInactiveBg, borderColor: featured ? accent : shell.filterInactiveBorder },
        ]}
      >
        <View style={styles.moduleLeft}>
          <View style={[styles.moduleIcon, featured && styles.moduleIconFeatured, { backgroundColor: accentSoft }]}>
            <Text style={[styles.moduleIconText, featured && styles.moduleIconTextFeatured]}>{icon}</Text>
          </View>
          <View style={styles.moduleText}>
            <Text style={[styles.moduleTitle, featured && styles.moduleTitleFeatured, { color: shell.pageTitle }]} numberOfLines={2}>{title}</Text>
            <Text style={[styles.moduleDesc, featured && styles.moduleDescFeatured, { color: shell.pageKicker }]} numberOfLines={3}>{description}</Text>
          </View>
        </View>
        {badge && badge > 0 ? (
          <View style={[styles.moduleBadge, featured && styles.moduleBadgeFeatured]}>
            <Text style={[styles.moduleBadgeText, featured && styles.moduleBadgeTextFeatured]}>{badge}</Text>
          </View>
        ) : (
          <Text style={{ color: accent, fontWeight: '700', fontSize: featured ? 18 : 14 }}>→</Text>
        )}
      </View>
    </Pressable>
  );
}

export function adminCardStyle(shell: ShellTheme): ViewStyle {
  return {
    backgroundColor: shell.filterInactiveBg,
    borderColor: shell.filterInactiveBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  };
}

export function useAdminThemeTokens() {
  const { theme } = useMemberTheme();
  return {
    accent: theme.colors.accent,
    accentSoft: theme.colors.accentSoft,
    accentBorder: theme.colors.accentBorder,
    tableHeaderBg: theme.colors.tableHeaderBg,
    tableRowBorder: theme.colors.tableRowBorder,
  };
}

/** Tokens admin bordeaux — compat écrans Control Tower */
export const ADMIN_THEME = {
  accent: '#8E1631',
  glow: 'rgba(142, 22, 49, 0.12)',
};

const styles = StyleSheet.create({
  header: { paddingBottom: 10 },
  back: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { marginTop: 2, fontSize: 11, lineHeight: 15 },
  kpi: {
    width: '48%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  kpiGlow: { position: 'absolute', top: -20, right: -20, width: 60, height: 60, borderRadius: 30 },
  kpiValue: { fontSize: 26, fontWeight: '800' },
  kpiLabel: { marginTop: 4, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', textAlign: 'center' },
  kpiHint: { marginTop: 2, fontSize: 9, textAlign: 'center' },
  module: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  moduleFeatured: { padding: 18, borderWidth: 2, marginBottom: 16 },
  moduleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 },
  moduleIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  moduleIconFeatured: { width: 56, height: 56, borderRadius: 14 },
  moduleIconText: { fontSize: 20 },
  moduleIconTextFeatured: { fontSize: 28 },
  moduleText: { flex: 1, minWidth: 0 },
  moduleTitle: { fontSize: 15, fontWeight: '700' },
  moduleTitleFeatured: { fontSize: 18 },
  moduleDesc: { marginTop: 2, fontSize: 11, lineHeight: 15 },
  moduleDescFeatured: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  moduleBadge: { backgroundColor: '#ef4444', borderRadius: 999, minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  moduleBadgeFeatured: { minWidth: 32, height: 32, paddingHorizontal: 8 },
  moduleBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  moduleBadgeTextFeatured: { fontSize: 14 },
});
