import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { ShellTheme } from '@/lib/member-grade-theme';

export interface AdminTabItem<T extends string> {
  id: T;
  label: string;
  badge?: number;
}

interface AdminTabMenuProps<T extends string> {
  tabs: AdminTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  shell: ShellTheme;
  accent?: string;
}

export function AdminTabMenu<T extends string>({ tabs, active, onChange, shell, accent }: AdminTabMenuProps<T>) {
  const tabAccent = accent ?? shell.tabIndicator;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row} contentContainerStyle={styles.content}>
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            style={[
              styles.chip,
              { borderColor: shell.filterInactiveBorder, backgroundColor: isActive ? tabAccent : shell.filterInactiveBg },
            ]}
            onPress={() => onChange(tab.id)}
          >
            <Text style={{ color: isActive ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '700' }}>
              {tab.label}{tab.badge != null && tab.badge > 0 ? ` (${tab.badge})` : ''}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 12 },
  content: { gap: 8, paddingRight: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
});
