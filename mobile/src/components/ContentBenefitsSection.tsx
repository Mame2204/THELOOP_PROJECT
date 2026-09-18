import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthContext } from '@/context/AuthContext';
import { useFavoritesSignup } from '@/context/FavoritesSignupContext';
import { useAppGates } from '@/context/AppGatesContext';
import {
  clampValidityDaysToCatalogEnd,
  type BenefitCatalogItem,
  type BenefitKind,
} from '@/lib/benefit-catalog-store';
import { isAuthenticated, type UserRole } from '@/types';
import { formatDateDdMmYyyy } from '@/lib/date-utils';
import {
  listCatalogBenefitsForContent,
  mapCatalogIdsToRoles,
  type ContentBenefitContentType,
} from '@/lib/content-benefits-index';
import {
  canPushBenefitValidation,
  ensureActivePrivilegeGrant,
  isBenefitFullyUsed,
  listUserPrimeBenefits,
  requestBenefitValidation,
  syncExpiredBenefitPendingStates,
  syncUserRoleBenefitEntitlements,
  type PrimeBenefit,
} from '@/lib/prime-benefits-store';
import { BENEFIT_REDEMPTION_TIMEOUT_MINUTES } from '@/lib/benefit-redemption-store';
import {
  isAdminAccount,
  userQualifiesForAdminEntitlements,
  userQualifiesForMemberEntitlements,
  userQualifiesForPartnerEntitlements,
  userQualifiesForPrimeEntitlements,
} from '@/lib/role-benefit-eligibility';
import type { RoleEntitlementKind } from '@/lib/role-benefit-entitlements-store';
import { resolveStaffAdminEntitlementEntries } from '@/lib/staff-benefit-overrides-store';
import type { ShellTheme } from '@/lib/member-grade-theme';
import { resolveCountryCode } from '@/lib/country-settings-keys';
import { isPassPurchaseUiEnabled } from '@/lib/pass-purchase-ui';
import type { RootStackParamList } from '@/navigation/types';
import { subscribeHomeRefresh } from '@/lib/home-refresh';

export interface ContentBenefitsSectionProps {
  contentId: string;
  contentType: ContentBenefitContentType;
  shell: ShellTheme;
}

interface ContentBenefitLine {
  item: BenefitCatalogItem;
  roles: RoleEntitlementKind[];
  unlocked: boolean;
  userBenefit: PrimeBenefit | null;
  /** Quota atteint ou déjà consommé */
  exhausted: boolean;
  /** Demande déjà envoyée, en attente du scan partenaire */
  pendingValidation: boolean;
}

type DetailModal = { kind: 'unlocked'; line: ContentBenefitLine } | { kind: 'locked'; line: ContentBenefitLine };

function userQualifiesForRole(
  role: RoleEntitlementKind,
  user: NonNullable<ReturnType<typeof useAuthContext>['user']>,
): boolean {
  switch (role) {
    case 'member':
      return userQualifiesForMemberEntitlements(user);
    case 'prime':
      return userQualifiesForPrimeEntitlements(user);
    case 'partner':
      return userQualifiesForPartnerEntitlements(user);
    case 'admin':
      // Pack TEAMS / config.admin : résolu via resolveStaffAdminEntitlementEntries (hors super_admin pack)
      return userQualifiesForAdminEntitlements(user);
    default:
      return false;
  }
}

function privilegeUseButtonLabel(line: ContentBenefitLine, using: boolean): string {
  if (using) return 'Envoi…';
  if (line.exhausted) return 'Quota atteint';
  if (line.pendingValidation) return 'Renvoyer au partenaire';
  return 'Utiliser';
}

function privilegeExhaustedMessage(item: BenefitCatalogItem, benefit: PrimeBenefit | null): string {
  if (item.benefitKind === 'quantity') {
    const total = benefit?.quantityTotal ?? item.quantityPerGrant ?? 0;
    return total > 0
      ? `Vous avez déjà utilisé vos ${total} unité(s). Ce privilège n’est plus utilisable pour le moment.`
      : 'Votre quota pour ce privilège est épuisé.';
  }
  if (item.benefitKind === 'usage_limit') {
    const max = benefit?.maxUses ?? item.maxUsesPerGrant ?? 0;
    return max > 0
      ? `Vous avez déjà utilisé vos ${max} utilisation(s). Réessayez lorsque votre quota sera renouvelé.`
      : 'Nombre d’utilisations atteint pour ce privilège.';
  }
  return 'Ce privilège a déjà été consommé.';
}

function previewDescription(text: string | null | undefined): string {
  const raw = (text ?? '').trim();
  if (!raw) return '';
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 2) return `${lines[0]}\n${lines[1]}`;
  // Une seule ligne longue → ~2 lignes visuelles
  if (raw.length > 90) return `${raw.slice(0, 90).trim()}…`;
  return raw;
}

function privilegeTypeLabel(kind: BenefitKind): string {
  switch (kind) {
    case 'quantity':
      return 'Crédit d’unités — chaque utilisation consomme une part du stock.';
    case 'usage_limit':
      return 'Utilisations limitées — un nombre fixe de passages chez le partenaire.';
    case 'unlimited':
    default:
      return 'Accès libre — utilisable sans limite pendant la période de validité.';
  }
}

function privilegeQuantityLabel(item: BenefitCatalogItem, benefit: PrimeBenefit | null): string {
  if (item.benefitKind === 'quantity') {
    const total = benefit?.quantityTotal ?? item.quantityPerGrant;
    if (total == null || total <= 0) return 'Quantité non précisée.';
    const used = benefit?.quantityUsed ?? 0;
    const left = Math.max(0, total - used);
    return `${left} unité(s) restante(s) sur ${total}.`;
  }
  if (item.benefitKind === 'usage_limit') {
    const max = benefit?.maxUses ?? item.maxUsesPerGrant;
    if (max == null || max <= 0) return 'Nombre d’utilisations non précisé.';
    const used = benefit?.usesCount ?? 0;
    const left = Math.max(0, max - used);
    return `${left} utilisation(s) restante(s) sur ${max}.`;
  }
  return 'Illimité pendant toute la validité.';
}

/** Date technique « sans limite » (octrois rôle) — ne pas l’afficher telle quelle. */
function isSentinelExpiry(iso: string): boolean {
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t >= new Date('2090-01-01').getTime();
}

/** Date de fin affichée en jj/mm/aaaa (catalogue ou octroi). */
type LockedPrivilegeCtaMode = 'prime' | 'disabled' | 'none';

function getLockedPrivilegePresentation(
  role: UserRole,
  passPurchaseEnabled: boolean,
): {
  title: string;
  body: string;
  ctaMode: LockedPrivilegeCtaMode;
  ctaLabel: string;
} {
  if (role === 'PARTNER') {
    return {
      title: 'Privilège réservé aux membres Loop Prime',
      body:
        'Les privilèges affichés sur les fiches sont réservés à la consommation des membres Loop Prime. En tant que partenaire, vous ne pouvez pas les activer ici.',
      ctaMode: 'disabled',
      ctaLabel: 'Réservé aux membres Prime',
    };
  }

  if (role === 'ADMIN') {
    return {
      title: 'Ce privilège n’est pas encore activé',
      body:
        'Pour bénéficier de ce privilège, merci de contacter votre super admin — il pourra vous l’octroyer depuis TEAMS.',
      ctaMode: 'disabled',
      ctaLabel: 'Contacter le super admin',
    };
  }

  if (role === 'USER_FREE') {
    return {
      title: 'Un privilège réservé aux membres Prime',
      body: passPurchaseEnabled
        ? 'Ce lieu cache une expérience pensée pour ceux qui vivent Conakry autrement. Passez en Loop Prime pour débloquer ce privilège.'
        : 'Ce privilège est réservé aux membres Loop Prime. L\'abonnement en ligne arrive bientôt.',
      ctaMode: passPurchaseEnabled ? 'prime' : 'none',
      ctaLabel: 'Passer en Loop Prime',
    };
  }

  return {
    title: 'Privilège non disponible',
    body:
      'Vous n’avez pas encore reçu ce privilège sur votre compte. Il peut être réservé à certains membres (tirage au sort, campagne, etc.).',
    ctaMode: 'disabled',
    ctaLabel: 'Non disponible',
  };
}

function privilegeValidityLabel(item: BenefitCatalogItem, benefit: PrimeBenefit | null): string {
  // Échéance réelle déjà posée sur l’octroi
  if (benefit?.expiresAt && !isSentinelExpiry(benefit.expiresAt)) {
    const exp = new Date(benefit.expiresAt);
    if (!Number.isNaN(exp.getTime())) {
      return `Valable jusqu’au ${formatDateDdMmYyyy(exp)}.`;
    }
  }

  const from =
    benefit?.activatedAt && !Number.isNaN(new Date(benefit.activatedAt).getTime())
      ? new Date(benefit.activatedAt)
      : new Date();

  const days = Math.max(
    1,
    benefit?.validityDays ?? item.defaultValidityDays ?? 30,
  );
  const { days: capped } = clampValidityDaysToCatalogEnd(days, item.validityEndsAt, from);
  const end = new Date(from);
  end.setDate(end.getDate() + Math.max(1, capped));

  if (item.validityEndsAt) {
    const abs = new Date(item.validityEndsAt);
    if (!Number.isNaN(abs.getTime()) && abs.getTime() < end.getTime()) {
      return `Valable jusqu’au ${formatDateDdMmYyyy(abs)}.`;
    }
  }

  return `Valable jusqu’au ${formatDateDdMmYyyy(end)}.`;
}

export function ContentBenefitsSection({
  contentId,
  contentType,
  shell,
}: ContentBenefitsSectionProps) {
  const { user, role } = useAuthContext();
  const { gates } = useAppGates();
  const passPurchaseEnabled = isPassPurchaseUiEnabled(gates);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { openSignupSheet } = useFavoritesSignup();
  const loggedIn = isAuthenticated(role);
  const [lines, setLines] = useState<ContentBenefitLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<DetailModal | null>(null);
  const [using, setUsing] = useState(false);
  const syncedForUser = useRef<string | null>(null);

  const buildLines = useCallback(async (refreshCatalog = false): Promise<ContentBenefitLine[]> => {
    const items = await listCatalogBenefitsForContent(contentId, contentType, { refreshCatalog });
    if (!items.length) return [];

    const country = resolveCountryCode(user?.countryCode);
    const rolesMap = await mapCatalogIdsToRoles(
      items.map((i) => i.id),
      country,
    );

    let userBenefitsActive: PrimeBenefit[] = [];
    let userBenefitsUsed: PrimeBenefit[] = [];
    let staffCatalogIds: Set<string> | null = null;
    let livePendingBenefitIds = new Set<string>();

    if (user && user.id !== 'anonymous') {
      try {
        const listed = await listUserPrimeBenefits(user.id, {
          phone: user.phoneNumber,
          email: user.email,
        });
        userBenefitsActive = listed.active;
        userBenefitsUsed = listed.used;
        const { listLivePendingBenefitIdsForUser } = await import('@/lib/benefit-redemption-store');
        livePendingBenefitIds = await listLivePendingBenefitIdsForUser(user.id);
      } catch {
        userBenefitsActive = [];
        userBenefitsUsed = [];
      }

      if (isAdminAccount(user)) {
        try {
          const entries = await resolveStaffAdminEntitlementEntries(user);
          staffCatalogIds = new Set(entries.map((e) => e.catalogId));
        } catch {
          staffCatalogIds = new Set();
        }
      }
    }

    const next: ContentBenefitLine[] = [];
    for (const item of items) {
      const roles = [...(rolesMap.get(item.id) ?? [])];
      const staffUnlocked = Boolean(staffCatalogIds?.has(item.id));
      // Super admin TEAMS : l’item peut n’être que dans enabledCatalogIds, hors config.admin.
      if (staffUnlocked && !roles.includes('admin')) roles.push('admin');

      const fromActive =
        userBenefitsActive.find((b) => b.catalogId === item.id) ?? null;
      const fromUsed =
        userBenefitsUsed.find((b) => b.catalogId === item.id) ?? null;
      const userBenefit = fromActive ?? fromUsed;

      const pendingValidation =
        userBenefit?.status === 'pending_validation' ||
        (userBenefit != null &&
          userBenefit.status !== 'used' &&
          !isBenefitFullyUsed(userBenefit) &&
          livePendingBenefitIds.has(userBenefit.id));
      const exhausted =
        Boolean(userBenefit) &&
        !pendingValidation &&
        (userBenefit!.status === 'used' || isBenefitFullyUsed(userBenefit!));

      const hasIndividualGrant =
        Boolean(fromActive) && !pendingValidation && !exhausted;

      const roleUnlocked =
        Boolean(user && user.id !== 'anonymous') &&
        roles.length > 0 &&
        (staffUnlocked ||
          roles.some((r) => {
            if (r === 'admin') return staffUnlocked;
            return userQualifiesForRole(r, user!);
          }));

      const unlocked = hasIndividualGrant || roleUnlocked;

      next.push({
        item,
        roles,
        unlocked,
        userBenefit,
        exhausted,
        pendingValidation: Boolean(pendingValidation),
      });
    }
    return next;
  }, [contentId, contentType, user?.id, user?.countryCode, user?.phoneNumber, user?.email, role]);

  useEffect(() => {
    if (!passPurchaseEnabled) {
      setLines([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const next = await buildLines(false);
        if (!cancelled) setLines(next);
      } catch (err) {
        console.warn('[ContentBenefits]', err instanceof Error ? err.message : err);
        if (!cancelled) setLines([]);
      } finally {
        if (!cancelled) setLoading(false);
      }

      if (
        !cancelled &&
        user &&
        user.id !== 'anonymous' &&
        syncedForUser.current !== user.id
      ) {
        syncedForUser.current = user.id;
        void syncUserRoleBenefitEntitlements(user)
          .then(async () => {
            if (cancelled) return;
            const refreshed = await buildLines(false);
            if (!cancelled) setLines(refreshed);
          })
          .catch(() => undefined);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [buildLines, user?.id, passPurchaseEnabled]);

  useEffect(() => {
    if (!passPurchaseEnabled) return;
    const unsubHome = subscribeHomeRefresh((reason) => {
      if (reason !== 'benefit-catalog') return;
      void buildLines(true).then(setLines).catch(() => undefined);
    });
    return unsubHome;
  }, [buildLines, passPurchaseEnabled]);

  // Au retour sur la fiche : cache local (pas de sync remote systématique — egress).
  useEffect(() => {
    if (!passPurchaseEnabled) return;
    const unsub = navigation.addListener('focus', () => {
      if (!user || user.id === 'anonymous') {
        void buildLines(false).then(setLines).catch(() => undefined);
        return;
      }
      void (async () => {
        await syncExpiredBenefitPendingStates(user.id).catch(() => undefined);
        const refreshed = await buildLines(false);
        setLines(refreshed);
      })();
    });
    return unsub;
  }, [navigation, user?.id, buildLines, passPurchaseEnabled]);

  function openLine(line: ContentBenefitLine) {
    if (!line.unlocked) {
      // Non connecté : même invitation « Rejoins le club » que le bonhomme.
      if (!loggedIn) {
        openSignupSheet(navigation);
        return;
      }
      // Compte connecté mais non éligible à ce privilège.
      if (!passPurchaseEnabled) {
        Alert.alert('Privilège réservé', 'Ce privilège n’est pas disponible sur votre compte.');
        return;
      }
      setModal({ kind: 'locked', line });
      return;
    }
    setModal({ kind: 'unlocked', line });
  }

  async function handleUse(line: ContentBenefitLine) {
    if (!user || !line.unlocked) return;
    if (using) return;

    console.log('[ContentBenefits] handleUse tap', {
      catalogId: line.item.id,
      pending: line.pendingValidation,
      userId: user.id,
      contentId,
    });

    if (line.exhausted) {
      Alert.alert('Quota atteint', privilegeExhaustedMessage(line.item, line.userBenefit));
      return;
    }

    const isRepush = line.pendingValidation;

    // Fermer le modal avant l’Alert (sinon Android bloque souvent la confirmation)
    setModal(null);

    setTimeout(() => {
      Alert.alert(
        isRepush ? 'Renvoyer la demande' : 'Utiliser ce privilège',
        isRepush
          ? `La demande n’est peut‑être pas encore visible chez le partenaire. Renvoyer vers le serveur (valable ${BENEFIT_REDEMPTION_TIMEOUT_MINUTES} min) ?`
          : `Après confirmation, ouvrez Profil → agrandissez votre QR pour le partenaire (${BENEFIT_REDEMPTION_TIMEOUT_MINUTES} min).`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: isRepush ? 'Renvoyer' : 'Confirmer',
            onPress: () => {
              console.log('[ContentBenefits] confirm pressed', { catalogId: line.item.id, userId: user.id });
              void (async () => {
                setUsing(true);
                try {
                  // Priorité : octroi déjà affiché sur la fiche (évite sync réseau long)
                  let benefit =
                    line.userBenefit && canPushBenefitValidation(line.userBenefit)
                      ? line.userBenefit
                      : null;
                  console.log('[ContentBenefits] benefit from line', {
                    id: benefit?.id ?? null,
                    status: benefit?.status ?? null,
                  });
                  if (!benefit) {
                    benefit = await ensureActivePrivilegeGrant(
                      user,
                      line.item.id,
                      line.roles,
                      { contentId, skipRemoteSync: true },
                    );
                    console.log('[ContentBenefits] benefit from ensure', {
                      id: benefit?.id ?? null,
                      status: benefit?.status ?? null,
                    });
                  }
                  if (!benefit || !canPushBenefitValidation(benefit)) {
                    const refreshed = await buildLines();
                    setLines(refreshed);
                    const updated = refreshed.find((l) => l.item.id === line.item.id);
                    if (updated?.exhausted) {
                      Alert.alert(
                        'Quota atteint',
                        privilegeExhaustedMessage(line.item, updated.userBenefit),
                      );
                    } else if (updated?.pendingValidation && updated.userBenefit) {
                      const res = await requestBenefitValidation(updated.userBenefit.id, user.id, {
                        phone: user.phoneNumber,
                        email: user.email,
                        contentId,
                        contentType,
                        contentTitle: line.item.title,
                      });
                      const refreshed2 = await buildLines();
                      setLines(refreshed2);
                      if (res.ok) {
                        Alert.alert(
                          'Demande envoyée',
                          'Ouvrez Profil et agrandissez votre QR pour le scan partenaire.',
                        );
                      } else if (res.reason === 'remote_sync_failed') {
                        Alert.alert(
                          'Hors ligne',
                          'La demande reste locale. Ouvrez quand même Profil → QR (renvoi auto), puis vérifiez la connexion.',
                        );
                      } else {
                        Alert.alert(
                          'Indisponible',
                          `Impossible de renvoyer (${res.reason ?? 'inconnu'}).`,
                        );
                      }
                    } else {
                      Alert.alert(
                        'Indisponible',
                        'Ce privilège n’a pas pu être activé sur votre compte. Réessayez dans un instant.',
                      );
                    }
                    return;
                  }

                  const res = await requestBenefitValidation(benefit.id, user.id, {
                    phone: user.phoneNumber,
                    email: user.email,
                    contentId,
                    contentType,
                    contentTitle: line.item.title,
                  });
                  console.log('[ContentBenefits] validation result', res);

                  if (res.ok) {
                    const refreshed = await buildLines();
                    setLines(refreshed);
                    Alert.alert(
                      'Demande envoyée',
                      `Ouvrez Profil et agrandissez votre QR (valable ${BENEFIT_REDEMPTION_TIMEOUT_MINUTES} min). Le partenaire scannera ce code.`,
                    );
                    return;
                  }

                  if (res.reason === 'remote_sync_failed') {
                    const refreshed = await buildLines();
                    setLines(refreshed);
                    Alert.alert(
                      'Demande enregistrée hors ligne',
                      'Ouvrez Profil → agrandissez le QR : l’app renverra automatiquement la demande au serveur.',
                    );
                    return;
                  }

                  if (res.reason === 'no_partner') {
                    Alert.alert(
                      'Partenaire manquant',
                      'Ce privilège n’est pas rattaché à un partenaire.',
                    );
                  } else if (res.reason === 'not_found') {
                    Alert.alert(
                      'Indisponible',
                      'Octroi introuvable ou quota déjà consommé. Rouvrez la fiche puis réessayez.',
                    );
                  } else {
                    Alert.alert(
                      'Indisponible',
                      `Impossible de démarrer l’utilisation (${res.reason ?? 'erreur'}).`,
                    );
                  }
                } catch (err) {
                  console.warn('[ContentBenefits] use:', err);
                  Alert.alert('Erreur', 'Une erreur est survenue. Réessayez.');
                } finally {
                  setUsing(false);
                }
              })();
            },
          },
        ],
      );
    }, 280);
  }

  function goToPrime() {
    if (!passPurchaseEnabled) {
      setModal(null);
      return;
    }
    setModal(null);
    if (role === 'USER_ANONYMOUS') {
      navigation.navigate('Auth');
      return;
    }
    navigation.navigate('Abonnement');
  }

  // Gate Achat PASS OFF → aucune section privilèges sur fiches Agenda / Spot / Outil.
  if (!passPurchaseEnabled) return null;

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={shell.tabIndicator} />
      </View>
    );
  }

  if (!lines.length) return null;

  const lockedModal = modal?.kind === 'locked' ? modal.line : null;
  const unlockedModal = modal?.kind === 'unlocked' ? modal.line : null;
  const lockedPresentation = lockedModal
    ? getLockedPrivilegePresentation(role, passPurchaseEnabled)
    : null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: shell.pageTitle }]}>Privilèges</Text>
      {lines.map((line) => {
        const preview = previewDescription(line.item.description);
        return (
          <Pressable
            key={line.item.id}
            style={[
              styles.row,
              {
                borderColor: shell.filterInactiveBorder,
                opacity: line.unlocked ? 1 : 0.72,
              },
            ]}
            onPress={() => openLine(line)}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: shell.pageTitle }]} numberOfLines={1}>
                {line.item.title}
                {!line.unlocked ? '  🔒' : ''}
              </Text>
              {preview ? (
                <Text
                  style={[
                    styles.rowPreview,
                    {
                      color: shell.pageKicker,
                      ...(line.unlocked
                        ? null
                        : { opacity: 0.85 }),
                    },
                  ]}
                  numberOfLines={2}
                >
                  {preview}
                </Text>
              ) : null}
              {line.unlocked && line.exhausted ? (
                <Text style={[styles.rowPreview, { color: '#b45309', marginTop: 4, fontWeight: '700' }]}>
                  Quota atteint
                </Text>
              ) : null}
              {line.unlocked && line.pendingValidation ? (
                <Text style={[styles.rowPreview, { color: shell.tabIndicator, marginTop: 4, fontWeight: '700' }]}>
                  En attente de validation
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}

      {/* Conversion Prime — pas de détails du privilège */}
      <Modal
        visible={lockedModal != null}
        transparent
        animationType="fade"
        onRequestClose={() => setModal(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setModal(null)}>
          <Pressable
            style={[styles.modalCard, styles.upsellCard, { backgroundColor: shell.pageBg, borderColor: shell.tabIndicator }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.upsellKicker, { color: shell.tabIndicator }]}>LOOP PRIME</Text>
            <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>
              {lockedPresentation?.title ?? 'Un privilège réservé aux membres Prime'}
            </Text>
            <Text style={[styles.upsellBody, { color: shell.pageKicker }]}>
              {lockedPresentation?.body ?? ''}
            </Text>
            {lockedPresentation?.ctaMode === 'prime' ? (
              <Pressable
                style={[styles.useBtn, { backgroundColor: shell.tabIndicator }]}
                onPress={goToPrime}
              >
                <Text style={styles.useBtnTextDark}>{lockedPresentation.ctaLabel}</Text>
              </Pressable>
            ) : null}
            {lockedPresentation?.ctaMode === 'disabled' ? (
              <View
                style={[
                  styles.useBtn,
                  styles.useBtnDisabled,
                  {
                    backgroundColor: shell.filterInactiveBg,
                    borderColor: shell.filterInactiveBorder,
                  },
                ]}
                accessibilityRole="text"
                accessibilityState={{ disabled: true }}
              >
                <Text style={[styles.useBtnTextDisabled, { color: shell.pageKicker }]}>
                  {lockedPresentation.ctaLabel}
                </Text>
              </View>
            ) : null}
            <Pressable onPress={() => setModal(null)} style={{ marginTop: 14 }}>
              <Text style={{ color: shell.pageKicker, textAlign: 'center', fontSize: 13 }}>
                Pas maintenant
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Détails complets — accès ouvert */}
      <Modal
        visible={unlockedModal != null}
        transparent
        animationType="fade"
        onRequestClose={() => setModal(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setModal(null)}>
          <View
            style={[styles.modalCard, { backgroundColor: shell.pageBg }]}
            onStartShouldSetResponder={() => true}
          >
            {unlockedModal ? (
              <>
                <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>
                  {unlockedModal.item.title}
                </Text>
                {unlockedModal.item.description ? (
                  <Text style={[styles.modalBody, { color: shell.pageTitle }]}>
                    {unlockedModal.item.description}
                  </Text>
                ) : null}

                <View style={[styles.factBlock, { borderColor: shell.filterInactiveBorder }]}>
                  <Text style={[styles.factLabel, { color: shell.pageKicker }]}>Type</Text>
                  <Text style={[styles.factValue, { color: shell.pageTitle }]}>
                    {privilegeTypeLabel(unlockedModal.item.benefitKind)}
                  </Text>
                  <Text style={[styles.factLabel, { color: shell.pageKicker }]}>Quantité</Text>
                  <Text style={[styles.factValue, { color: shell.pageTitle }]}>
                    {privilegeQuantityLabel(unlockedModal.item, unlockedModal.userBenefit)}
                  </Text>
                  <Text style={[styles.factLabel, { color: shell.pageKicker }]}>Validité</Text>
                  <Text style={[styles.factValue, { color: shell.pageTitle }]}>
                    {privilegeValidityLabel(unlockedModal.item, unlockedModal.userBenefit)}
                  </Text>
                </View>

                <Pressable
                  style={[
                    styles.useBtn,
                    {
                      backgroundColor:
                        unlockedModal.exhausted || unlockedModal.pendingValidation
                          ? shell.filterInactiveBg
                          : shell.tabIndicator,
                      opacity: using ? 0.7 : 1,
                      borderWidth:
                        unlockedModal.exhausted || unlockedModal.pendingValidation ? StyleSheet.hairlineWidth : 0,
                      borderColor: shell.filterInactiveBorder,
                    },
                  ]}
                  onPress={() => handleUse(unlockedModal)}
                  disabled={using}
                >
                  <Text
                    style={[
                      styles.useBtnTextDark,
                      (unlockedModal.exhausted || unlockedModal.pendingValidation) && {
                        color: shell.pageKicker,
                      },
                    ]}
                  >
                    {privilegeUseButtonLabel(unlockedModal, using)}
                  </Text>
                </Pressable>
                <Pressable onPress={() => setModal(null)} style={{ marginTop: 12 }} disabled={using}>
                  <Text style={{ color: shell.pageKicker, textAlign: 'center' }}>Fermer</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: 16, alignItems: 'center' },
  wrap: { marginTop: 20, gap: 8 },
  title: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  row: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowPreview: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { borderRadius: 14, padding: 18 },
  upsellCard: { borderWidth: 1 },
  upsellKicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.22,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  upsellBody: { fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 18 },
  modalTitle: { fontSize: 17, fontWeight: '800' },
  modalBody: { fontSize: 13, lineHeight: 19, marginTop: 10, marginBottom: 12 },
  factBlock: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    gap: 4,
  },
  factLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.16,
    textTransform: 'uppercase',
    marginTop: 6,
  },
  factValue: { fontSize: 13, lineHeight: 18 },
  useBtn: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  useBtnDisabled: { borderWidth: StyleSheet.hairlineWidth, opacity: 0.92 },
  useBtnTextDark: { color: '#111', fontWeight: '800', fontSize: 14 },
  useBtnTextDisabled: { fontWeight: '800', fontSize: 14, textAlign: 'center' },
});
