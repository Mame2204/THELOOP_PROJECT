import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { DateTimeField } from '@/components/DateTimeField';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { CollapsibleMessage } from '@/components/CollapsibleMessage';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { useAdminCountry } from '@/context/AdminCountryContext';
import {
  AUDIENCE_LABELS,
  cancelScheduledNotification,
  clearAdminNotificationHistory,
  listAdminNotifications,
  sendAdminNotification,
  STATUS_LABELS,
  type AdminNotification,
  type NotificationAudience,
} from '@/lib/admin-notifications-store';
import { clearUserNotifications } from '@/lib/user-notifications-store';
import { formatDateFr } from '@/lib/date-utils';
import { getCategoryOptions } from '@/lib/admin-categories-store';
import type { EventCategory, LocationSubCategory } from '@/types';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminNotifications'>;

const AUDIENCES: NotificationAudience[] = [
  'all',
  'prime_members',
  'members',
  'prime',
  'partner',
  'admin',
  'favorites',
  'birthday',
  'individual',
];

export function AdminNotificationsScreen({ navigation }: Props) {
  const { role, user } = useAuthContext();
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('notifications');

  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<NotificationAudience>('all');
  const [targetPhone, setTargetPhone] = useState('');
  const [favoriteEventCategories, setFavoriteEventCategories] = useState<EventCategory[]>([]);
  const [favoriteSpotCategories, setFavoriteSpotCategories] = useState<LocationSubCategory[]>([]);
  const [favoriteToolCategories, setFavoriteToolCategories] = useState<string[]>([]);
  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [history, setHistory] = useState<AdminNotification[]>([]);
  const [sending, setSending] = useState(false);
  const [eventCategoryOptions, setEventCategoryOptions] = useState<Array<{ id: string; label: string; emoji?: string }>>([]);
  const [spotCategoryOptions, setSpotCategoryOptions] = useState<Array<{ id: string; label: string; emoji?: string }>>([]);
  const [toolCategoryOptions, setToolCategoryOptions] = useState<Array<{ id: string; label: string; emoji?: string }>>([]);

  const load = useCallback(async () => {
    setHistory(await listAdminNotifications(countryCode));
  }, [countryCode]);

  const loadCategoryOptions = useCallback(() => {
    const mapOpts = (cats: Array<{ id: string; label: string; emoji: string }>) =>
      cats.map((c) => ({
        id: c.id,
        label: c.emoji ? `${c.emoji} ${c.label}` : c.label,
      }));
    void getCategoryOptions('event', { forceRemote: true }).then((cats) => setEventCategoryOptions(mapOpts(cats)));
    void getCategoryOptions('spot', { forceRemote: true }).then((cats) => setSpotCategoryOptions(mapOpts(cats)));
    void getCategoryOptions('tool', { forceRemote: true }).then((cats) => setToolCategoryOptions(mapOpts(cats)));
  }, []);

  useEffect(() => {
    if (role === 'ADMIN') loadCategoryOptions();
  }, [role, loadCategoryOptions]);

  useEffect(() => {
    if (role === 'ADMIN') void load();
  }, [role, load]);

  if (role !== 'ADMIN') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Accès réservé aux administrateurs</Text>
      </View>
    );
  }

  const inputStyle = [styles.input, { backgroundColor: shell.filterInactiveBg, borderColor: shell.filterInactiveBorder, color: shell.pageTitle }];

  function toggleEventCategory(cat: EventCategory) {
    setFavoriteEventCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function toggleSpotCategory(cat: LocationSubCategory) {
    setFavoriteSpotCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function toggleToolCategory(cat: string) {
    setFavoriteToolCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  async function handleSend() {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Champs requis', 'Titre et message obligatoires.');
      return;
    }
    if (audience === 'individual' && !targetPhone.trim()) {
      Alert.alert('Numéros requis', 'Saisissez un ou plusieurs numéros séparés par ;');
      return;
    }
    if (
      audience === 'favorites' &&
      !favoriteEventCategories.length &&
      !favoriteSpotCategories.length &&
      !favoriteToolCategories.length
    ) {
      Alert.alert('Catégories requises', 'Sélectionnez au moins une catégorie événement, spot ou outil.');
      return;
    }
    if (!sendNow && !scheduledAt.trim()) {
      Alert.alert('Planification', 'Indiquez la date et l\'heure d\'envoi.');
      return;
    }

    setSending(true);
    try {
      await sendAdminNotification({
        title,
        message,
        audience,
        targetPhone: audience === 'individual' ? targetPhone : null,
        favoriteEventCategories: audience === 'favorites' ? favoriteEventCategories : [],
        favoriteSpotCategories: audience === 'favorites' ? favoriteSpotCategories : [],
        favoriteToolCategories: audience === 'favorites' ? favoriteToolCategories : [],
        scheduledAt: sendNow ? null : new Date(scheduledAt).toISOString(),
        countryCode,
      });
      setTitle('');
      setMessage('');
      setTargetPhone('');
      setFavoriteEventCategories([]);
      setFavoriteSpotCategories([]);
      setFavoriteToolCategories([]);
      setScheduledAt('');
      await load();
      Alert.alert(sendNow ? 'Envoyé' : 'Planifié', sendNow ? 'Notification diffusée.' : 'Envoi programmé.');
    } finally {
      setSending(false);
    }
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
  }

  return (
    <KeyboardAwareFormScroll style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <AdminPageHeader
        title="Notifications automatiques"
        subtitle="Push immédiat ou planifié — rôles, anniversaires, favoris multi-catégories"
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <AdminCountryBar shell={shell} compact />

      <Text style={[styles.label, { color: shell.pageKicker }]}>Destinataires</Text>
      <View style={styles.audienceRow}>
        {AUDIENCES.map((a) => (
          <Pressable
            key={a}
            style={[styles.audienceBtn, { borderColor: shell.filterInactiveBorder }, audience === a && { backgroundColor: ADMIN_THEME.accent, borderColor: ADMIN_THEME.accent }]}
            onPress={() => setAudience(a)}
          >
            <Text style={{ color: audience === a ? '#fff' : shell.pageTitle, fontSize: 9, fontWeight: '600' }}>
              {AUDIENCE_LABELS[a]}
            </Text>
          </Pressable>
        ))}
      </View>

      {audience === 'individual' ? (
        <>
          <Text style={[styles.label, { color: shell.pageKicker }]}>Numéros (séparateur ;)</Text>
          <TextInput
            style={inputStyle}
            value={targetPhone}
            onChangeText={setTargetPhone}
            placeholder="+22462000001; +22462000002"
            placeholderTextColor={shell.pageKicker}
            keyboardType="phone-pad"
          />
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Un ou plusieurs numéros — uniquement des comptes existants.
          </Text>
        </>
      ) : null}

      {audience === 'birthday' ? (
        <Text style={[styles.hint, { color: shell.pageKicker }]}>
          Comptes dont l'anniversaire est ce mois-ci (date de naissance renseignée).
        </Text>
      ) : null}

      {audience === 'favorites' ? (
        <>
          <Text style={[styles.label, { color: shell.pageKicker }]}>Catégories événements (multi-sélection)</Text>
          <View style={styles.catRow}>
            {eventCategoryOptions.map((cat) => (
              <Pressable
                key={cat.id}
                style={[styles.catChip, favoriteEventCategories.includes(cat.id as EventCategory) && { backgroundColor: ADMIN_THEME.accent }]}
                onPress={() => toggleEventCategory(cat.id as EventCategory)}
              >
                <Text style={{ color: favoriteEventCategories.includes(cat.id as EventCategory) ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '600' }}>
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.label, { color: shell.pageKicker }]}>Catégories spots (multi-sélection)</Text>
          <View style={styles.catRow}>
            {spotCategoryOptions.map((cat) => (
              <Pressable
                key={cat.id}
                style={[styles.catChip, favoriteSpotCategories.includes(cat.id as LocationSubCategory) && { backgroundColor: ADMIN_THEME.accent }]}
                onPress={() => toggleSpotCategory(cat.id as LocationSubCategory)}
              >
                <Text style={{ color: favoriteSpotCategories.includes(cat.id as LocationSubCategory) ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '600' }}>
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.label, { color: shell.pageKicker }]}>Catégories outils (multi-sélection)</Text>
          <View style={styles.catRow}>
            {toolCategoryOptions.map((cat) => (
              <Pressable
                key={cat.id}
                style={[styles.catChip, favoriteToolCategories.includes(cat.id) && { backgroundColor: ADMIN_THEME.accent }]}
                onPress={() => toggleToolCategory(cat.id)}
              >
                <Text style={{ color: favoriteToolCategories.includes(cat.id) ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '600' }}>
                  {cat.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.hint, { color: shell.pageKicker }]}>
            Membres ayant en favori au moins un contenu d'une catégorie sélectionnée (événement, spot ou outil). Admins et partenaires exclus.
          </Text>
        </>
      ) : null}

      <Text style={[styles.label, { color: shell.pageKicker }]}>Titre</Text>
      <TextInput style={inputStyle} value={title} onChangeText={setTitle} placeholder="Ex. Offre exclusive" placeholderTextColor={shell.pageKicker} />

      <Text style={[styles.label, { color: shell.pageKicker }]}>Message</Text>
      <TextInput style={[...inputStyle, styles.multiline]} value={message} onChangeText={setMessage} placeholder="Votre message…" placeholderTextColor={shell.pageKicker} multiline />

      <View style={styles.scheduleRow}>
        <Pressable style={[styles.scheduleBtn, sendNow && { backgroundColor: ADMIN_THEME.accent }]} onPress={() => setSendNow(true)}>
          <Text style={{ color: sendNow ? '#fff' : shell.pageTitle, fontWeight: '700', fontSize: 12 }}>Immédiat</Text>
        </Pressable>
        <Pressable style={[styles.scheduleBtn, !sendNow && { backgroundColor: ADMIN_THEME.accent }]} onPress={() => setSendNow(false)}>
          <Text style={{ color: !sendNow ? '#fff' : shell.pageTitle, fontWeight: '700', fontSize: 12 }}>Planifié</Text>
        </Pressable>
      </View>

      {!sendNow ? (
        <>
          <Text style={[styles.label, { color: shell.pageKicker }]}>Date & heure d'envoi</Text>
          <DateTimeField value={scheduledAt} onChange={setScheduledAt} placeholder="Choisir date et heure" shell={shell} />
        </>
      ) : null}

      <Pressable style={[styles.sendBtn, { backgroundColor: ADMIN_THEME.accent }]} onPress={() => void handleSend()} disabled={sending}>
        <Text style={styles.sendText}>{sending ? 'Envoi…' : 'Envoyer la notification'}</Text>
      </Pressable>

      <Text style={[styles.section, { color: shell.pageKicker }]}>Historique & planifiés</Text>
      <View style={styles.clearRow}>
        <Pressable
          style={[styles.clearBtn, { borderColor: shell.filterInactiveBorder }]}
          onPress={() => {
            Alert.alert('Vider l\'historique', 'Supprimer toutes les campagnes enregistrées localement ?', [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Vider',
                style: 'destructive',
                onPress: () => void clearAdminNotificationHistory().then(load),
              },
            ]);
          }}
        >
          <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 11 }}>Vider historique campagnes</Text>
        </Pressable>
        {user?.id ? (
          <Pressable
            style={[styles.clearBtn, { borderColor: shell.filterInactiveBorder }]}
            onPress={() => {
              Alert.alert('Vider ma boîte', 'Supprimer toutes vos notifications reçues sur cet appareil ?', [
                { text: 'Annuler', style: 'cancel' },
                {
                  text: 'Vider',
                  style: 'destructive',
                  onPress: () => void clearUserNotifications(user.id).then(() => Alert.alert('OK', 'Boîte de réception vidée.')),
                },
              ]);
            }}
          >
            <Text style={{ color: '#ef4444', fontWeight: '700', fontSize: 11 }}>Vider ma boîte</Text>
          </Pressable>
        ) : null}
      </View>
      {history.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucune campagne.</Text>
      ) : (
        history.map((item) => (
          <View key={item.id} style={[styles.historyCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
            <Text style={[styles.historyTitle, { color: shell.pageTitle }]}>{item.title}</Text>
            <Text style={[styles.historyMeta, { color: shell.pageKicker }]}>
              {AUDIENCE_LABELS[item.audience]} · {STATUS_LABELS[item.status]} · {item.recipientCount} dest.
            </Text>
            <Text style={[styles.historyMeta, { color: shell.pageKicker }]}>
              {item.sentAt ? `Envoyé ${formatDateFr(item.sentAt)}` : item.scheduledAt ? `Prévu ${formatDateFr(item.scheduledAt)}` : '—'}
            </Text>
            <CollapsibleMessage message={item.message} color={shell.pageTitle} accentColor={ADMIN_THEME.accent} />
            {item.status === 'scheduled' ? (
              <Pressable onPress={() => void cancelScheduledNotification(item.id).then(load)}>
                <Text style={{ color: '#ef4444', marginTop: 8, fontWeight: '700', fontSize: 11 }}>Annuler</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </KeyboardAwareFormScroll>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6, marginTop: 8 },
  hint: { fontSize: 11, marginBottom: 8, lineHeight: 16 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8, fontSize: 14 },
  multiline: { minHeight: 100, textAlignVertical: 'top' },
  audienceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  audienceBtn: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  catRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  catChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: 'rgba(148,163,184,0.15)' },
  scheduleRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  scheduleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(148,163,184,0.15)' },
  sendBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  sendText: { color: '#fff', fontWeight: '700' },
  section: { marginTop: 24, marginBottom: 8, fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  clearRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  clearBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  empty: { fontSize: 13, fontStyle: 'italic' },
  historyCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  historyTitle: { fontSize: 14, fontWeight: '700' },
  historyMeta: { marginTop: 4, fontSize: 11 },
  historyBody: { marginTop: 6, fontSize: 13 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
});
