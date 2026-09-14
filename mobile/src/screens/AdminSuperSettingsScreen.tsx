import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { DateTimeField } from '@/components/DateTimeField';
import { AdminModuleCard, AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { TogglePill } from '@/components/admin/TogglePill';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminPermissions } from '@/context/AdminPermissionsContext';
import { useAppSettings } from '@/context/AppSettingsContext';
import { useAppGates } from '@/context/AppGatesContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { type AdminPermissionId } from '@/lib/admin-permissions';
import { navigateRoot } from '@/lib/navigation-utils';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminSuperSettings'>;

type SettingsEntry = {
  icon: string;
  title: string;
  description: string;
  route: keyof RootStackParamList;
  permission: AdminPermissionId;
  params?: object;
};

const ENTRIES: SettingsEntry[] = [
  {
    icon: '🌍',
    title: 'Pays du contenu',
    description: 'Activer les pays proposés aux membres',
    route: 'AdminContentCountries',
    permission: 'content_countries',
  },
  {
    icon: '🏷️',
    title: 'Catégories',
    description: 'Libellés et activation — événements, spots, outils',
    route: 'AdminCategories',
    permission: 'categories',
  },
  {
    icon: '⭐',
    title: 'Étoiles',
    description: 'Poids engagement et paliers d\'étoiles',
    route: 'AdminSpotStars',
    permission: 'spot_stars_settings',
    params: { tab: 'settings', settingsOnly: true },
  },
  {
    icon: '🏅',
    title: 'Paliers partenaires',
    description: 'Seuils validations / membres → récompenses à la une & push',
    route: 'AdminPartnerMilestones',
    permission: 'partner_milestones',
  },
  {
    icon: '⚡',
    title: 'Automatisations',
    description: 'Jobs bienvenue, anniversaire, membre du mois…',
    route: 'AdminAutomationJobs',
    permission: 'automation',
  },
  {
    icon: '🔔',
    title: 'Notifications automatiques',
    description: 'Push planifiés et envois ciblés automatiques',
    route: 'AdminNotifications',
    permission: 'notifications',
  },
  {
    icon: '✉️',
    title: 'Modèles notification PASS',
    description: 'Messages automatiques à l\'activation d\'un PASS',
    route: 'AdminPassManagement',
    permission: 'pass_messages',
    params: { section: 'messages' },
  },
  {
    icon: '🎁',
    title: 'Privilège',
    description: 'Créer un privilège THE LOOP, ou un type (modèle) d\'privilège',
    route: 'AdminStandaloneBenefit',
    permission: 'standalone_benefit',
  },
  {
    icon: '📜',
    title: 'CGU & légal',
    description: 'CGU, conditions partenaires et mentions légales',
    route: 'AdminLegal',
    permission: 'legal',
  },
  {
    icon: '🎫',
    title: 'Prix PASS',
    description: 'Ajustement des tarifs standards (GNF)',
    route: 'AdminPassManagement',
    permission: 'pass_prices',
    params: { section: 'prices' },
  },
  {
    icon: '🕐',
    title: 'Horaires spots',
    description: 'Modes, raccourcis et heures par défaut',
    route: 'AdminOpeningHours',
    permission: 'opening_hours',
  },
  {
    icon: '🛡️',
    title: 'Permission',
    description: 'Créer des admins et gérer leurs modules',
    route: 'AdminPermissions',
    permission: 'admin_permissions',
  },
];

function syncWarn(result: { synced: boolean; error?: string }) {
  if (!result.synced) {
    Alert.alert(
      'Réglage enregistré sur cet appareil',
      'La synchronisation cloud a échoué. Vérifiez la migration admin_set_app_setting et vos droits admin.',
    );
  }
}

export function AdminSuperSettingsScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { hasPermission, hasSubPermission, isSuperAdmin } = useAdminPermissions();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('manage_admins');
  const { settings, setShowCommunitySuggestion } = useAppSettings();
  const {
    gates,
    setSignupEnabled,
    setPassPurchaseEnabled,
    setPrelaunchGate,
    setMaintenanceGate,
  } = useAppGates();
  const { shell } = useMemberTheme();

  const [preTitle, setPreTitle] = useState(gates.prelaunch.title);
  const [preMessage, setPreMessage] = useState(gates.prelaunch.message);
  const [maintTitle, setMaintTitle] = useState(gates.maintenance.title);
  const [maintMessage, setMaintMessage] = useState(gates.maintenance.message);

  useEffect(() => {
    setPreTitle(gates.prelaunch.title);
    setPreMessage(gates.prelaunch.message);
    setMaintTitle(gates.maintenance.title);
    setMaintMessage(gates.maintenance.message);
  }, [
    gates.prelaunch.title,
    gates.prelaunch.message,
    gates.maintenance.title,
    gates.maintenance.message,
  ]);

  const visibleEntries = ENTRIES.filter((entry) => {
    if (entry.permission === 'spot_stars_settings') {
      return hasSubPermission('spot_stars', 'spot_stars_settings');
    }
    if (entry.permission === 'pass_messages' || entry.permission === 'pass_prices') {
      return hasSubPermission('pass_management', entry.permission);
    }
    return hasPermission(entry.permission);
  });

  const inputStyle = {
    borderWidth: 1,
    borderColor: shell.filterInactiveBorder,
    backgroundColor: shell.pageBg,
    color: shell.pageTitle,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  } as const;

  if (role !== 'ADMIN' || (!allowed && !isLoading)) {
    return (
      <AdminModuleDenied
        shell={shell}
        moduleLabel={permissionLabel}
        onBack={() => navigation.goBack()}
      />
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <AdminPageHeader
        title="Paramètres"
        subtitle="Réglages plateforme — modules autorisés pour votre profil"
        shell={shell}
        onBack={() => navigation.goBack()}
      />

      <Text style={[styles.hint, { color: shell.pageKicker }]}>
        Les modules opérationnels (contenu, modération, octrois…) restent dans la barre latérale Control Tower.
      </Text>

      <View style={[styles.settingsCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
        <Text style={[styles.settingsLabel, { color: shell.pageTitle }]}>Bouton « Suggestion »</Text>
        <Text style={[styles.settingsHint, { color: shell.pageKicker }]}>
          Visible ou masqué dans « Nous contacter » (Rejoins le club, profil…). WhatsApp reste disponible.
        </Text>
        <TogglePill
          value={settings.showCommunitySuggestion}
          onChange={(next) => {
            void (async () => {
              syncWarn(await setShowCommunitySuggestion(next));
            })();
          }}
          activeLabel="Visible"
          inactiveLabel="Masqué"
          activeColor={ADMIN_THEME.accent}
          shell={shell}
        />
      </View>

      <View style={[styles.settingsCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
        <Text style={[styles.settingsLabel, { color: shell.pageTitle }]}>Onglet Inscription</Text>
        <Text style={[styles.settingsHint, { color: shell.pageKicker }]}>
          Affiche ou masque l’onglet Inscription sur l’écran de connexion (et les CTA « Créer un compte »).
        </Text>
        <TogglePill
          value={gates.signupEnabled}
          onChange={(next) => {
            void (async () => {
              syncWarn(await setSignupEnabled(next));
            })();
          }}
          activeLabel="Visible"
          inactiveLabel="Masqué"
          activeColor={ADMIN_THEME.accent}
          shell={shell}
        />
      </View>

      <View style={[styles.settingsCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
        <Text style={[styles.settingsLabel, { color: shell.pageTitle }]}>Achat PASS</Text>
        <Text style={[styles.settingsHint, { color: shell.pageKicker }]}>
          Affiche ou masque l’achat / renouvellement PASS (Djomy) dans l’app. Désactivé = aucun rebuild pour le garder masqué jusqu’au lancement.
        </Text>
        <TogglePill
          value={gates.passPurchaseEnabled}
          onChange={(next) => {
            void (async () => {
              syncWarn(await setPassPurchaseEnabled(next));
            })();
          }}
          activeLabel="Visible"
          inactiveLabel="Masqué"
          activeColor={ADMIN_THEME.accent}
          shell={shell}
        />
      </View>

      <View style={[styles.settingsCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
        <Text style={[styles.settingsLabel, { color: shell.pageTitle }]}>Écran avant-lancement</Text>
        <Text style={[styles.settingsHint, { color: shell.pageKicker }]}>
          Bloque l’app pour le public. 4 taps rapides sur le titre ouvrent la connexion admin.
        </Text>
        <TogglePill
          value={gates.prelaunch.enabled}
          onChange={(next) => {
            void (async () => {
              syncWarn(await setPrelaunchGate({ enabled: next }));
            })();
          }}
          activeLabel="Actif"
          inactiveLabel="Inactif"
          activeColor={ADMIN_THEME.accent}
          shell={shell}
        />
        <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>Mode d’affichage</Text>
        <TogglePill
          value={gates.prelaunch.mode === 'countdown'}
          onChange={(useCountdown) => {
            void (async () => {
              syncWarn(
                await setPrelaunchGate({
                  mode: useCountdown ? 'countdown' : 'text',
                  countdownTo:
                    useCountdown
                      ? gates.prelaunch.countdownTo ?? new Date(Date.now() + 7 * 86400000).toISOString()
                      : gates.prelaunch.countdownTo,
                }),
              );
            })();
          }}
          activeLabel="Chrono"
          inactiveLabel="Texte"
          activeColor={ADMIN_THEME.accent}
          shell={shell}
        />
        <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>Grand titre</Text>
        <TextInput
          style={inputStyle}
          value={preTitle}
          onChangeText={setPreTitle}
          onBlur={() => {
            if (preTitle.trim() === gates.prelaunch.title) return;
            void (async () => {
              syncWarn(await setPrelaunchGate({ title: preTitle.trim() || 'Bientôt' }));
            })();
          }}
          placeholder="Bientôt"
          placeholderTextColor={shell.pageKicker}
        />
        <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>Message</Text>
        <TextInput
          style={[inputStyle, styles.multiline]}
          value={preMessage}
          onChangeText={setPreMessage}
          onBlur={() => {
            if (preMessage.trim() === gates.prelaunch.message) return;
            void (async () => {
              syncWarn(await setPrelaunchGate({ message: preMessage.trim() }));
            })();
          }}
          placeholder="THE LOOP ouvre bientôt…"
          placeholderTextColor={shell.pageKicker}
          multiline
        />
        {gates.prelaunch.mode === 'countdown' ? (
          <>
            <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>Ouverture prévue</Text>
            <DateTimeField
              value={gates.prelaunch.countdownTo ?? ''}
              onChange={(iso) => {
                void (async () => {
                  syncWarn(await setPrelaunchGate({ countdownTo: iso || null }));
                })();
              }}
              shell={shell}
              minimumDate={new Date()}
            />
          </>
        ) : null}
      </View>

      {isSuperAdmin ? (
        <View style={[styles.settingsCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
          <Text style={[styles.settingsLabel, { color: shell.pageTitle }]}>Écran maintenance</Text>
          <Text style={[styles.settingsHint, { color: shell.pageKicker }]}>
            Prioritaire sur l’avant-lancement. Réservé au super admin. Même porte secrète (4 taps).
          </Text>
          <TogglePill
            value={gates.maintenance.enabled}
            onChange={(next) => {
              void (async () => {
                syncWarn(await setMaintenanceGate({ enabled: next }));
              })();
            }}
            activeLabel="Actif"
            inactiveLabel="Inactif"
            activeColor="#ef4444"
            shell={shell}
          />
          <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>Grand titre</Text>
          <TextInput
            style={inputStyle}
            value={maintTitle}
            onChangeText={setMaintTitle}
            onBlur={() => {
              if (maintTitle.trim() === gates.maintenance.title) return;
              void (async () => {
                syncWarn(await setMaintenanceGate({ title: maintTitle.trim() || 'Maintenance' }));
              })();
            }}
            placeholder="Maintenance"
            placeholderTextColor={shell.pageKicker}
          />
          <Text style={[styles.fieldLabel, { color: shell.pageKicker }]}>Message</Text>
          <TextInput
            style={[inputStyle, styles.multiline]}
            value={maintMessage}
            onChangeText={setMaintMessage}
            onBlur={() => {
              if (maintMessage.trim() === gates.maintenance.message) return;
              void (async () => {
                syncWarn(await setMaintenanceGate({ message: maintMessage.trim() }));
              })();
            }}
            placeholder="THE LOOP est temporairement indisponible…"
            placeholderTextColor={shell.pageKicker}
            multiline
          />
        </View>
      ) : null}

      {visibleEntries.length === 0 ? (
        <Text style={[styles.hint, { color: shell.pageKicker }]}>
          Aucune entrée Paramètres autorisée pour votre profil. Contactez le super admin.
        </Text>
      ) : (
        visibleEntries.map((entry) => (
          <AdminModuleCard
            key={`${entry.route}-${entry.title}`}
            icon={entry.icon}
            title={entry.title}
            description={entry.description}
            shell={shell}
            onPress={() => navigateRoot(navigation, entry.route, entry.params as never)}
          />
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 14, fontStyle: 'italic' },
  settingsCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14, gap: 8 },
  settingsLabel: { fontSize: 14, fontWeight: '800' },
  settingsHint: { fontSize: 12, lineHeight: 17 },
  fieldLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
});
