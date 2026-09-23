import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ShellTheme } from '@/lib/member-grade-theme';

export const ADMIN_LIST_PAGE_SIZE = 20;

type Props = {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  shell: ShellTheme;
  label?: string;
};

/** Pagination liste admin — visible dès qu'il y a au moins 1 résultat (aligné admin-web ListPager). */
export function AdminListPager({
  page,
  total,
  pageSize = ADMIN_LIST_PAGE_SIZE,
  onPageChange,
  shell,
  label = 'résultats',
}: Props) {
  if (total <= 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageLabel = `Page ${page + 1}/${pages} · ${total} ${label}`;

  return (
    <View style={styles.row}>
      <Pressable
        style={[styles.btn, { borderColor: shell.filterInactiveBorder, opacity: page <= 0 ? 0.4 : 1 }]}
        disabled={page <= 0}
        onPress={() => onPageChange(Math.max(0, page - 1))}
      >
        <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Précédent</Text>
      </Pressable>
      <Text style={{ color: shell.pageKicker, fontSize: 12 }}>{pageLabel}</Text>
      <Pressable
        style={[
          styles.btn,
          { borderColor: shell.filterInactiveBorder, opacity: page + 1 >= pages ? 0.4 : 1 },
        ]}
        disabled={page + 1 >= pages}
        onPress={() => onPageChange(page + 1)}
      >
        <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Suivant</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  btn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
});
