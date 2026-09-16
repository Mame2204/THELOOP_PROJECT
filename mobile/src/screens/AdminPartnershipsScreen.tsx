import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import {
  addPartnershipNote,
  approvePartnershipWithOnboarding,
  listPartnershipRequests,
  PARTNERSHIP_STATUS_LABELS,
  updatePartnershipStatus,
} from '@/lib/admin-partnership-store';
import type { PartnershipRequest, PartnershipStatus } from '@/lib/admin-types';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { formatDateFr } from '@/lib/date-utils';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminPartnerships'>;

const STATUSES: PartnershipStatus[] = ['pending', 'to_contact', 'in_discussion', 'approved', 'rejected'];

export function AdminPartnershipsScreen({ navigation, route }: Props) {
  const { role, user } = useAuthContext();
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('partnerships');
  const embedded = route.params?.embedded === true;

  const [list, setList] = useState<PartnershipRequest[]>([]);
  const [filter, setFilter] = useState<PartnershipStatus | 'all'>('pending');
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (options?: { force?: boolean }) => {
    // force uniquement pull / mutation — cache-first sinon (egress).
    setList(await listPartnershipRequests(countryCode, { force: options?.force === true }));
  }, [countryCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ force: true });
    setRefreshing(false);
  }, [load]);

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Accès réservé</Text>
      </View>
    );
  }

  const filtered = list.filter((p) => filter === 'all' || p.status === filter);

  async function changeStatus(id: string, status: PartnershipStatus) {
    const partnership = list.find((p) => p.id === id);
    if (status === 'approved' && partnership && partnership.status !== 'approved') {
      Alert.alert(
        'Valider le partenariat',
        `Générer un jeton SPOT pour ${partnership.establishmentName} ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Valider',
            onPress: () => {
              void approvePartnershipWithOnboarding(partnership).then(async (res) => {
                if (!res.ok) {
                  Alert.alert('Erreur', res.error ?? 'Validation impossible');
                  return;
                }
                Alert.alert(
                  'Partenaire validé',
                  res.tokenCode
                    ? `Jeton SPOT : ${res.tokenCode}\nTransmettez-le au partenaire.`
                    : 'Statut mis à jour.',
                );
                await load({ force: true });
              });
            },
          },
        ],
      );
      return;
    }

    const res = await updatePartnershipStatus(id, status);
    if (!res.ok) Alert.alert('Erreur', res.error ?? 'Mise à jour impossible');
    else await load({ force: true });
  }

  async function saveNote(partnershipId: string) {
    const body = noteText[partnershipId]?.trim();
    if (!body) return;
    await addPartnershipNote(
      partnershipId,
      body,
      user?.id ?? null,
      user?.fullName ?? 'Admin',
    );
    setNoteText((prev) => ({ ...prev, [partnershipId]: '' }));
    await load({ force: true });
    Alert.alert('Note enregistrée', 'Horodatage ajouté à l\'historique.');
  }

  const inputStyle = [styles.input, { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder, color: shell.pageTitle }];

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  return (
    <KeyboardAwareFormScroll
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />}
    >
      {!embedded ? (
        <>
          <AdminPageHeader
            title="Partenariats"
            subtitle="Pipeline commercial — statuts & notes négociées"
            shell={shell}
            embedded={false}
            onBack={() => navigation.goBack()}
          />
          <AdminCountryBar shell={shell} compact />
        </>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        <Pressable
          style={[styles.chip, { borderColor: shell.filterInactiveBorder }, filter === 'all' && { backgroundColor: ADMIN_THEME.accent }]}
          onPress={() => setFilter('all')}
        >
          <Text style={{ color: filter === 'all' ? '#fff' : shell.pageKicker, fontSize: 10, fontWeight: '700' }}>Tous</Text>
        </Pressable>
        {STATUSES.map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, { borderColor: shell.filterInactiveBorder }, filter === s && { backgroundColor: statusColor(s) }]}
            onPress={() => setFilter(s)}
          >
            <Text style={{ color: filter === s ? '#fff' : shell.pageKicker, fontSize: 10, fontWeight: '700' }}>
              {PARTNERSHIP_STATUS_LABELS[s]}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {filtered.map((p) => {
        const notes = Array.isArray(p.notes) ? p.notes : [];
        return (
          <View key={p.id} style={adminCardStyle(shell)}>
            <Text style={[styles.title, { color: shell.pageTitle }]}>{p.establishmentName}</Text>
            <Text style={[styles.meta, { color: shell.pageKicker }]}>{p.managerName} · {p.email}</Text>
            <Text style={[styles.meta, { color: shell.pageKicker }]}>{p.phone}</Text>
            {p.adminNotes ? (
              <Text style={[styles.requestBody, { color: shell.pageTitle }]} numberOfLines={4}>{p.adminNotes}</Text>
            ) : null}
            <View style={[styles.statusBadge, { backgroundColor: statusColor(p.status) + '22' }]}>
              <Text style={{ color: statusColor(p.status), fontSize: 10, fontWeight: '800' }}>
                {PARTNERSHIP_STATUS_LABELS[p.status]}
              </Text>
            </View>

            <View style={styles.statusRow}>
              {STATUSES.map((s) => (
                <Pressable
                  key={s}
                  style={[styles.statusBtn, p.status === s && { backgroundColor: statusColor(s) + '33', borderColor: statusColor(s) }]}
                  onPress={() => void changeStatus(p.id, s)}
                >
                  <Text style={{ fontSize: 8, fontWeight: '700', color: p.status === s ? statusColor(s) : shell.pageKicker }}>
                    {PARTNERSHIP_STATUS_LABELS[s]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {notes.length > 0 ? (
              <View style={styles.notesBlock}>
                <Text style={[styles.notesTitle, { color: shell.pageKicker }]}>Historique des notes</Text>
                {notes.map((n) => (
                  <View key={n.id} style={[styles.noteItem, { borderColor: shell.filterInactiveBorder }]}>
                    <Text style={[styles.noteMeta, { color: shell.pageKicker }]}>
                      {formatDateFr(n.createdAt)} · {n.authorName}
                    </Text>
                    <Text style={[styles.noteBody, { color: shell.pageTitle }]}>{n.body}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <TextInput
              style={[...inputStyle, styles.noteInput]}
              value={noteText[p.id] ?? ''}
              onChangeText={(t) => setNoteText((prev) => ({ ...prev, [p.id]: t }))}
              placeholder="Note : avantages négociés, prochaine action…"
              placeholderTextColor={shell.pageKicker}
              multiline
            />
            <Pressable style={styles.saveNoteBtn} onPress={() => void saveNote(p.id)}>
              <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700', fontSize: 12 }}>Enregistrer la note</Text>
            </Pressable>
          </View>
        );
      })}

      {filtered.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucune demande pour ce filtre.</Text>
      ) : null}
    </KeyboardAwareFormScroll>
  );
}

function statusColor(status: PartnershipStatus): string {
  switch (status) {
    case 'approved':
      return '#10b981';
    case 'rejected':
      return '#ef4444';
    case 'in_discussion':
      return '#8b5cf6';
    case 'to_contact':
      return '#f59e0b';
    default:
      return ADMIN_THEME.accent;
  }
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  filterRow: { marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 6 },
  title: { fontSize: 16, fontWeight: '700' },
  meta: { marginTop: 4, fontSize: 12 },
  requestBody: { marginTop: 8, fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  statusBadge: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  statusBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  notesBlock: { marginTop: 12 },
  notesTitle: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  noteItem: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 6 },
  noteMeta: { fontSize: 10 },
  noteBody: { marginTop: 4, fontSize: 13, lineHeight: 18 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14 },
  noteInput: { marginTop: 12, minHeight: 72, textAlignVertical: 'top' },
  saveNoteBtn: { marginTop: 8, alignSelf: 'flex-start' },
  empty: { textAlign: 'center', marginTop: 32, fontSize: 14 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
