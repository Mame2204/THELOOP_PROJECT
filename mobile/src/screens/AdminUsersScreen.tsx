import { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import {
  requestAdminPasswordReset,
  toggleUserActive,
  updateAdminUserProfile,
  updateUserRole,
  applyRoleDowngradeSideEffects,
} from '@/lib/admin-invite-store';
import {
  deleteOrArchiveUser,
  formatUserDeleteImpact,
  inspectUserLinks,
  setUserAccountStatus,
} from '@/lib/admin-user-lifecycle';
import { accountLoginBlockedMessage } from '@/lib/account-access';
import { USER_ROLE_LABELS, ADMIN_ASSIGNABLE_ROLES, type AdminAssignableRole } from '@/lib/admin-types';
import {
  getActiveSubscription,
  getSuspendedSubscription,
  loadSubscriptionHistory,
} from '@/lib/subscription-history';
import { peekRegistryUsers, upsertRegistryUser, type RegistryUser } from '@/lib/user-registry-store';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { isAnyAdminUser } from '@/lib/admin-permissions';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminPageHeader, ADMIN_THEME, adminCardStyle } from '@/components/admin/AdminShell';
import { AdminActionIcon } from '@/components/admin/AdminActionIcon';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { GuineaLocationPicker } from '@/components/GuineaLocationPicker';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { resolveCountryCode } from '@/lib/admin-country';
import { TogglePill } from '@/components/admin/TogglePill';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { navigateRoot } from '@/lib/navigation-utils';
import { fetchUsersAuthActivity } from '@/lib/admin-payments-store';
import { formatDateFr } from '@/lib/date-utils';
import { DEFAULT_PARTNER_CONTENT_SCOPES, partnerScopeSummary } from '@/lib/partner-content-scopes';
import type { PartnerContentScopes } from '@/types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminUsers'>;
type StatusFilter = 'all' | 'active' | 'inactive' | 'stale';
type RoleFilter = 'all' | AdminAssignableRole;

const STALE_DAYS = 60;

function activityTimestamp(user: AdminUserRow): string | null {
  const a = user.lastSeenAt ? Date.parse(user.lastSeenAt) : NaN;
  const b = user.lastSignInAt ? Date.parse(user.lastSignInAt) : NaN;
  if (Number.isFinite(a) && Number.isFinite(b)) {
    return a >= b ? user.lastSeenAt : user.lastSignInAt;
  }
  if (Number.isFinite(a)) return user.lastSeenAt;
  if (Number.isFinite(b)) return user.lastSignInAt;
  return null;
}

function isStaleUser(user: AdminUserRow, days = STALE_DAYS): boolean {
  const ts = activityTimestamp(user);
  if (!ts) return true;
  const ageMs = Date.now() - Date.parse(ts);
  return !Number.isFinite(ageMs) || ageMs > days * 24 * 60 * 60 * 1000;
}

function formatActivityLabel(user: AdminUserRow): string {
  const ts = activityTimestamp(user);
  if (!ts) return 'Jamais connecté';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(ts));
  } catch {
    return formatDateFr(ts);
  }
}

interface AdminUserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  userRole: string;
  effectiveRole: string;
  passLabel: string | null;
  isActive: boolean;
  countryCode: string;
  city: string | null;
  birthDate: string | null;
  partnerContentScopes: PartnerContentScopes;
  lastSeenAt: string | null;
  lastSignInAt: string | null;
}

const PROTECTED_DB_ROLES = new Set(['admin', 'super_admin', 'partner']);

function resolveEffectiveRole(
  dbRole: string,
  registry: RegistryUser | undefined,
): string {
  if (PROTECTED_DB_ROLES.has(dbRole)) return dbRole;
  // Source de vérité : le rôle en base (bascule super admin Prime ↔ membre)
  if (dbRole === 'prime') return 'prime';
  if (dbRole === 'member') return 'member';
  if (
    registry &&
    (registry.role === 'USER_PRIME' ||
      registry.userRole === 'prime' ||
      registry.subscriptionStatus === 'active')
  ) {
    return 'prime';
  }
  return dbRole;
}

async function registryPassSnapshot(userId: string) {
  const history = await loadSubscriptionHistory(userId);
  const active = getActiveSubscription(history, 'prime');
  const suspended = getSuspendedSubscription(history, 'prime');
  const pass = active ?? suspended;
  return {
    subscriptionStatus: active ? ('active' as const) : suspended ? ('suspended' as const) : ('none' as const),
    subscriptionExpiresAt: pass?.expiresAt ?? null,
  };
}

const ROLES = ADMIN_ASSIGNABLE_ROLES;

function normalizeAssignableRole(userRole: string): AdminAssignableRole {
  if (userRole === 'super_admin') return 'super_admin';
  if (ROLES.includes(userRole as AdminAssignableRole)) return userRole as AdminAssignableRole;
  return 'member';
}

function dbRoleToAppRole(userRole: string): UserRole {
  switch (userRole) {
    case 'admin':
    case 'super_admin':
      return 'ADMIN';
    case 'partner':
      return 'PARTNER';
    case 'prime':
      return 'USER_PRIME';
    default:
      return 'USER_FREE';
  }
}

export function AdminUsersScreen({ navigation }: Props) {
  const { role, user: adminUser } = useAuthContext();
  const { isSuperAdmin } = useAdminPermissions();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('users');
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<'supabase' | 'demo'>('demo');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editCountry, setEditCountry] = useState('');
  const [editBirthDate, setEditBirthDate] = useState('');
  const [editRole, setEditRole] = useState<AdminAssignableRole>('member');
  const [editActive, setEditActive] = useState(true);
  const [editPartnerScopes, setEditPartnerScopes] = useState<PartnerContentScopes>(DEFAULT_PARTNER_CONTENT_SCOPES);

  const PAGE_SIZE = 20;

  const load = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setUsers([]);
      setTotalCount(0);
      setSource('demo');
      setLoadError('Supabase requis — créez les comptes depuis l’écran d’inscription ou le SQL Editor.');
      return;
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const staleMode = statusFilter === 'stale';
    const selectCols =
      'id, email, first_name, last_name, phone_number, user_role, is_active, country_code, city, birth_date, partner_can_manage_events, partner_can_manage_spots, partner_can_manage_tools, last_seen_at, auth_last_sign_in_at';

    let query = supabase
      .from('users')
      .select(selectCols, { count: staleMode ? undefined : 'exact' })
      .order('created_at', { ascending: false });
    query = staleMode ? query.limit(500) : query.range(from, to);

    if (countryCode) {
      query = query.or(`country_code.eq.${countryCode},country_code.is.null`);
    }
    if (!isSuperAdmin) {
      query = query.not('user_role', 'in', '(admin,super_admin)');
    }
    if (statusFilter === 'active') query = query.eq('is_active', true);
    if (statusFilter === 'inactive') query = query.eq('is_active', false);
    // « Sans activité » : filtrage client via isStaleUser (max last_seen + last_sign_in).
    if (roleFilter !== 'all') {
      query = query.eq('user_role', roleFilter);
    }
    const q = searchQuery.trim();
    if (q) {
      const safe = q.replace(/[%_,]/g, ' ').slice(0, 80);
      query = query.or(
        `email.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone_number.ilike.%${safe}%`,
      );
    }

    let { data, error, count } = await query;

    if (error && /last_seen_at/i.test(error.message)) {
      let fallback = supabase
        .from('users')
        .select(
          'id, email, first_name, last_name, phone_number, user_role, is_active, country_code, city, birth_date, partner_can_manage_events, partner_can_manage_spots, partner_can_manage_tools',
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range(from, to);
      if (countryCode) fallback = fallback.or(`country_code.eq.${countryCode},country_code.is.null`);
      if (!isSuperAdmin) fallback = fallback.not('user_role', 'in', '(admin,super_admin)');
      if (statusFilter === 'active') fallback = fallback.eq('is_active', true);
      if (statusFilter === 'inactive') fallback = fallback.eq('is_active', false);
      if (roleFilter !== 'all') fallback = fallback.eq('user_role', roleFilter);
      if (q) {
        const safe = q.replace(/[%_,]/g, ' ').slice(0, 80);
        fallback = fallback.or(
          `email.ilike.%${safe}%,first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,phone_number.ilike.%${safe}%`,
        );
      }
      const fb = await fallback;
      data = fb.data as typeof data;
      error = fb.error;
      count = fb.count;
    }

    if (error) {
      setLoadError(error.message);
      setUsers([]);
      setTotalCount(0);
      setSource('supabase');
      return;
    }

    setSource('supabase');
    setTotalCount(count ?? 0);

    const ids = (data ?? []).map((r) => r.id);
    const [registryUsers, authActivity] = await Promise.all([
      peekRegistryUsers(),
      fetchUsersAuthActivity(ids),
    ]);
    const registryById = new Map(registryUsers.map((u) => [u.id, u]));

    const rows: AdminUserRow[] = (data ?? []).map((row) => {
      const dbRole = row.user_role ?? 'member';
      const registry = registryById.get(row.id);
      const effectiveRole = resolveEffectiveRole(dbRole, registry);
      const passFromRegistry =
        registry?.subscriptionStatus === 'active' || registry?.subscriptionStatus === 'suspended'
          ? registry.subscriptionExpiresAt
            ? `PASS · éch. ${formatDateFr(registry.subscriptionExpiresAt)}`
            : 'PASS'
          : null;

      return {
        id: row.id,
        email: row.email ?? '—',
        firstName: row.first_name ?? '',
        lastName: row.last_name ?? '',
        phone: row.phone_number ?? null,
        fullName: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Sans nom',
        userRole: dbRole,
        effectiveRole,
        passLabel: passFromRegistry,
        isActive: row.is_active ?? true,
        countryCode: row.country_code ?? resolveCountryCode(null, row.phone_number),
        city: row.city ?? null,
        birthDate: row.birth_date ?? null,
        partnerContentScopes: {
          events: row.partner_can_manage_events !== false,
          spots: row.partner_can_manage_spots !== false,
          tools: row.partner_can_manage_tools !== false,
        },
        lastSeenAt: 'last_seen_at' in row ? ((row as { last_seen_at?: string | null }).last_seen_at ?? null) : null,
        lastSignInAt: (() => {
          const fromRow = (row as { auth_last_sign_in_at?: string | null }).auth_last_sign_in_at ?? null;
          const fromRpc = authActivity.activity[row.id]?.lastSignInAt ?? null;
          if (fromRow && fromRpc) {
            return new Date(fromRow) >= new Date(fromRpc) ? fromRow : fromRpc;
          }
          return fromRow ?? fromRpc;
        })(),
      };
    });

    setLoadError(authActivity.error ?? null);
    const visible = staleMode ? rows.filter((u) => isStaleUser(u)) : rows;
    if (staleMode) {
      const staleFrom = page * PAGE_SIZE;
      setTotalCount(visible.length);
      setUsers(visible.slice(staleFrom, staleFrom + PAGE_SIZE));
    } else {
      setUsers(visible);
    }
  }, [countryCode, isSuperAdmin, page, roleFilter, searchQuery, statusFilter]);

  useEffect(() => {
    if (role === 'ADMIN') void load();
  }, [role, load]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, roleFilter, searchQuery, countryCode]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  const assignableRoles = isSuperAdmin
    ? [...ROLES]
    : ROLES.filter((r) => r !== 'admin' && r !== 'super_admin');

  function isSelf(user: AdminUserRow): boolean {
    return Boolean(adminUser?.id && adminUser.id === user.id);
  }

  function countActiveSuperAdmins(): number {
    return users.filter((u) => u.userRole === 'super_admin' && u.isActive).length;
  }

  function roleChipsForUser(target: AdminUserRow): AdminAssignableRole[] {
    const chips = [...assignableRoles];
    if (target.userRole === 'super_admin' && isSuperAdmin && !chips.includes('super_admin')) {
      chips.push('super_admin');
    }
    return chips;
  }

  const inputStyle = [styles.input, { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder, color: shell.pageTitle }];

  function openEdit(user: AdminUserRow) {
    setEditingUser(user);
    setEditFirstName(user.firstName);
    setEditLastName(user.lastName);
    setEditEmail(user.email === '—' ? '' : user.email);
    setEditPhone(user.phone ?? '');
    setEditCity(user.city ?? '');
    setEditCountry(user.countryCode);
    setEditBirthDate(user.birthDate ?? '');
    setEditRole(normalizeAssignableRole(user.userRole));
    setEditActive(user.isActive);
    setEditPartnerScopes(user.partnerContentScopes);
  }

  async function handleSaveEdit() {
    if (!editingUser) return;
    if (!editFirstName.trim() || !editLastName.trim()) {
      Alert.alert('Champs requis', 'Prénom et nom obligatoires.');
      return;
    }
    if (isSelf(editingUser) && (editRole !== editingUser.userRole || editActive !== editingUser.isActive)) {
      Alert.alert('Action bloquée', 'Vous ne pouvez pas modifier votre propre rôle ou statut.');
      return;
    }
    if (
      editingUser.userRole === 'super_admin' &&
      editRole !== 'super_admin' &&
      countActiveSuperAdmins() <= 1
    ) {
      Alert.alert('Action bloquée', 'Impossible de retirer le dernier super admin.');
      return;
    }
    if (editRole === 'partner' && !editPartnerScopes.events && !editPartnerScopes.spots && !editPartnerScopes.tools) {
      Alert.alert('Modules partenaire', 'Activez au moins un module : événements, spots ou outils.');
      return;
    }
    const previousRole = editingUser.userRole;
    const res = await updateAdminUserProfile(editingUser.id, {
      firstName: editFirstName.trim(),
      lastName: editLastName.trim(),
      email: editEmail.trim() || null,
      phoneNumber: editPhone.trim() || null,
      city: editCity.trim() || null,
      countryCode: editCountry.trim().toUpperCase().slice(0, 2) || countryCode,
      birthDate: editBirthDate.trim() || null,
      userRole: editRole,
      isActive: editActive,
      partnerContentScopes: editRole === 'partner' ? editPartnerScopes : undefined,
      primeRoleLocked: editRole === 'prime' ? false : previousRole === 'prime',
    });
    if (!res.ok) {
      Alert.alert('Erreur', res.error ?? 'Mise à jour impossible');
      return;
    }
    if (previousRole !== editRole) {
      await applyRoleDowngradeSideEffects(editingUser.id, previousRole, editRole, {
        grantedByUserId: adminUser?.id ?? 'role-freeze',
      });
    }
    const passSnap = await registryPassSnapshot(editingUser.id);
    await upsertRegistryUser({
      id: editingUser.id,
      email: editEmail.trim() || null,
      phoneNumber: editPhone.trim() || null,
      firstName: editFirstName.trim(),
      lastName: editLastName.trim(),
      role: dbRoleToAppRole(editRole),
      userRole: editRole,
      birthDate: editBirthDate.trim() || null,
      referralCode: `LOOP-${editingUser.id.slice(0, 4).toUpperCase()}`,
      subscriptionStatus: passSnap.subscriptionStatus,
      subscriptionExpiresAt: passSnap.subscriptionExpiresAt,
      countryCode: editCountry.trim() || countryCode,
      city: editCity.trim() || null,
      adminRoleLocked: editRole === 'prime' ? false : previousRole === 'prime',
    });
    setEditingUser(null);
    await load();
    if (res.authSyncWarning) {
      Alert.alert(
        'Profil enregistré',
        `${res.authSyncWarning}\n\nLes autres informations ont bien été sauvegardées dans public.users.`,
      );
      return;
    }
    Alert.alert('Enregistré', 'Profil utilisateur mis à jour.');
  }

  async function handleArchiveUser() {
    if (!editingUser || !isSuperAdmin) return;
    if (isSelf(editingUser)) {
      Alert.alert('Action bloquée', 'Vous ne pouvez pas archiver votre propre compte.');
      return;
    }
    Alert.alert(
      'Archiver le compte',
      `« ${editingUser.fullName} » deviendra inaccessible.\n\nLe compte reste en base si des contenus y sont rattachés.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Archiver',
          style: 'destructive',
          onPress: async () => {
            const res = await setUserAccountStatus(editingUser.id, 'archived', editingUser.phone);
            if (!res.ok) {
              Alert.alert('Erreur', res.error ?? 'Archivage impossible.');
              return;
            }
            setEditingUser(null);
            await load();
            Alert.alert('Archivé', 'Le compte est inaccessible.');
          },
        },
      ],
    );
  }

  async function handleDeleteUser(targetUser: AdminUserRow | null = editingUser) {
    if (!targetUser || !isSuperAdmin) return;
    if (isSelf(targetUser)) {
      Alert.alert('Action bloquée', 'Vous ne pouvez pas supprimer votre propre compte.');
      return;
    }
    const links = await inspectUserLinks(targetUser.id);
    const canHardDelete = !links.hasLinks;
    Alert.alert(
      canHardDelete ? 'Supprimer le compte' : 'Archivage requis',
      formatUserDeleteImpact(targetUser.fullName, links, canHardDelete),
      canHardDelete
        ? [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: async () => {
                const res = await deleteOrArchiveUser(targetUser.id, targetUser.phone, false);
                if (!res.ok) {
                  Alert.alert('Erreur', res.error ?? 'Suppression impossible.');
                  return;
                }
                setEditingUser(null);
                await load();
                Alert.alert('Supprimé', 'Le compte a été effacé.');
              },
            },
          ]
        : [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Archiver',
              style: 'destructive',
              onPress: async () => {
                const res = await setUserAccountStatus(targetUser.id, 'archived', targetUser.phone);
                if (!res.ok) {
                  Alert.alert('Erreur', res.error ?? 'Archivage impossible.');
                  return;
                }
                setEditingUser(null);
                await load();
                Alert.alert('Archivé', 'Le compte est inaccessible.');
              },
            },
          ],
    );
  }

  async function handleResetPassword(user: AdminUserRow) {
    if (!user.email?.trim()) {
      Alert.alert('E-mail requis', 'Ajoutez un e-mail avant de réinitialiser le mot de passe.');
      return;
    }
    Alert.alert(
      'Réinitialiser le mot de passe',
      `Envoyer un lien sécurisé à ${user.email} ? L'utilisateur pourra définir un nouveau mot de passe via le lien reçu.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Envoyer le lien',
          onPress: async () => {
            const res = await requestAdminPasswordReset(user.email!, adminUser?.id ?? null);
            if (!res.ok) Alert.alert('Erreur', res.error ?? 'Échec');
            else Alert.alert('E-mail envoyé', 'Un lien de réinitialisation a été envoyé si le compte existe.');
          },
        },
      ],
    );
  }

  async function changeRole(user: AdminUserRow, newRole: AdminAssignableRole) {
    if (isSelf(user)) {
      Alert.alert('Action bloquée', 'Vous ne pouvez pas modifier votre propre rôle.');
      return;
    }
    if (!isSuperAdmin && (newRole === 'admin' || newRole === 'super_admin' || isAnyAdminUser(user.userRole))) {
      Alert.alert('Super admin requis', 'Seul le super admin peut gérer les comptes admin.');
      return;
    }
    if (user.userRole === 'super_admin' && newRole !== 'super_admin' && countActiveSuperAdmins() <= 1) {
      Alert.alert('Action bloquée', 'Impossible de retirer le dernier super admin.');
      return;
    }
    const previousRole = user.userRole;
    const res = await updateUserRole(user.id, newRole, user.isActive, {
      primeRoleLocked:
        newRole === 'prime' ? false : previousRole === 'prime',
    });
    if (!res.ok) {
      Alert.alert('Erreur', res.error ?? 'Mise à jour impossible');
      return;
    }
    await applyRoleDowngradeSideEffects(user.id, previousRole, newRole, {
      grantedByUserId: adminUser?.id ?? 'role-freeze',
    });
    const passSnap = await registryPassSnapshot(user.id);
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, userRole: newRole } : u)));
    await upsertRegistryUser({
      id: user.id,
      email: user.email,
      phoneNumber: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      role: dbRoleToAppRole(newRole),
      userRole: newRole,
      birthDate: user.birthDate,
      referralCode: `LOOP-${user.id.slice(0, 4).toUpperCase()}`,
      subscriptionStatus: passSnap.subscriptionStatus,
      subscriptionExpiresAt: passSnap.subscriptionExpiresAt,
      countryCode: user.countryCode,
      city: user.city,
      adminRoleLocked: newRole === 'prime' ? false : previousRole === 'prime',
    });
    Alert.alert(
      'Rôle mis à jour',
      `${USER_ROLE_LABELS[newRole]} pour ${user.fullName}${
        previousRole === 'prime' && newRole !== 'prime'
          ? '\n\nLe PASS en cours est suspendu — sa date de fin est conservée pour une réaffectation Prime.'
          : previousRole !== 'prime' && newRole === 'prime'
            ? '\n\nLe PASS suspendu a été réactivé avec sa date de fin d\'origine.'
            : ''
      }`,
    );
  }

  async function setUserActive(user: AdminUserRow, next: boolean) {
    if (next === user.isActive) return;
    if (!next && isSelf(user)) {
      Alert.alert('Action bloquée', 'Vous ne pouvez pas suspendre votre propre compte.');
      return;
    }
    if (!next && user.userRole === 'super_admin' && countActiveSuperAdmins() <= 1) {
      Alert.alert('Action bloquée', 'Impossible de suspendre le dernier super admin.');
      return;
    }
    Alert.alert(
      next ? 'Réactiver le compte' : 'Suspendre ce compte',
      next
        ? `Réactiver l'accès pour ${user.fullName} ?`
        : [
            `Le compte de ${user.fullName} sera suspendu immédiatement.`,
            '',
            'Message affiché à la connexion :',
            '',
            accountLoginBlockedMessage('suspended'),
          ].join('\n'),
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            const res = await toggleUserActive(user.id, next, user.phone);
            if (!res.ok) Alert.alert('Erreur', res.error ?? 'Échec');
            else {
              setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, isActive: next } : u)));
              if (!next) {
                Alert.alert('Compte suspendu', `« ${user.fullName} » ne pourra plus se connecter.`);
              }
            }
          },
        },
      ],
    );
  }

  const filtered = users;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageLabel = `Page ${page + 1}/${totalPages} · ${totalCount} compte${totalCount > 1 ? 's' : ''}`;

  return (
    <>
      <KeyboardAwareFormScroll
        style={{ flex: 1, backgroundColor: shell.pageBg }}
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={ADMIN_THEME.accent} />}
      >
        <AdminPageHeader
          title="Utilisateurs"
          subtitle={`${pageLabel} · édition · reset OTP`}
          shell={shell}
          onBack={() => navigation.goBack()}
        />

        <AdminCountryBar shell={shell} compact />

        <View style={styles.searchRow}>
          <TextInput
            style={[
              styles.searchInput,
              {
                backgroundColor: shell.filterInactiveBg,
                borderColor: shell.filterInactiveBorder,
                color: shell.pageTitle,
              },
            ]}
            placeholder="Rechercher e-mail, nom, téléphone…"
            placeholderTextColor={shell.pageKicker}
            value={searchInput}
            onChangeText={setSearchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => setSearchQuery(searchInput.trim())}
          />
          <Pressable
            style={[styles.searchBtn, { backgroundColor: ADMIN_THEME.accent }]}
            onPress={() => setSearchQuery(searchInput.trim())}
          >
            <Text style={styles.searchBtnText}>OK</Text>
          </Pressable>
        </View>

        <AdminTabMenu
          tabs={[
            { id: 'all', label: 'Tous' },
            { id: 'active', label: 'Actifs' },
            { id: 'inactive', label: 'Suspendus' },
            { id: 'stale', label: `Sans activité ${STALE_DAYS}j` },
          ]}
          active={statusFilter}
          onChange={setStatusFilter}
          shell={shell}
        />
        <AdminTabMenu
          tabs={[
            { id: 'all', label: 'Tous' },
            { id: 'member', label: 'Membres' },
            { id: 'prime', label: 'Prime' },
            { id: 'partner', label: 'Partenaires' },
            { id: 'admin', label: 'Admin' },
            ...(isSuperAdmin ? [{ id: 'super_admin' as const, label: 'Super admin' }] : []),
          ]}
          active={roleFilter}
          onChange={setRoleFilter}
          shell={shell}
          accent={ADMIN_THEME.accent}
        />

        <Pressable
          style={[styles.createBtn, { borderColor: ADMIN_THEME.accent }]}
          onPress={() => navigateRoot(navigation, 'AdminCreateUser')}
        >
          <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700' }}>+ Inviter par e-mail</Text>
        </Pressable>

        <Pressable
          style={[styles.createBtn, { borderColor: shell.filterInactiveBorder, marginTop: 8 }]}
          onPress={() => navigateRoot(navigation, 'AdminWaitlist')}
        >
          <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Liste d'attente landing</Text>
        </Pressable>

        {source === 'demo' ? (
          <View style={[styles.sourceBanner, { backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#f59e0b' }]}>
            <Text style={[styles.sourceBannerText, { color: '#b45309' }]}>
              Mode démo local — Supabase non connecté. Les utilisateurs affichés ne viennent pas de la base. Vérifiez mobile/.env puis redémarrez Expo.
            </Text>
          </View>
        ) : null}

        {loadError ? (
          <Text style={[styles.loadError, { color: '#ef4444' }]}>Erreur chargement : {loadError}</Text>
        ) : null}

        {filtered.length === 0 ? (
          <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun utilisateur pour ce filtre.</Text>
        ) : null}

        {filtered.map((user) => (
          <View key={user.id} style={adminCardStyle(shell)}>
            <View style={styles.cardTop}>
              <Text style={[styles.name, { color: shell.pageTitle }]}>{user.fullName}</Text>
              <View style={[styles.roleBadge, { backgroundColor: user.isActive ? ADMIN_THEME.glow : 'rgba(239,68,68,0.2)' }]}>
                <Text style={{ color: user.isActive ? ADMIN_THEME.accent : '#ef4444', fontSize: 9, fontWeight: '700', textTransform: 'uppercase' }}>
                  {USER_ROLE_LABELS[user.effectiveRole] ?? user.effectiveRole}{user.isActive ? '' : ' · suspendu'}
                </Text>
              </View>
            </View>
            <Text style={[styles.email, { color: shell.pageKicker }]}>{user.email}</Text>
            <Text style={[styles.email, { color: isStaleUser(user) ? '#b45309' : shell.pageKicker }]}>
              Dernière activité : {formatActivityLabel(user)}
            </Text>
            {user.passLabel ? (
              <Text style={[styles.passHint, { color: ADMIN_THEME.accent }]}>
                {user.passLabel}
                {user.effectiveRole === 'prime' && user.userRole !== 'prime' ? ' · sync en cours' : ''}
              </Text>
            ) : null}
            {user.phone ? <Text style={[styles.email, { color: shell.pageKicker }]}>{user.phone}</Text> : null}
            {user.city ? <Text style={[styles.email, { color: shell.pageKicker }]}>{user.city} · {user.countryCode}</Text> : null}
            {user.userRole === 'partner' ? (
              <Text style={[styles.scopeHint, { color: shell.pageKicker }]}>
                Modules Pro : {partnerScopeSummary(user.partnerContentScopes)}
              </Text>
            ) : null}

            <View style={styles.actionRow}>
              <AdminActionIcon action="edit" color={shell.tabIndicator} onPress={() => openEdit(user)} />
              <Pressable onPress={() => void handleResetPassword(user)}>
                <Text style={{ color: '#06b6d4', fontWeight: '700', fontSize: 11 }}>Reset MDP</Text>
              </Pressable>
              {isSuperAdmin && !isSelf(user) ? (
                <Pressable onPress={() => void handleDeleteUser(user)}>
                  <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 11 }}>Supprimer</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.roleRow}>
              {roleChipsForUser(user).map((r) => (
                <Pressable
                  key={r}
                  style={[styles.roleChip, user.userRole === r && { backgroundColor: ADMIN_THEME.accent }]}
                  onPress={() => void changeRole(user, r)}
                  disabled={isSelf(user)}
                >
                  <Text style={{ color: user.userRole === r ? '#fff' : shell.pageKicker, fontSize: 9, fontWeight: '700', opacity: isSelf(user) ? 0.45 : 1 }}>
                    {USER_ROLE_LABELS[r]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.suspendRow}>
              <Text style={[styles.suspendLabel, { color: shell.pageKicker }]}>
                Statut : {user.isActive ? 'Actif' : 'Suspendu'}
                {isSelf(user) ? ' · vous' : ''}
              </Text>
              <TogglePill
                value={user.isActive}
                onChange={(next) => void setUserActive(user, next)}
                activeLabel="Actif"
                inactiveLabel="Suspendu"
                activeColor="#10b981"
                shell={shell}
                disabled={isSelf(user)}
              />
            </View>
          </View>
        ))}

        {totalCount > PAGE_SIZE ? (
          <View style={styles.pagerRow}>
            <Pressable
              style={[styles.pagerBtn, { borderColor: shell.filterInactiveBorder, opacity: page <= 0 ? 0.4 : 1 }]}
              disabled={page <= 0}
              onPress={() => setPage((p) => Math.max(0, p - 1))}
            >
              <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Précédent</Text>
            </Pressable>
            <Text style={{ color: shell.pageKicker, fontSize: 12 }}>{pageLabel}</Text>
            <Pressable
              style={[
                styles.pagerBtn,
                { borderColor: shell.filterInactiveBorder, opacity: page + 1 >= totalPages ? 0.4 : 1 },
              ]}
              disabled={page + 1 >= totalPages}
              onPress={() => setPage((p) => p + 1)}
            >
              <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Suivant</Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAwareFormScroll>

      <Modal visible={editingUser != null} transparent animationType="slide" onRequestClose={() => setEditingUser(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
            <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>Modifier l'utilisateur</Text>
            <KeyboardAwareFormScroll style={styles.modalForm} nestedScrollEnabled keyboardPriority={10}>
              <Text style={[styles.label, { color: shell.pageKicker }]}>Prénom *</Text>
              <TextInput style={inputStyle} value={editFirstName} onChangeText={setEditFirstName} placeholderTextColor={shell.pageKicker} />
              <Text style={[styles.label, { color: shell.pageKicker }]}>Nom *</Text>
              <TextInput style={inputStyle} value={editLastName} onChangeText={setEditLastName} placeholderTextColor={shell.pageKicker} />
              <Text style={[styles.label, { color: shell.pageKicker }]}>Email</Text>
              <TextInput style={inputStyle} value={editEmail} onChangeText={setEditEmail} autoCapitalize="none" placeholderTextColor={shell.pageKicker} />
              <Text style={[styles.label, { color: shell.pageKicker }]}>Téléphone</Text>
              <TextInput style={inputStyle} value={editPhone} onChangeText={setEditPhone} keyboardType="phone-pad" placeholderTextColor={shell.pageKicker} />
              <GuineaLocationPicker
                value={editCity}
                onChange={setEditCity}
                shell={shell}
                label="Localisation"
                countryCode={editCountry || countryCode}
                allowCommuneOnly
              />
              <Text style={[styles.label, { color: shell.pageKicker }]}>Pays (code ISO)</Text>
              <TextInput style={inputStyle} value={editCountry} onChangeText={setEditCountry} placeholder="GN" placeholderTextColor={shell.pageKicker} autoCapitalize="characters" maxLength={2} />
              <Text style={[styles.label, { color: shell.pageKicker }]}>Date de naissance</Text>
              <TextInput style={inputStyle} value={editBirthDate} onChangeText={setEditBirthDate} placeholder="AAAA-MM-JJ" placeholderTextColor={shell.pageKicker} />
              <Text style={[styles.label, { color: shell.pageKicker }]}>Rôle</Text>
              <View style={styles.roleRow}>
                {assignableRoles.map((r) => (
                  <Pressable
                    key={r}
                    style={[styles.roleChip, editRole === r && { backgroundColor: ADMIN_THEME.accent }]}
                    onPress={() => setEditRole(r)}
                    disabled={Boolean(editingUser && isSelf(editingUser))}
                  >
                    <Text style={{ color: editRole === r ? '#fff' : shell.pageKicker, fontSize: 9, fontWeight: '700' }}>
                      {USER_ROLE_LABELS[r]}
                    </Text>
                  </Pressable>
                ))}
                {editingUser?.userRole === 'super_admin' && isSuperAdmin ? (
                  <Pressable
                    style={[styles.roleChip, editRole === 'super_admin' && { backgroundColor: ADMIN_THEME.accent }]}
                    onPress={() => setEditRole('super_admin')}
                    disabled={Boolean(editingUser && isSelf(editingUser))}
                  >
                    <Text style={{ color: editRole === 'super_admin' ? '#fff' : shell.pageKicker, fontSize: 9, fontWeight: '700' }}>
                      {USER_ROLE_LABELS.super_admin}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {editRole === 'partner' ? (
                <>
                  <Text style={[styles.label, { color: shell.pageKicker, marginTop: 12 }]}>Modules Espace Pro</Text>
                  <Text style={[styles.hint, { color: shell.pageKicker, marginBottom: 8 }]}>
                    Choisissez ce que ce partenaire peut soumettre et gérer.
                  </Text>
                  <View style={styles.scopeRow}>
                    <Text style={[styles.scopeLabel, { color: shell.pageTitle }]}>Événements</Text>
                    <TogglePill
                      value={editPartnerScopes.events}
                      onChange={(next) => setEditPartnerScopes((s) => ({ ...s, events: next }))}
                      activeLabel="Oui"
                      inactiveLabel="Non"
                      activeColor="#8b5cf6"
                      shell={shell}
                    />
                  </View>
                  <View style={styles.scopeRow}>
                    <Text style={[styles.scopeLabel, { color: shell.pageTitle }]}>Spots</Text>
                    <TogglePill
                      value={editPartnerScopes.spots}
                      onChange={(next) => setEditPartnerScopes((s) => ({ ...s, spots: next }))}
                      activeLabel="Oui"
                      inactiveLabel="Non"
                      activeColor="#10b981"
                      shell={shell}
                    />
                  </View>
                  <View style={styles.scopeRow}>
                    <Text style={[styles.scopeLabel, { color: shell.pageTitle }]}>Outils</Text>
                    <TogglePill
                      value={editPartnerScopes.tools}
                      onChange={(next) => setEditPartnerScopes((s) => ({ ...s, tools: next }))}
                      activeLabel="Oui"
                      inactiveLabel="Non"
                      activeColor="#6366f1"
                      shell={shell}
                    />
                  </View>
                </>
              ) : null}
              <Pressable
                style={[styles.activeToggle, { borderColor: shell.filterInactiveBorder }, editActive && { backgroundColor: 'rgba(16,185,129,0.15)' }]}
                onPress={() => {
                  if (editingUser && isSelf(editingUser)) {
                    Alert.alert('Action bloquée', 'Vous ne pouvez pas suspendre votre propre compte.');
                    return;
                  }
                  setEditActive((v) => !v);
                }}
                disabled={Boolean(editingUser && isSelf(editingUser))}
              >
                <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>{editActive ? '☑' : '☐'} Compte actif</Text>
              </Pressable>
              <Text style={[styles.hint, { color: shell.pageKicker }]}>
                Le mot de passe ne se modifie pas ici — utilisez « Reset MDP (OTP) ».
              </Text>
              {isSuperAdmin && editingUser && !isSelf(editingUser) ? (
                <View style={styles.lifecycleRow}>
                  <Pressable
                    style={[styles.lifecycleBtn, { borderColor: shell.filterInactiveBorder }]}
                    onPress={() => void handleArchiveUser()}
                  >
                    <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Archiver</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.lifecycleBtn, { borderColor: '#ef4444' }]}
                    onPress={() => void handleDeleteUser(editingUser)}
                  >
                    <Text style={{ color: '#ef4444', fontWeight: '700' }}>Supprimer</Text>
                  </Pressable>
                </View>
              ) : null}
            </KeyboardAwareFormScroll>
            <Pressable style={[styles.saveBtn, { backgroundColor: shell.tabIndicator }]} onPress={() => void handleSaveEdit()}>
              <Text style={styles.saveBtnText}>Enregistrer</Text>
            </Pressable>
            <Pressable style={styles.modalClose} onPress={() => setEditingUser(null)}>
              <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  searchInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  searchBtn: { borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  searchBtnText: { fontWeight: '800', color: '#000' },
  pagerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, marginBottom: 16 },
  pagerBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  createBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginBottom: 16, borderStyle: 'dashed' },
  loadError: { fontSize: 12, marginBottom: 12 },
  sourceBanner: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 },
  sourceBannerText: { fontSize: 11, lineHeight: 16, fontWeight: '600' },
  empty: { fontSize: 13, textAlign: 'center', marginBottom: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 15, fontWeight: '700', flex: 1 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  email: { marginTop: 4, fontSize: 12 },
  passHint: { marginTop: 4, fontSize: 11, fontWeight: '700' },
  scopeHint: { marginTop: 4, fontSize: 11, fontStyle: 'italic' },
  scopeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  scopeLabel: { fontSize: 13, fontWeight: '600' },
  actionRow: { flexDirection: 'row', gap: 16, marginTop: 10 },
  roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  roleChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(148,163,184,0.15)' },
  suspendRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suspendLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { borderWidth: 1, borderRadius: 16, maxHeight: '85%', margin: 12, marginBottom: 24 },
  modalTitle: { fontSize: 16, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16 },
  modalForm: { maxHeight: 420, paddingHorizontal: 16, flexGrow: 0 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8, fontSize: 14 },
  activeToggle: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 8 },
  hint: { fontSize: 11, marginTop: 8, fontStyle: 'italic', lineHeight: 16 },
  saveBtn: { marginHorizontal: 16, marginTop: 8, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { fontWeight: '800', color: '#000' },
  modalClose: { alignItems: 'center', paddingVertical: 14 },
  lifecycleRow: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 8 },
  lifecycleBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
