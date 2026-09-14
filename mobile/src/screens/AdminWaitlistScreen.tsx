import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import {
  listWaitlistEntries,
  precreateAccountFromWaitlist,
  updateWaitlistStatus,
  type WaitlistEntry,
  type WaitlistStatus,
} from '@/lib/waitlist-admin-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminWaitlist'>;

const STATUS_LABELS: Record<WaitlistStatus, string> = {
  pending: 'En attente',
  invited: 'Invité',
  activated: 'Activé',
  rejected: 'Refusé',
};

export function AdminWaitlistScreen({ navigation }: Props) {
  const { user } = useAuthContext();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('users');
  const { shell } = useMemberTheme();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [filter, setFilter] = useState<WaitlistStatus | 'all'>('pending');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listWaitlistEntries(filter === 'all' ? undefined : filter);
    setLoadError(res.error ?? null);
    setEntries(res.entries);
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  async function handlePrecreate(entry: WaitlistEntry) {
    Alert.alert(
      'Pré-créer le compte',
      `Créer une invitation et envoyer un e-mail d'activation à ${entry.email} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Pré-créer',
          onPress: async () => {
            setBusyId(entry.id);
            try {
              const res = await precreateAccountFromWaitlist(entry, user?.id ?? 'admin');
              if (!res.ok) {
                Alert.alert('Erreur', res.error ?? 'Échec');
                return;
              }
              Alert.alert(
                'Invitation envoyée',
                `${entry.email} peut activer son compte via le lien reçu par e-mail.`,
              );
              await load();
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  async function handleReject(entry: WaitlistEntry) {
    setBusyId(entry.id);
    try {
      const res = await updateWaitlistStatus(entry.id, 'rejected');
      if (!res.ok) Alert.alert('Erreur', res.error ?? 'Échec');
      else await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <KeyboardAwareFormScroll
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
    >
      <AdminPageHeader
        title="Liste d'attente"
        subtitle="Pré-créez les comptes des inscrits landing pour activation ultérieure"
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <View style={styles.filterRow}>
        {(['pending', 'invited', 'all', 'rejected'] as const).map((id) => (
          <Pressable
            key={id}
            style={[
              styles.filterChip,
              {
                borderColor: shell.filterInactiveBorder,
                backgroundColor: filter === id ? ADMIN_THEME.accent : 'transparent',
              },
            ]}
            onPress={() => setFilter(id)}
          >
            <Text style={{ color: filter === id ? '#fff' : shell.pageTitle, fontSize: 11, fontWeight: '700' }}>
              {id === 'all' ? 'Tous' : STATUS_LABELS[id]}
            </Text>
          </Pressable>
        ))}
      </View>

      {loadError ? (
        <Text style={[styles.error, { color: '#ef4444' }]}>{loadError}</Text>
      ) : null}

      {entries.length === 0 ? (
        <Text style={{ color: shell.pageKicker, marginTop: 12 }}>Aucune inscription pour ce filtre.</Text>
      ) : null}

      {entries.map((entry) => (
        <View
          key={entry.id}
          style={[styles.card, { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder }]}
        >
          <Text style={[styles.email, { color: shell.pageTitle }]}>{entry.email}</Text>
          {entry.fullName ? (
            <Text style={{ color: shell.pageKicker, fontSize: 13 }}>{entry.fullName}</Text>
          ) : null}
          <Text style={{ color: shell.pageKicker, fontSize: 11, marginTop: 4 }}>
            {STATUS_LABELS[entry.status]}
            {entry.source ? ` · ${entry.source}` : ''}
            {` · ${new Date(entry.createdAt).toLocaleDateString('fr-FR')}`}
          </Text>

          {entry.status === 'pending' ? (
            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, { backgroundColor: ADMIN_THEME.accent, opacity: busyId === entry.id ? 0.6 : 1 }]}
                disabled={busyId === entry.id}
                onPress={() => void handlePrecreate(entry)}
              >
                <Text style={styles.btnText}>
                  {busyId === entry.id ? '…' : 'Pré-créer le compte'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btnOutline, { borderColor: shell.filterInactiveBorder }]}
                disabled={busyId === entry.id}
                onPress={() => void handleReject(entry)}
              >
                <Text style={{ color: shell.pageKicker, fontWeight: '700', fontSize: 12 }}>Refuser</Text>
              </Pressable>
            </View>
          ) : null}

          {entry.status === 'invited' ? (
            <Pressable
              style={[styles.btnOutline, { borderColor: ADMIN_THEME.accent, marginTop: 10 }]}
              disabled={busyId === entry.id}
              onPress={() => void handlePrecreate(entry)}
            >
              <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700', fontSize: 12 }}>
                Renvoyer l'invitation
              </Text>
            </Pressable>
          ) : null}
        </View>
      ))}
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  error: { marginBottom: 8, fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  email: { fontSize: 15, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  btnOutline: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
});
