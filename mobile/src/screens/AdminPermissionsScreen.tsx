import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AdminPermissionGroupEditor } from '@/components/admin/AdminPermissionGroupEditor';
import {
  computePermissionOverrides,
  editableAdminPermissions,
  fetchAdminDefaultPermissions,
  fetchUserAdminPermissions,
  normalizePermissionSelection,
  saveAdminDefaultPermissions,
  saveAdminPermissionOverrides,
  type AdminPermissionId,
} from '@/lib/admin-permissions';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminPermissions'>;

interface AdminRow {
  id: string;
  email: string;
  fullName: string;
  userRole: string;
}

export function AdminPermissionsScreen({ navigation }: Props) {
  const { shell } = useMemberTheme();
  const { isSuperAdmin, refreshPermissions } = useAdminPermissions();
  const [defaults, setDefaults] = useState<AdminPermissionId[]>([]);
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);
  const [effective, setEffective] = useState<AdminPermissionId[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedAdmin = useMemo(
    () => admins.find((a) => a.id === selectedAdminId) ?? null,
    [admins, selectedAdminId],
  );

  const load = useCallback(async () => {
    const base = await fetchAdminDefaultPermissions();
    setDefaults(normalizePermissionSelection(base));

    if (isSupabaseConfigured() && supabase) {
      const { data } = await supabase
        .from('users')
        .select('id, email, first_name, last_name, user_role')
        .eq('user_role', 'admin')
        .order('email')
        .limit(15);
      setAdmins(
        (data ?? []).map((row) => ({
          id: row.id,
          email: row.email ?? '—',
          fullName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Sans nom',
          userRole: row.user_role ?? 'admin',
        })),
      );
    }
  }, []);

  const loadAdminEffective = useCallback(async (userId: string) => {
    setEffective(normalizePermissionSelection(await fetchUserAdminPermissions(userId)));
  }, []);

  useEffect(() => {
    if (isSuperAdmin) void load();
  }, [isSuperAdmin, load]);

  useEffect(() => {
    if (selectedAdminId) void loadAdminEffective(selectedAdminId);
    else setEffective([]);
  }, [selectedAdminId, loadAdminEffective]);

  const saveDefaults = async () => {
    setSaving(true);
    try {
      const normalized = normalizePermissionSelection(defaults);
      await saveAdminDefaultPermissions(normalized);
      setDefaults(normalized);
      Alert.alert('Enregistré', 'Permissions de base mises à jour pour tous les admins.');
      await refreshPermissions();
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Échec enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const saveOverrides = async () => {
    if (!selectedAdminId) return;
    setSaving(true);
    try {
      const normalized = normalizePermissionSelection(effective);
      const { grants, revokes } = computePermissionOverrides(defaults, normalized);
      await saveAdminPermissionOverrides(selectedAdminId, grants, revokes);
      Alert.alert('Enregistré', `Permissions mises à jour pour ${selectedAdmin?.fullName ?? 'admin'}.`);
      await loadAdminEffective(selectedAdminId);
      await refreshPermissions();
    } catch (e) {
      Alert.alert('Erreur', e instanceof Error ? e.message : 'Échec enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    if (selectedAdminId) await loadAdminEffective(selectedAdminId);
    setRefreshing(false);
  };

  if (!isSuperAdmin) {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={[styles.deniedTitle, { color: shell.pageTitle }]}>Super admin requis</Text>
        <Text style={{ color: shell.pageKicker }}>Seul le super admin peut gérer les permissions.</Text>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700', marginTop: 16 }}>← Retour</Text>
        </Pressable>
      </View>
    );
  }

  const editableCount = editableAdminPermissions().length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: shell.pageBg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />}
    >
      <AdminPageHeader
        title="Permission"
        subtitle={`${editableCount} modules · base + ajustements par admin`}
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <View style={[adminCardStyle(shell), styles.card]}>
        <Text style={[styles.sectionTitle, { color: shell.pageTitle }]}>Permissions de base (tous les admins)</Text>
        <Text style={[styles.hint, { color: shell.pageKicker }]}>
          Activez les modules de navigation, les sous-onglets et les entrées Paramètres. Sans sous-onglet coché sous un module = accès complet à ce module.
        </Text>
        <AdminPermissionGroupEditor
          selected={defaults}
          onChange={setDefaults}
          shell={shell}
          disabled={saving}
        />
        <Pressable style={[styles.primaryBtn, saving && styles.disabled]} disabled={saving} onPress={() => void saveDefaults()}>
          <Text style={styles.primaryBtnText}>Enregistrer la base</Text>
        </Pressable>
      </View>

      <View style={[adminCardStyle(shell), styles.card]}>
        <Text style={[styles.sectionTitle, { color: shell.pageTitle }]}>Ajustements par admin</Text>
        {admins.length === 0 ? (
          <Text style={{ color: shell.pageKicker }}>Aucun admin délégué. Créez un compte avec rôle « admin » dans Utilisateurs.</Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {admins.map((a) => (
                <Pressable
                  key={a.id}
                  style={[styles.chip, selectedAdminId === a.id && { backgroundColor: ADMIN_THEME.accent }]}
                  onPress={() => setSelectedAdminId(a.id)}
                >
                  <Text style={{ color: selectedAdminId === a.id ? '#000' : shell.pageTitle, fontWeight: '700' }}>
                    {a.fullName}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {selectedAdmin ? (
              <>
                <Text style={[styles.hint, { color: shell.pageKicker }]}>
                  {selectedAdmin.fullName} — personnalisez modules et sous-onglets (base + extras − retraits).
                </Text>
                <AdminPermissionGroupEditor
                  selected={effective}
                  onChange={setEffective}
                  shell={shell}
                  disabled={saving}
                />
                <Pressable style={[styles.primaryBtn, saving && styles.disabled]} disabled={saving} onPress={() => void saveOverrides()}>
                  <Text style={styles.primaryBtnText}>Enregistrer pour {selectedAdmin.fullName}</Text>
                </Pressable>
              </>
            ) : null}
          </>
        )}
      </View>

      <View style={[adminCardStyle(shell), styles.card]}>
        <Text style={[styles.sectionTitle, { color: shell.pageTitle }]}>Privilèges Prime (sans PASS)</Text>
        <Text style={[styles.hint, { color: shell.pageKicker }]}>
          Tous les admins voient le contenu Prime et reçoivent les avantages Prime configurés, sans abonnement ni bouton « Mon PASS ».
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40, gap: 16 },
  card: { padding: 16, gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  hint: { fontSize: 13, lineHeight: 18 },
  primaryBtn: { backgroundColor: ADMIN_THEME.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  primaryBtnText: { color: '#000', fontWeight: '800' },
  disabled: { opacity: 0.6 },
  chips: { gap: 8, paddingVertical: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)' },
  denied: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  deniedTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
});
