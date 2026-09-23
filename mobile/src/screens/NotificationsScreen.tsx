import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationsContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { PageHeader } from '@/components/PageHeader';
import { formatDateFr } from '@/lib/date-utils';
import {
  deleteUserNotification,
  listUserNotifications,
  markNotificationRead,
  subscribeUserNotifications,
  type UserNotification,
} from '@/lib/user-notifications-store';
import { isAuthenticated } from '@/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

type ShellColors = {
  pageTitle: string;
  pageKicker: string;
  filterInactiveBorder: string;
  filterInactiveBg: string;
  tabIndicator: string;
};

function NotificationCard({
  item,
  shell,
  expanded,
  onToggle,
  onDelete,
}: {
  item: UserNotification;
  shell: ShellColors;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const unread = !item.readAt;

  return (
    <Pressable
      onPress={onToggle}
      style={[
        styles.card,
        {
          borderColor: shell.filterInactiveBorder,
          backgroundColor: unread ? shell.tabIndicator + '1A' : shell.filterInactiveBg,
        },
      ]}
    >
      <View style={styles.cardTop}>
        {unread ? (
          <View style={[styles.unreadDot, { backgroundColor: shell.tabIndicator }]} />
        ) : (
          <View style={styles.unreadSpacer} />
        )}

        <View style={styles.cardBody}>
          <View style={styles.titleRow}>
            <Text style={[styles.cardTitle, { color: shell.pageTitle }]} numberOfLines={expanded ? undefined : 2}>
              {item.title}
            </Text>
            <Pressable
              style={styles.titleActionBtn}
              onPress={(event) => {
                event.stopPropagation?.();
                onDelete();
              }}
              hitSlop={10}
              accessibilityLabel="Supprimer"
              accessibilityRole="button"
            >
              <Text style={styles.deleteTopIcon}>🗑️</Text>
            </Pressable>
          </View>
          <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>{formatDateFr(item.sentAt)}</Text>
          {expanded ? (
            <Text style={[styles.cardMessage, { color: shell.pageTitle }]}>{item.message}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function NotificationsScreen({ navigation }: Props) {
  const { user, role } = useAuthContext();
  const { shell } = useMemberTheme();
  const { refresh } = useNotifications();
  const [items, setItems] = useState<UserNotification[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = useCallback(
    async (force = false) => {
      if (!user || !isAuthenticated(role)) return;
      setItems(await listUserNotifications(user.id, user.phoneNumber, { force }));
    },
    [user?.id, user?.phoneNumber, role],
  );

  useFocusEffect(
    useCallback(() => {
      void load(true);
    }, [load]),
  );

  const loadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeUserNotifications(() => {
      if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
      loadDebounceRef.current = setTimeout(() => {
        loadDebounceRef.current = null;
        void load(false);
      }, 350);
    });
  }, [load]);

  useEffect(() => {
    return () => {
      if (loadDebounceRef.current) clearTimeout(loadDebounceRef.current);
    };
  }, []);

  async function reload() {
    await load(true);
    await refresh();
  }

  if (!user || !isAuthenticated(role)) {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Connectez-vous pour voir vos notifications.</Text>
      </View>
    );
  }

  const userId = user.id;
  const userPhone = user.phoneNumber;

  async function handleToggle(item: UserNotification) {
    if (!item.readAt) {
      await markNotificationRead(item.id, userId, userPhone);
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row)),
      );
      void refresh();
    }
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  function confirmDeleteOne(item: UserNotification) {
    Alert.alert('Supprimer cette notification ?', item.title, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => {
          setItems((prev) => prev.filter((row) => row.id !== item.id));
          void deleteUserNotification(item.id, userId, userPhone).then(reload);
        },
      },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <PageHeader title="Notifications" shell={shell} onBack={() => navigation.goBack()} />

      {items.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucune notification pour le moment.</Text>
      ) : (
        items.map((item) => (
          <NotificationCard
            key={item.id}
            item={item}
            shell={shell}
            expanded={expandedIds.has(item.id)}
            onToggle={() => void handleToggle(item)}
            onDelete={() => confirmDeleteOne(item)}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  empty: { fontSize: 14, fontStyle: 'italic', marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 10, marginBottom: 6, overflow: 'hidden' },
  cardTop: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 9, gap: 8, alignItems: 'flex-start' },
  unreadDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  unreadSpacer: { width: 7 },
  cardBody: { flex: 1, minWidth: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  titleActionBtn: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '700', lineHeight: 18, flex: 1 },
  deleteTopIcon: { fontSize: 13, lineHeight: 16, opacity: 0.85 },
  cardMeta: { marginTop: 2, fontSize: 10 },
  cardMessage: { marginTop: 8, fontSize: 13, lineHeight: 19 },
});
