import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useContent } from '@/context/ContentContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { AdminActionIcon } from '@/components/admin/AdminActionIcon';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { GuineaLocationPicker } from '@/components/GuineaLocationPicker';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { formatDateFr } from '@/lib/date-utils';
import { getCountryLabel } from '@/lib/countries';
import {
  archiveAutomationJob,
  AUDIENCE_SCOPE_LABELS,
  AUTOMATION_ROLE_OPTIONS,
  createAutomationJob,
  deleteAutomationJob,
  formatAutomationJobDetailLines,
  getJobTypeLabel,
  JOB_SCHEDULE_LABELS,
  JOB_STATUS_LABELS,
  JOB_TYPE_LABELS,
  listAutomationJobs,
  NOTIFICATION_JOB_TYPES,
  peekAutomationJobs,
  setAutomationJobStatus,
  updateAutomationJob,
  type AutomationAudienceScope,
  type AutomationJob,
  type AutomationJobPayload,
  type AutomationJobSchedule,
  type AutomationJobStatus,
  type AutomationJobType,
} from '@/lib/admin-automation-jobs-store';
import {
  addCustomAutomationJobType,
  deleteCustomAutomationJobType,
  listCustomAutomationJobTypes,
  type CustomAutomationJobTypeDef,
} from '@/lib/automation-job-types-store';
import { getCategoryOptions } from '@/lib/admin-categories-store';
import { runAutomationJobNow, validateJobBeforeActivation } from '@/lib/admin-automation-runner';
import { listRegistryUsers, type RegistryUser } from '@/lib/user-registry-store';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';
import type { UserRole } from '@/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminAutomationJobs'>;
type ViewTab = 'all' | 'active' | 'inactive' | 'archived' | 'create' | 'types';

const SCHEDULES: AutomationJobSchedule[] = ['daily', 'monthly', 'yearly', 'on_signup', 'on_demand'];

const CUSTOM_BASE_TYPES: AutomationJobType[] = ['push_notification', 'birthday_greeting'];

interface JobFormState {
  name: string;
  jobType: AutomationJobType;
  customTypeLabel: string;
  schedule: AutomationJobSchedule;
  city: string;
  audienceScope: AutomationAudienceScope;
  targetRoles: UserRole[];
  targetUserIds: string[];
  targetPhones: string;
  targetEmails: string;
  favoriteEventCategories: string[];
  favoriteSpotCategories: string[];
  favoriteToolCategories: string[];
  notifTitle: string;
  notifMessage: string;
  birthdayTitle: string;
}

function emptyForm(): JobFormState {
  return {
    name: '',
    jobType: 'push_notification',
    customTypeLabel: '',
    schedule: 'daily',
    city: '',
    audienceScope: 'all',
    targetRoles: [],
    targetUserIds: [],
    targetPhones: '',
    targetEmails: '',
    favoriteEventCategories: [],
    favoriteSpotCategories: [],
    favoriteToolCategories: [],
    notifTitle: '',
    notifMessage: '',
    birthdayTitle: '',
  };
}

function splitTargets(raw: string): string[] {
  return raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
}

function joinTargets(list: string[] | undefined): string {
  return (list ?? []).join(', ');
}

function inferAudienceScope(job: AutomationJob): AutomationAudienceScope {
  const p = job.payload;
  if (p.audienceScope) return p.audienceScope;
  if ((p.targetUserIds?.length ?? 0) > 0 || (p.targetPhones?.length ?? 0) > 0 || (p.targetEmails?.length ?? 0) > 0) {
    return 'individual';
  }
  if ((p.targetRoles?.length ?? 0) > 0) return 'roles';
  return 'all';
}

function formFromJob(job: AutomationJob): JobFormState {
  return {
    name: job.name,
    jobType: job.jobType,
    customTypeLabel: job.payload.customTypeLabel ?? '',
    schedule: job.schedule,
    city: job.city ?? '',
    audienceScope: inferAudienceScope(job),
    targetRoles: job.payload.targetRoles ?? [],
    targetUserIds: job.payload.targetUserIds ?? [],
    targetPhones: joinTargets(job.payload.targetPhones),
    targetEmails: joinTargets(job.payload.targetEmails),
    favoriteEventCategories: job.payload.favoriteEventCategories ?? [],
    favoriteSpotCategories: job.payload.favoriteSpotCategories ?? [],
    favoriteToolCategories: job.payload.favoriteToolCategories ?? [],
    notifTitle: job.payload.notificationTitle ?? '',
    notifMessage: job.payload.notificationMessage ?? '',
    birthdayTitle: job.payload.birthdayTitle ?? '',
  };
}

function buildPayload(form: JobFormState): AutomationJobPayload {
  const payload: AutomationJobPayload = {
    customTypeLabel: form.customTypeLabel.trim() || undefined,
  };

  if (form.jobType === 'push_notification') {
    payload.audienceScope = form.audienceScope;
    if (form.audienceScope === 'roles') payload.targetRoles = form.targetRoles;
    if (form.audienceScope === 'individual') {
      const phones = splitTargets(form.targetPhones);
      const emails = splitTargets(form.targetEmails);
      if (form.targetUserIds.length) payload.targetUserIds = form.targetUserIds;
      if (phones.length) payload.targetPhones = phones;
      if (emails.length) payload.targetEmails = emails;
    }
    if (form.favoriteEventCategories.length) payload.favoriteEventCategories = form.favoriteEventCategories;
    if (form.favoriteSpotCategories.length) payload.favoriteSpotCategories = form.favoriteSpotCategories;
    if (form.favoriteToolCategories.length) payload.favoriteToolCategories = form.favoriteToolCategories;
    payload.notificationTitle = form.notifTitle.trim() || undefined;
    payload.notificationMessage = form.notifMessage.trim() || undefined;
  }

  if (form.jobType === 'birthday_greeting') {
    payload.birthdayTitle = form.birthdayTitle.trim() || undefined;
    payload.notificationMessage = form.notifMessage.trim() || undefined;
  }

  return payload;
}

function memberLabel(u: RegistryUser): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
  const contact = u.email ?? u.phoneNumber ?? u.id.slice(0, 8);
  return name ? `${name} (${contact})` : contact;
}

export function AdminAutomationJobsScreen({ navigation }: Props) {
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('automation');
  const { getHomeLocations } = useContent();

  const [view, setView] = useState<ViewTab>('all');
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [form, setForm] = useState<JobFormState>(emptyForm());
  const [detailJob, setDetailJob] = useState<AutomationJob | null>(null);
  const [editingJob, setEditingJob] = useState<AutomationJob | null>(null);
  const [saving, setSaving] = useState(false);
  const [customTypes, setCustomTypes] = useState<CustomAutomationJobTypeDef[]>([]);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [newTypeDesc, setNewTypeDesc] = useState('');
  const [newTypeBase, setNewTypeBase] = useState<AutomationJobType>('push_notification');
  const [eventCats, setEventCats] = useState<Array<{ id: string; label: string }>>([]);
  const [spotCats, setSpotCats] = useState<Array<{ id: string; label: string }>>([]);
  const [toolCats, setToolCats] = useState<Array<{ id: string; label: string }>>([]);
  const [registryUsers, setRegistryUsers] = useState<RegistryUser[]>([]);
  const [memberSearch, setMemberSearch] = useState('');

  const load = useCallback(async () => {
    const [ev, sp, tl, custom, users] = await Promise.all([
      getCategoryOptions('event'),
      getCategoryOptions('spot'),
      getCategoryOptions('tool'),
      listCustomAutomationJobTypes(),
      listRegistryUsers(),
    ]);
    setEventCats(ev.map((c) => ({ id: c.id, label: c.label })));
    setSpotCats(sp.map((c) => ({ id: c.id, label: c.label })));
    setToolCats(tl.map((c) => ({ id: c.id, label: c.label })));
    setCustomTypes(custom);
    setRegistryUsers(users.filter((u) => u.role !== 'USER_ANONYMOUS'));

    if (view === 'create' || view === 'types') return;

    const filterJobs = (all: AutomationJob[]) => {
      let filtered = all.filter((j) => j.countryCode === countryCode);
      if (view === 'archived') return filtered.filter((j) => j.status === 'archived');
      if (view === 'active') return filtered.filter((j) => j.status === 'active');
      if (view === 'inactive') return filtered.filter((j) => j.status === 'inactive');
      return filtered.filter((j) => j.status !== 'archived');
    };

    setJobs(filterJobs(await peekAutomationJobs()));
    setJobs(
      filterJobs(
        await listAutomationJobs(
          view === 'archived'
            ? { status: 'archived', includeArchived: true, countryCode }
            : view === 'active'
              ? { status: 'active', countryCode }
              : view === 'inactive'
                ? { status: 'inactive', countryCode }
                : { includeArchived: true, countryCode },
        ),
      ),
    );
  }, [view, countryCode]);

  useFocusLoad(
    async () => {
      await load();
    },
    { ttlMs: 60_000, resetKey: `${view}:${countryCode}` },
  );

  useEffect(() => {
    if (view !== 'create' || editingJob) return;
    if (form.jobType === 'birthday_greeting' || form.jobType === 'spot_stars') {
      setForm((f) => ({ ...f, schedule: 'daily' }));
    } else if (form.jobType === 'push_notification' && form.schedule === 'on_signup') {
      setForm((f) => ({ ...f, schedule: 'daily' }));
    }
  }, [form.jobType, view, editingJob]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return registryUsers
      .filter((u) => !countryCode || u.countryCode === countryCode || !u.countryCode)
      .filter((u) => {
        if (!q) return true;
        const hay = `${u.firstName ?? ''} ${u.lastName ?? ''} ${u.email ?? ''} ${u.phoneNumber ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [registryUsers, memberSearch, countryCode]);

  function selectJobType(type: AutomationJobType, customLabel?: string) {
    setForm((prev) => ({
      ...prev,
      jobType: type,
      customTypeLabel: customLabel ?? '',
      audienceScope: type === 'birthday_greeting' ? 'all' : prev.audienceScope,
    }));
  }

  function setAudienceScope(scope: AutomationAudienceScope) {
    setForm((prev) => ({
      ...prev,
      audienceScope: scope,
      targetRoles: scope === 'roles' ? prev.targetRoles : [],
      targetUserIds: scope === 'individual' ? prev.targetUserIds : [],
      targetPhones: scope === 'individual' ? prev.targetPhones : '',
      targetEmails: scope === 'individual' ? prev.targetEmails : '',
    }));
  }

  function toggleRole(role: UserRole) {
    setForm((prev) => ({
      ...prev,
      targetRoles: prev.targetRoles.includes(role)
        ? prev.targetRoles.filter((r) => r !== role)
        : [...prev.targetRoles, role],
    }));
  }

  function toggleMember(userId: string) {
    setForm((prev) => ({
      ...prev,
      targetUserIds: prev.targetUserIds.includes(userId)
        ? prev.targetUserIds.filter((id) => id !== userId)
        : [...prev.targetUserIds, userId],
    }));
  }

  function toggleFavCat(kind: 'event' | 'spot' | 'tool', id: string) {
    const key =
      kind === 'event' ? 'favoriteEventCategories' : kind === 'spot' ? 'favoriteSpotCategories' : 'favoriteToolCategories';
    setForm((prev) => {
      const list = prev[key];
      return { ...prev, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
    });
  }

  function patchForm<K extends keyof JobFormState>(key: K, value: JobFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleCreate() {
    if (!form.name.trim()) {
      Alert.alert('Nom requis', 'Donnez un libellé à ce job.');
      return;
    }
    setSaving(true);
    try {
      await createAutomationJob({
        name: form.name.trim(),
        jobType: form.jobType,
        countryCode,
        city: form.city.trim() || null,
        schedule: form.schedule,
        status: 'inactive',
        payload: buildPayload(form),
      });
      setForm(emptyForm());
      setView('inactive');
      Alert.alert('Job créé', 'Activez-le quand vous êtes prêt.');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingJob || !form.name.trim()) {
      Alert.alert('Nom requis', 'Donnez un libellé à ce job.');
      return;
    }
    setSaving(true);
    try {
      await updateAutomationJob(editingJob.id, {
        name: form.name.trim(),
        schedule: form.schedule,
        city: form.city.trim() || null,
        payload: buildPayload(form),
      });
      setEditingJob(null);
      setForm(emptyForm());
      Alert.alert('Enregistré', 'Le job a été mis à jour.');
      await load();
    } finally {
      setSaving(false);
    }
  }

  function openEdit(job: AutomationJob) {
    setEditingJob(job);
    setForm(formFromJob(job));
    setDetailJob(null);
  }

  async function toggleStatus(job: AutomationJob) {
    const next: AutomationJobStatus = job.status === 'active' ? 'inactive' : 'active';
    if (next === 'active') {
      const err = await validateJobBeforeActivation(job);
      if (err) {
        Alert.alert('Activation impossible', err);
        return;
      }
    }
    await setAutomationJobStatus(job.id, next);
    await load();
    if (detailJob?.id === job.id) setDetailJob({ ...job, status: next });
  }

  function confirmDeleteJob(job: AutomationJob) {
    Alert.alert(
      'Supprimer ce job ?',
      `"${job.name}" sera supprimé définitivement.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const ok = await deleteAutomationJob(job.id);
              if (!ok) {
                Alert.alert('Erreur', 'Impossible de supprimer ce job.');
                return;
              }
              setDetailJob(null);
              await load();
            })();
          },
        },
      ],
    );
  }

  async function runNow(job: AutomationJob, force = false) {
    if (job.status === 'inactive' && !force) {
      Alert.alert(
        'Job inactif',
        'Lancer quand même une exécution manuelle ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Exécuter', onPress: () => void runNow(job, true) },
        ],
      );
      return;
    }
    const res = await runAutomationJobNow(job.id, { getHomeLocations }, { force: job.status === 'inactive' });
    if (!res) {
      Alert.alert('Indisponible', 'Impossible d\'exécuter ce job.');
      return;
    }
    Alert.alert('Exécution terminée', res.summary);
    await load();
    if (detailJob?.id === job.id) {
      const updated = (await listAutomationJobs({ includeArchived: true, countryCode })).find((j) => j.id === job.id);
      if (updated) setDetailJob(updated);
    }
  }

  async function handleAddCustomType() {
    if (!newTypeLabel.trim()) {
      Alert.alert('Libellé requis', 'Donnez un nom au type.');
      return;
    }
    await addCustomAutomationJobType({
      label: newTypeLabel.trim(),
      description: newTypeDesc.trim() || undefined,
      baseJobType: newTypeBase,
    });
    setNewTypeLabel('');
    setNewTypeDesc('');
    await load();
    Alert.alert('Type créé', 'Il apparaît dans l\'onglet Créer.');
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  return (
    <>
      <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
        <AdminPageHeader
          title="Automatisations"
          subtitle="Envoi de notifications planifiées"
          shell={shell}
          onBack={() => navigation.goBack()}
        />
        <AdminCountryBar shell={shell} compact />

        <AdminTabMenu
          tabs={[
            { id: 'all', label: 'Tous' },
            { id: 'active', label: 'Actifs' },
            { id: 'inactive', label: 'Inactifs' },
            { id: 'archived', label: 'Archivés' },
            { id: 'create', label: 'Créer' },
            { id: 'types', label: 'Types' },
          ]}
          active={view}
          onChange={(v) => {
            setView(v);
            setEditingJob(null);
            if (v === 'create') setForm(emptyForm());
          }}
          shell={shell}
          accent={ADMIN_THEME.accent}
        />

        {view === 'create' ? (
          <JobFormFields
            form={form}
            shell={shell}
            customTypes={customTypes}
            eventCats={eventCats}
            spotCats={spotCats}
            toolCats={toolCats}
            filteredMembers={filteredMembers}
            memberSearch={memberSearch}
            onMemberSearchChange={setMemberSearch}
            countryCode={countryCode}
            onSelectJobType={selectJobType}
            onSetAudienceScope={setAudienceScope}
            onToggleRole={toggleRole}
            onToggleMember={toggleMember}
            onToggleFavCat={toggleFavCat}
            onPatch={patchForm}
          />
        ) : null}

        {view === 'create' ? (
          <Pressable style={[styles.submit, { backgroundColor: ADMIN_THEME.accent }]} onPress={() => void handleCreate()} disabled={saving}>
            <Text style={styles.submitText}>{saving ? 'Création…' : 'Créer le job (inactif)'}</Text>
          </Pressable>
        ) : null}

        {view === 'types' ? (
          <View>
            <Text style={[styles.hint, { color: shell.pageKicker }]}>
              Optionnel. Enregistrez un nom réutilisable (ex. « Relance Prime ») pour classer vos jobs dans la liste.
              L&apos;onglet Créer suffit si vous n&apos;avez pas besoin de noms personnalisés.
            </Text>
            <Text style={[styles.label, { color: shell.pageKicker }]}>Libellé du type *</Text>
            <TextInput
              style={inputStyle(shell)}
              value={newTypeLabel}
              onChangeText={setNewTypeLabel}
              placeholder="Ex. Relance Prime"
              placeholderTextColor={shell.pageKicker}
            />
            <Text style={[styles.label, { color: shell.pageKicker }]}>Description (optionnel)</Text>
            <TextInput
              style={[inputStyle(shell), styles.multiline]}
              value={newTypeDesc}
              onChangeText={setNewTypeDesc}
              multiline
              placeholder="Usage interne…"
              placeholderTextColor={shell.pageKicker}
            />
            <Text style={[styles.label, { color: shell.pageKicker }]}>Basé sur *</Text>
            <Text style={[styles.hint, { color: shell.pageKicker, marginTop: 0 }]}>
              Même moteur que dans Créer : notification planifiée ou vœux anniversaire automatiques.
            </Text>
            <View style={styles.chipRow}>
              {CUSTOM_BASE_TYPES.map((t) => (
                <Pressable key={t} style={[styles.chip, chipStyle(shell, newTypeBase === t)]} onPress={() => setNewTypeBase(t)}>
                  <Text style={{ color: newTypeBase === t ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '700' }}>
                    {JOB_TYPE_LABELS[t]}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable style={[styles.submit, { backgroundColor: ADMIN_THEME.accent }]} onPress={() => void handleAddCustomType()}>
              <Text style={styles.submitText}>Créer le type</Text>
            </Pressable>
            {customTypes.length ? (
              <>
                <Text style={[styles.section, { color: shell.pageKicker }]}>Types existants</Text>
                {customTypes.map((t) => (
                  <View key={t.id} style={[styles.card, { borderColor: shell.filterInactiveBorder }]}>
                    <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>{t.label}</Text>
                    {t.description ? (
                      <Text style={{ color: shell.pageKicker, fontSize: 12, marginTop: 4 }}>{t.description}</Text>
                    ) : null}
                    <Text style={{ color: shell.pageKicker, fontSize: 11, marginTop: 4 }}>
                      Basé sur : {JOB_TYPE_LABELS[t.baseJobType]}
                    </Text>
                    <Pressable onPress={() => void deleteCustomAutomationJobType(t.id).then(() => load())} style={{ marginTop: 8 }}>
                      <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 12 }}>Supprimer</Text>
                    </Pressable>
                  </View>
                ))}
              </>
            ) : (
              <Text style={[styles.hint, { color: shell.pageKicker, textAlign: 'center', marginTop: 16 }]}>
                Aucun type personnalisé pour l&apos;instant.
              </Text>
            )}
          </View>
        ) : null}

        {view !== 'create' && view !== 'types'
          ? jobs.map((job) => (
              <View
                key={job.id}
                style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
              >
                <Pressable onPress={() => setDetailJob(job)}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>{job.name}</Text>
                    <View style={styles.cardHeaderActions}>
                      {job.schedule !== 'on_signup' ? (
                        <AdminActionIcon action="run" onPress={() => void runNow(job)} />
                      ) : null}
                      <Text style={[styles.status, { color: job.status === 'active' ? '#34d399' : '#94a3b8' }]}>
                        {JOB_STATUS_LABELS[job.status]}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.meta, { color: shell.pageKicker }]}>
                    {getJobTypeLabel(job.jobType, job.payload.customTypeLabel)} · {JOB_SCHEDULE_LABELS[job.schedule]}
                    {job.city ? ` · ${job.city}` : ' · Toutes villes'}
                  </Text>
                  {job.lastRunAt ? (
                    <Text style={[styles.meta, { color: shell.pageKicker }]}>
                      Dernière exécution : {formatDateFr(job.lastRunAt)}
                      {job.lastRunCount != null ? ` (${job.lastRunCount})` : ''}
                    </Text>
                  ) : (
                    <Text style={[styles.meta, { color: shell.pageKicker, fontStyle: 'italic' }]}>Jamais exécuté</Text>
                  )}
                  <Text style={{ color: ADMIN_THEME.accent, fontWeight: '700', fontSize: 11, marginTop: 8 }}>Voir détails →</Text>
                </Pressable>
              </View>
            ))
          : null}

        {view !== 'create' && view !== 'types' && jobs.length === 0 ? (
          <Text style={[styles.hint, { color: shell.pageKicker, textAlign: 'center', marginTop: 24 }]}>
            Aucun job dans cette catégorie.
          </Text>
        ) : null}
      </KeyboardAwareFormScroll>

      <JobDetailModal
        job={detailJob}
        registryUsers={registryUsers}
        shell={shell}
        view={view}
        onClose={() => setDetailJob(null)}
        onEdit={() => detailJob && openEdit(detailJob)}
        onToggleStatus={() => detailJob && void toggleStatus(detailJob)}
        onRunNow={() => detailJob && void runNow(detailJob)}
        onArchive={() => detailJob && void archiveAutomationJob(detailJob.id).then(() => { setDetailJob(null); void load(); })}
        onRestore={() => detailJob && void setAutomationJobStatus(detailJob.id, 'inactive').then(() => { setDetailJob(null); void load(); })}
        onDelete={() => detailJob && confirmDeleteJob(detailJob)}
      />

      <Modal visible={editingJob != null} transparent animationType="slide" onRequestClose={() => setEditingJob(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
            <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>Modifier le job</Text>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} nestedScrollEnabled>
              <JobFormFields
                form={form}
                shell={shell}
                customTypes={customTypes}
                eventCats={eventCats}
                spotCats={spotCats}
                toolCats={toolCats}
                filteredMembers={filteredMembers}
                memberSearch={memberSearch}
                onMemberSearchChange={setMemberSearch}
                countryCode={countryCode}
                onSelectJobType={selectJobType}
                onSetAudienceScope={setAudienceScope}
                onToggleRole={toggleRole}
                onToggleMember={toggleMember}
                onToggleFavCat={toggleFavCat}
                onPatch={patchForm}
                lockType
              />
            </ScrollView>
            <Pressable style={[styles.submit, { backgroundColor: ADMIN_THEME.accent, marginHorizontal: 16 }]} onPress={() => void handleSaveEdit()} disabled={saving}>
              <Text style={styles.submitText}>{saving ? 'Enregistrement…' : 'Enregistrer'}</Text>
            </Pressable>
            <Pressable style={styles.modalClose} onPress={() => { setEditingJob(null); setForm(emptyForm()); }}>
              <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function JobFormFields({
  form,
  shell,
  customTypes,
  eventCats,
  spotCats,
  toolCats,
  filteredMembers,
  memberSearch,
  onMemberSearchChange,
  countryCode,
  onPatch,
  onSelectJobType,
  onSetAudienceScope,
  onToggleRole,
  onToggleMember,
  onToggleFavCat,
  lockType = false,
}: {
  form: JobFormState;
  shell: ReturnType<typeof useMemberTheme>['shell'];
  customTypes: CustomAutomationJobTypeDef[];
  eventCats: Array<{ id: string; label: string }>;
  spotCats: Array<{ id: string; label: string }>;
  toolCats: Array<{ id: string; label: string }>;
  filteredMembers: RegistryUser[];
  memberSearch: string;
  onMemberSearchChange: (v: string) => void;
  countryCode: string;
  onPatch: <K extends keyof JobFormState>(key: K, value: JobFormState[K]) => void;
  onSelectJobType: (type: AutomationJobType, customLabel?: string) => void;
  onSetAudienceScope: (scope: AutomationAudienceScope) => void;
  onToggleRole: (role: UserRole) => void;
  onToggleMember: (userId: string) => void;
  onToggleFavCat: (kind: 'event' | 'spot' | 'tool', id: string) => void;
  lockType?: boolean;
}) {
  const isNotification = form.jobType === 'push_notification';
  const isBirthday = form.jobType === 'birthday_greeting';
  const isSpotStars = form.jobType === 'spot_stars';
  const isLegacyBenefit = !NOTIFICATION_JOB_TYPES.includes(form.jobType);

  return (
    <View>
      <Text style={[styles.label, { color: shell.pageKicker }]}>Nom du job *</Text>
      <TextInput
        style={inputStyle(shell)}
        value={form.name}
        onChangeText={(t) => onPatch('name', t)}
        placeholder="Ex. Rappel événements du week-end"
        placeholderTextColor={shell.pageKicker}
      />

      <Text style={[styles.label, { color: shell.pageKicker }]}>Type de job</Text>
      {lockType ? (
        <Text style={[styles.lockedType, { color: shell.pageTitle }]}>
          {getJobTypeLabel(form.jobType, form.customTypeLabel)}
        </Text>
      ) : (
        <>
          <Text style={[styles.hint, { color: shell.pageKicker, marginTop: 0 }]}>
            Choisissez directement un modèle ci-dessous, ou un nom enregistré dans l&apos;onglet Types.
          </Text>
          <Text style={[styles.hint, { color: shell.pageKicker, fontWeight: '700' }]}>Modèles par défaut</Text>
          <View style={styles.chipRow}>
            {NOTIFICATION_JOB_TYPES.map((t) => (
              <Pressable
                key={t}
                style={[styles.chip, chipStyle(shell, form.jobType === t && !form.customTypeLabel)]}
                onPress={() => onSelectJobType(t)}
              >
                <Text style={{ color: form.jobType === t && !form.customTypeLabel ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '700' }}>
                  {JOB_TYPE_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </View>
          {customTypes.length ? (
            <>
              <Text style={[styles.hint, { color: shell.pageKicker, fontWeight: '700' }]}>Vos modèles (onglet Types)</Text>
              <View style={styles.chipRow}>
                {customTypes.map((t) => {
                  const active = form.customTypeLabel === t.label && form.jobType === t.baseJobType;
                  return (
                    <Pressable
                      key={t.id}
                      style={[styles.chip, chipStyle(shell, active)]}
                      onPress={() => onSelectJobType(t.baseJobType, t.label)}
                    >
                      <Text style={{ color: active ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '700' }}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
        </>
      )}

      {isLegacyBenefit ? (
        <Text style={[styles.hint, { color: '#f59e0b' }]}>
          Job legacy (octroi avantages). Les nouveaux jobs n&apos;envoient que des notifications. Créez un job « Notification » ou « Vœux anniversaire ».
        </Text>
      ) : null}

      {isNotification && form.audienceScope === 'individual' ? (
        <>
          <Text style={[styles.section, { color: shell.pageKicker }]}>Membres ciblés</Text>
          <TextInput
            style={inputStyle(shell)}
            value={memberSearch}
            onChangeText={onMemberSearchChange}
            placeholder="Rechercher un membre…"
            placeholderTextColor={shell.pageKicker}
          />
          <View style={styles.chipRow}>
            {filteredMembers.map((u) => {
              const active = form.targetUserIds.includes(u.id);
              return (
                <Pressable key={u.id} style={[styles.chip, chipStyle(shell, active)]} onPress={() => onToggleMember(u.id)}>
                  <Text style={{ color: active ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>
                    {memberLabel(u)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.label, { color: shell.pageKicker }]}>Téléphones (virgules)</Text>
          <TextInput
            style={inputStyle(shell)}
            value={form.targetPhones}
            onChangeText={(t) => onPatch('targetPhones', t)}
            placeholder="+224…"
            placeholderTextColor={shell.pageKicker}
          />
          <Text style={[styles.label, { color: shell.pageKicker }]}>E-mails (virgules)</Text>
          <TextInput
            style={inputStyle(shell)}
            value={form.targetEmails}
            onChangeText={(t) => onPatch('targetEmails', t)}
            placeholder="membre@…"
            placeholderTextColor={shell.pageKicker}
            autoCapitalize="none"
          />
        </>
      ) : null}

      {isNotification ? (
        <>
          <Text style={[styles.section, { color: shell.pageKicker }]}>Audience</Text>
          <View style={styles.chipRow}>
            {(Object.keys(AUDIENCE_SCOPE_LABELS) as AutomationAudienceScope[]).map((scope) => (
              <Pressable key={scope} style={[styles.chip, chipStyle(shell, form.audienceScope === scope)]} onPress={() => onSetAudienceScope(scope)}>
                <Text style={{ color: form.audienceScope === scope ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '700' }}>
                  {AUDIENCE_SCOPE_LABELS[scope]}
                </Text>
              </Pressable>
            ))}
          </View>
          {form.audienceScope === 'roles' ? (
            <>
              <Text style={[styles.label, { color: shell.pageKicker }]}>Rôles (multi-sélection)</Text>
              <View style={styles.chipRow}>
                {AUTOMATION_ROLE_OPTIONS.map((r) => (
                  <Pressable key={r.id} style={[styles.chip, chipStyle(shell, form.targetRoles.includes(r.id))]} onPress={() => onToggleRole(r.id)}>
                    <Text style={{ color: form.targetRoles.includes(r.id) ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '700' }}>
                      {r.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <Text style={[styles.label, { color: shell.pageKicker }]}>Filtrer par favoris (optionnel, multi-catégories)</Text>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>Événements</Text>
          <View style={styles.chipRow}>
            {eventCats.map((c) => (
              <Pressable key={c.id} style={[styles.chip, chipStyle(shell, form.favoriteEventCategories.includes(c.id))]} onPress={() => onToggleFavCat('event', c.id)}>
                <Text style={{ color: form.favoriteEventCategories.includes(c.id) ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>Spots</Text>
          <View style={styles.chipRow}>
            {spotCats.map((c) => (
              <Pressable key={c.id} style={[styles.chip, chipStyle(shell, form.favoriteSpotCategories.includes(c.id))]} onPress={() => onToggleFavCat('spot', c.id)}>
                <Text style={{ color: form.favoriteSpotCategories.includes(c.id) ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>Outils</Text>
          <View style={styles.chipRow}>
            {toolCats.map((c) => (
              <Pressable key={c.id} style={[styles.chip, chipStyle(shell, form.favoriteToolCategories.includes(c.id))]} onPress={() => onToggleFavCat('tool', c.id)}>
                <Text style={{ color: form.favoriteToolCategories.includes(c.id) ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <Text style={[styles.label, { color: shell.pageKicker }]}>Fréquence</Text>
      <View style={styles.chipRow}>
        {SCHEDULES.filter((s) => (isBirthday || isSpotStars ? s !== 'on_signup' : true)).map((s) => (
          <Pressable key={s} style={[styles.chip, chipStyle(shell, form.schedule === s)]} onPress={() => onPatch('schedule', s)}>
            <Text style={{ color: form.schedule === s ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '700' }}>{JOB_SCHEDULE_LABELS[s]}</Text>
          </Pressable>
        ))}
      </View>

      <GuineaLocationPicker
        value={form.city}
        onChange={(v) => onPatch('city', v)}
        shell={shell}
        label="Zone géographique"
        countryCode={countryCode}
        allowCommuneOnly
        optional
        placeholder="Vide = tout le pays"
      />

      {isNotification ? (
        <>
          <Text style={[styles.label, { color: shell.pageKicker }]}>Titre notification *</Text>
          <TextInput style={inputStyle(shell)} value={form.notifTitle} onChangeText={(t) => onPatch('notifTitle', t)} placeholderTextColor={shell.pageKicker} />
          <Text style={[styles.label, { color: shell.pageKicker }]}>Message *</Text>
          <TextInput style={[inputStyle(shell), styles.multiline]} value={form.notifMessage} onChangeText={(t) => onPatch('notifMessage', t)} multiline placeholderTextColor={shell.pageKicker} />
        </>
      ) : null}

      {isBirthday ? (
        <>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Envoie un message le jour J aux membres dont la date de naissance correspond (profil). Fréquence quotidienne recommandée. Placeholder {'{name}'} disponible.
          </Text>
          <Text style={[styles.label, { color: shell.pageKicker }]}>Titre</Text>
          <TextInput style={inputStyle(shell)} value={form.birthdayTitle} onChangeText={(t) => onPatch('birthdayTitle', t)} placeholder="Joyeux anniversaire ! 🎂" placeholderTextColor={shell.pageKicker} />
          <Text style={[styles.label, { color: shell.pageKicker }]}>Message *</Text>
          <TextInput style={[inputStyle(shell), styles.multiline]} value={form.notifMessage} onChangeText={(t) => onPatch('notifMessage', t)} multiline placeholder="Bon anniversaire {name} !" placeholderTextColor={shell.pageKicker} />
        </>
      ) : null}

      {isSpotStars ? (
        <Text style={[styles.hint, { color: shell.pageKicker }]}>
          Job technique : recalcule les étoiles des spots. Aucun message envoyé aux membres.
        </Text>
      ) : null}
    </View>
  );
}

function JobDetailModal({
  job,
  registryUsers,
  shell,
  view,
  onClose,
  onEdit,
  onToggleStatus,
  onRunNow,
  onArchive,
  onRestore,
  onDelete,
}: {
  job: AutomationJob | null;
  registryUsers: RegistryUser[];
  shell: ReturnType<typeof useMemberTheme>['shell'];
  view: ViewTab;
  onClose: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onRunNow: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  if (!job) return null;

  const detailLines = formatAutomationJobDetailLines(job);
  const memberNames =
    (job.payload.targetUserIds ?? [])
      .map((id) => {
        const u = registryUsers.find((r) => r.id === id);
        return u ? memberLabel(u) : id.slice(0, 8);
      })
      .join(' · ') || null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
          <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>{job.name}</Text>

          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} nestedScrollEnabled>
            <Text style={[styles.section, { color: shell.pageKicker }]}>Résumé</Text>
            {detailLines.map((line) => (
              <Text key={line} style={[styles.detailSummaryLine, { color: shell.pageTitle }]}>
                · {line}
              </Text>
            ))}

            {memberNames ? <DetailRow label="Membres ciblés" value={memberNames} shell={shell} /> : null}
            <DetailRow label="Statut" value={JOB_STATUS_LABELS[job.status]} shell={shell} />
            <DetailRow label="Type" value={getJobTypeLabel(job.jobType, job.payload.customTypeLabel)} shell={shell} />
            <DetailRow label="Fréquence" value={JOB_SCHEDULE_LABELS[job.schedule] ?? job.schedule} shell={shell} />
            <DetailRow label="Pays" value={getCountryLabel(job.countryCode)} shell={shell} />
            <DetailRow label="Zone" value={job.city ?? 'Tout le pays'} shell={shell} />

            {job.payload.notificationTitle ? (
              <DetailRow label="Titre" value={job.payload.notificationTitle} shell={shell} />
            ) : null}
            {job.payload.notificationMessage ? (
              <DetailRow label="Message" value={job.payload.notificationMessage} shell={shell} />
            ) : null}
            {job.payload.birthdayTitle ? (
              <DetailRow label="Titre anniversaire" value={job.payload.birthdayTitle} shell={shell} />
            ) : null}

            <Text style={[styles.section, { color: shell.pageKicker }]}>Exécution</Text>
            <DetailRow
              label="Automatique"
              value={job.status === 'active' ? `Oui — ${JOB_SCHEDULE_LABELS[job.schedule]}` : 'Non — job inactif'}
              shell={shell}
            />
            <DetailRow
              label="Dernière exécution"
              value={
                job.lastRunAt
                  ? `${formatDateFr(job.lastRunAt)}${job.lastRunCount != null ? ` (${job.lastRunCount})` : ''}`
                  : 'Jamais'
              }
              shell={shell}
            />
            {job.lastRunSummary ? <DetailRow label="Résumé" value={job.lastRunSummary} shell={shell} /> : null}

            <Text style={[styles.section, { color: shell.pageKicker }]}>Métadonnées</Text>
            <DetailRow label="Identifiant" value={job.id} shell={shell} />
            <DetailRow label="Créé le" value={formatDateFr(job.createdAt)} shell={shell} />
            <DetailRow label="Mis à jour" value={formatDateFr(job.updatedAt)} shell={shell} />
          </ScrollView>

          <View style={styles.detailActions}>
            {view !== 'archived' ? <AdminActionIcon action="edit" color={ADMIN_THEME.accent} onPress={onEdit} /> : null}
            {view !== 'archived' ? (
              <AdminActionIcon action={job.status === 'active' ? 'deactivate' : 'publish'} onPress={onToggleStatus} />
            ) : null}
            {job.schedule !== 'on_signup' ? <AdminActionIcon action="run" onPress={onRunNow} /> : null}
            {view !== 'archived' ? (
              <AdminActionIcon action="archive" onPress={onArchive} />
            ) : (
              <AdminActionIcon action="publish" color={ADMIN_THEME.accent} onPress={onRestore} />
            )}
            <AdminActionIcon action="delete" onPress={onDelete} />
          </View>

          <Pressable style={styles.modalClose} onPress={onClose}>
            <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Fermer</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  shell,
}: {
  label: string;
  value: string;
  shell: ReturnType<typeof useMemberTheme>['shell'];
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={[styles.detailLabel, { color: shell.pageKicker }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: shell.pageTitle }]}>{value}</Text>
    </View>
  );
}

function inputStyle(shell: ReturnType<typeof useMemberTheme>['shell']) {
  return [styles.input, { borderColor: shell.filterInactiveBorder, color: shell.pageTitle, backgroundColor: shell.filterInactiveBg }];
}

function chipStyle(shell: ReturnType<typeof useMemberTheme>['shell'], active: boolean) {
  return {
    borderColor: shell.filterInactiveBorder,
    backgroundColor: active ? ADMIN_THEME.accent : shell.filterInactiveBg,
  };
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 12, marginBottom: 6 },
  section: { marginTop: 16, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  hint: { fontSize: 11, lineHeight: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8, fontSize: 14 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  lockedType: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  submit: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { fontWeight: '800', color: '#000' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' },
  cardHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardTitle: { fontWeight: '700', flex: 1, fontSize: 14 },
  status: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  meta: { marginTop: 4, fontSize: 11, lineHeight: 16 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { borderWidth: 1, borderRadius: 16, maxHeight: '90%', margin: 12, marginBottom: 24, overflow: 'hidden' },
  modalTitle: { fontSize: 16, fontWeight: '800', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  modalScroll: { flexGrow: 0, maxHeight: 420 },
  modalScrollContent: { paddingHorizontal: 16, paddingBottom: 16 },
  modalClose: { alignItems: 'center', paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.3)' },
  detailRow: { marginBottom: 12 },
  detailSummaryLine: { fontSize: 13, lineHeight: 20, marginBottom: 6 },
  detailLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  detailValue: { marginTop: 4, fontSize: 13, lineHeight: 20 },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.3)' },
});
