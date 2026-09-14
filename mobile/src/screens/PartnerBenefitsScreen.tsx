import { useCallback, useMemo, useState, useRef } from 'react';
import { Alert, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { AdminPageHeader } from '@/components/admin/AdminShell';
import { BENEFIT_KIND_LABELS, getBenefitCatalogItem, type BenefitKind } from '@/lib/benefit-catalog-store';
import { formatDateFr } from '@/lib/date-utils';
import { formatOfferingScopeLabel } from '@/lib/partner-content-options';
import { listPartnerActiveCatalogBenefits } from '@/lib/partner-benefit-matching';
import {
  acceptPartnerBenefitOffer,
  invalidatePartnerBenefitOffersRemoteCache,
  isPartnerOfferActive,
  listPartnerBenefitOffers,
  PARTNER_OFFER_STATUS_LABELS,
  partnerDisableOwnBenefitOffer,
  respondPartnerBenefitOffer,
  type PartnerBenefitOffer,
} from '@/lib/partner-benefit-offers-store';
import { resolvePartnerWorkspaceContext } from '@/lib/partner-spot-auth';
import { getCountryLabel } from '@/lib/countries';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerBenefits'>;

const PRO_ACCENT = '#20C997';

function statusColor(status: PartnerBenefitOffer['status']): string {
  if (status === 'pending') return '#fcd34d';
  if (status === 'accepted' || status === 'auto_accepted') return '#34d399';
  if (status === 'declined') return '#f87171';
  return '#94a3b8';
}

export function PartnerBenefitsScreen({ navigation }: Props) {
  const { role, user } = useAuthContext();
  const { shell } = useMemberTheme();
  const [offers, setOffers] = useState<PartnerBenefitOffer[]>([]);
  const [activeCatalog, setActiveCatalog] = useState<Array<{ catalogId: string; title: string; description: string }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [detailOffer, setDetailOffer] = useState<PartnerBenefitOffer | null>(null);
  const [detailExtra, setDetailExtra] = useState<{
    validityDays?: number;
    kindLabel?: string;
    quantity?: number | null;
    maxUses?: number | null;
  } | null>(null);
  const [rejectOffer, setRejectOffer] = useState<PartnerBenefitOffer | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const partnerLabel = user?.company ?? user?.fullName ?? 'Partenaire';
  const loadSeq = useRef(0);
  const acceptingRef = useRef(false);

  const load = useCallback(async () => {
    if (!user?.id || role !== 'PARTNER') return;
    const seq = ++loadSeq.current;
    const ctx = await resolvePartnerWorkspaceContext(user);
    const { effectiveUserId, partnerLabel, phone, authUserId } = ctx;
    const authHint = authUserId ?? user.id;

    try {
      const list = await listPartnerBenefitOffers(effectiveUserId, partnerLabel, undefined, phone, authHint);
      if (seq !== loadSeq.current) return;
      setOffers(list);
      if (__DEV__) {
        console.log('[PartnerBenefits] chargé', {
          pending: list.filter((o) => o.status === 'pending').length,
          active: list.filter((o) => isPartnerOfferActive(o.status)).length,
          total: list.length,
        });
      }
      const activeFromOffers = list
        .filter((o) => isPartnerOfferActive(o.status))
        .map((o) => ({
          catalogId: o.catalogId,
          title: o.catalogTitle,
          description: o.catalogDescription,
        }));
      if (activeFromOffers.length) {
        setActiveCatalog(activeFromOffers);
      } else {
        const catalog = await listPartnerActiveCatalogBenefits(effectiveUserId, partnerLabel).catch(() => []);
        if (seq !== loadSeq.current) return;
        setActiveCatalog(catalog);
      }
    } catch (err) {
      console.warn('[PartnerBenefits] chargement:', err instanceof Error ? err.message : err);
    }
  }, [user?.id, user?.phoneNumber, user?.company, user?.fullName, role]);

  const { run } = useFocusLoad(
    async () => {
      await load();
    },
    { ttlMs: 90_000, enabled: role === 'PARTNER' && Boolean(user?.id) },
  );

  const pending = useMemo(() => offers.filter((o) => o.status === 'pending'), [offers]);
  const active = useMemo(() => {
    const accepted = offers.filter((o) => o.status === 'accepted' || o.status === 'auto_accepted');
    // Une seule carte active par privilège catalogue
    const byCatalog = new Map<string, PartnerBenefitOffer>();
    for (const offer of accepted) {
      const prev = byCatalog.get(offer.catalogId);
      if (!prev || offer.createdAt > prev.createdAt) byCatalog.set(offer.catalogId, offer);
    }
    return Array.from(byCatalog.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [offers]);
  const history = useMemo(
    () => offers.filter((o) => o.status === 'declined' || o.status === 'disabled'),
    [offers],
  );
  /** Catalogue « legacy » sans offre dédiée — exclut les IDs déjà affichés via offres acceptées. */
  const activeCatalogOnly = useMemo(() => {
    const offerIds = new Set(active.map((o) => o.catalogId));
    const seen = new Set<string>();
    return activeCatalog.filter((item) => {
      if (offerIds.has(item.catalogId) || seen.has(item.catalogId)) return false;
      seen.add(item.catalogId);
      return true;
    });
  }, [active, activeCatalog]);

  async function openDetail(offer: PartnerBenefitOffer) {
    setDetailOffer(offer);
    setDetailExtra(null);
    const item = await getBenefitCatalogItem(offer.catalogId);
    if (item) {
      setDetailExtra({
        validityDays: item.defaultValidityDays,
        kindLabel: BENEFIT_KIND_LABELS[item.benefitKind],
        quantity: item.quantityPerGrant,
        maxUses: item.maxUsesPerGrant,
      });
    } else if (offer.defaultValidityDays != null || offer.benefitKind) {
      setDetailExtra({
        validityDays: offer.defaultValidityDays ?? undefined,
        kindLabel: offer.benefitKind
          ? BENEFIT_KIND_LABELS[offer.benefitKind as BenefitKind] ?? offer.benefitKind
          : undefined,
      });
    }
  }

  async function acceptOffer(offer: PartnerBenefitOffer) {
    if (!user || acceptingRef.current) return;
    acceptingRef.current = true;
    if (__DEV__) {
      console.log('[PartnerBenefits] accept tap', offer.id, offer.catalogId);
    }
    try {
      await acceptPartnerBenefitOffer(offer);
      invalidatePartnerBenefitOffersRemoteCache();
      setDetailOffer(null);
      Alert.alert('Accepté', 'Privilège activé. THE LOOP a été notifié.');
      void load();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Validation impossible — vérifiez votre connexion.';
      if (__DEV__) {
        console.warn('[PartnerBenefits] accept error:', message);
      }
      Alert.alert('Erreur', message);
    } finally {
      acceptingRef.current = false;
    }
  }

  async function disableOffer(offer: PartnerBenefitOffer) {
    if (!user) return;
    Alert.alert(
      'Désactiver l\'privilège',
      `Retirer « ${offer.catalogTitle} » de vos offres actives ? Il passera en historique.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Désactiver',
          style: 'destructive',
          onPress: async () => {
            const next = await partnerDisableOwnBenefitOffer(offer.id, user.id);
            if (!next) {
              Alert.alert('Erreur', 'Impossible de désactiver ce privilège.');
              return;
            }
            setDetailOffer(null);
            await load();
            Alert.alert('Désactivé', 'L\'privilège a été archivé.');
          },
        },
      ],
    );
  }

  async function confirmReject() {
    if (!user || !rejectOffer) return;
    const reason = rejectReason.trim();
    if (!reason) {
      Alert.alert('Motif requis', 'Indiquez le motif du refus pour THE LOOP.');
      return;
    }
    try {
      const ctx = await resolvePartnerWorkspaceContext(user);
      const next = await respondPartnerBenefitOffer(
        rejectOffer.id,
        ctx.effectiveUserId,
        false,
        reason,
        rejectOffer,
      );
      if (!next) {
        Alert.alert('Erreur', 'Impossible de refuser cette demande.');
        return;
      }
      invalidatePartnerBenefitOffersRemoteCache();
      setRejectOffer(null);
      setRejectReason('');
      await load();
      Alert.alert('Refus enregistré', 'THE LOOP a été notifié avec votre motif.');
    } catch (err) {
      Alert.alert(
        'Erreur',
        err instanceof Error ? err.message : 'Refus impossible — vérifiez votre connexion.',
      );
    }
  }

  function OfferCard({ offer, showActions }: { offer: PartnerBenefitOffer; showActions?: boolean }) {
    return (
      <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
        <Text style={[styles.title, { color: shell.pageTitle }]}>{offer.catalogTitle}</Text>
        <Text style={[styles.meta, { color: shell.pageKicker }]} numberOfLines={2}>{offer.catalogDescription}</Text>
        {offer.city ? <Text style={[styles.meta, { color: shell.pageKicker }]}>Ville : {offer.city}</Text> : null}
        {(offer.contentTitle || offer.contentType) ? (
          <Text style={[styles.meta, { color: shell.pageKicker }]}>
            Lieu : {formatOfferingScopeLabel(offer.contentType, offer.contentTitle)}
          </Text>
        ) : null}
        <Text style={[styles.badge, { color: statusColor(offer.status) }]}>
          {PARTNER_OFFER_STATUS_LABELS[offer.status]}
        </Text>
        {offer.status === 'pending' ? (
          <Text style={[styles.meta, { color: shell.pageKicker }]}>
            En attente de votre validation — aucune activation automatique.
          </Text>
        ) : null}
        {offer.status === 'declined' && offer.partnerResponseNote ? (
          <Text style={[styles.meta, { color: '#f87171' }]}>Motif : {offer.partnerResponseNote}</Text>
        ) : null}
        <View style={styles.actions}>
          <Pressable
            style={[styles.btnOutline, { borderColor: shell.filterInactiveBorder }]}
            onPress={() => void openDetail(offer)}
          >
            <Text style={[styles.btnOutlineText, { color: shell.pageTitle }]}>Détails</Text>
          </Pressable>
          {showActions && offer.status === 'pending' ? (
            <>
              <Pressable style={[styles.btn, { backgroundColor: PRO_ACCENT }]} onPress={() => void acceptOffer(offer)}>
                <Text style={styles.btnText}>Accepter</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, { backgroundColor: '#64748b' }]}
                onPress={() => {
                  setRejectOffer(offer);
                  setRejectReason('');
                }}
              >
                <Text style={styles.btnText}>Refuser</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    );
  }

  /** Ligne compacte — titre + statut ; tap → détail. */
  function ActiveRow({
    title,
    subtitle,
    subtitleColor,
    onPress,
    onDisable,
  }: {
    title: string;
    subtitle?: string;
    subtitleColor?: string;
    onPress: () => void;
    onDisable?: () => void;
  }) {
    return (
      <View style={[styles.activeRow, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
        <Pressable onPress={onPress} style={styles.activeRowText}>
          <Text style={[styles.activeTitle, { color: shell.pageTitle }]} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.activeSub, { color: subtitleColor ?? shell.pageKicker }]} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </Pressable>
        {onDisable ? (
          <Pressable onPress={onDisable} hitSlop={8} style={styles.disableChip}>
            <Text style={{ color: '#f87171', fontSize: 11, fontWeight: '700' }}>Désactiver</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onPress} hitSlop={8}>
          <Text style={[styles.activeChevron, { color: PRO_ACCENT }]}>Détails ›</Text>
        </Pressable>
      </View>
    );
  }

  async function openCatalogDetail(item: { catalogId: string; title: string; description: string }) {
    const synthetic: PartnerBenefitOffer = {
      id: `catalog-${item.catalogId}`,
      partnerUserId: user?.id ?? '',
      partnerName: partnerLabel,
      catalogId: item.catalogId,
      catalogTitle: item.title,
      catalogDescription: item.description,
      countryCode: user?.countryCode ?? 'GN',
      city: null,
      status: 'accepted',
      adminNote: null,
      partnerResponseNote: null,
      createdAt: new Date().toISOString(),
      respondedAt: null,
      validationDeadlineAt: new Date().toISOString(),
    };
    await openDetail(synthetic);
  }

  if (role !== 'PARTNER') {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={{ color: shell.pageTitle }}>Réservé aux partenaires</Text>
      </View>
    );
  }

  const inputStyle = [
    styles.input,
    { borderColor: shell.filterInactiveBorder, color: shell.pageTitle, backgroundColor: shell.filterInactiveBg },
  ];

  return (
    <>
      <KeyboardAwareFormScroll
        style={{ flex: 1, backgroundColor: shell.pageBg }}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void run(true).finally(() => setRefreshing(false));
            }}
            tintColor={PRO_ACCENT}
          />
        }
      >
        <AdminPageHeader
          title="Privilèges offerts"
          subtitle="Propositions THE LOOP — validation manuelle requise"
          shell={shell}
          embedded={false}
          onBack={() => navigation.goBack()}
        />

        <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>En cours de validation ({pending.length})</Text>
        {pending.length === 0 ? (
          <Text style={[styles.emptySection, { color: shell.pageKicker }]}>Aucune demande en attente.</Text>
        ) : (
          pending.map((offer) => <OfferCard key={offer.id} offer={offer} showActions />)
        )}

        <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>
          Actifs ({active.length + activeCatalogOnly.length})
        </Text>
        {active.map((offer) => (
          <ActiveRow
            key={offer.id}
            title={offer.catalogTitle}
            subtitle={
              offer.contentTitle || offer.contentType
                ? formatOfferingScopeLabel(offer.contentType, offer.contentTitle)
                : 'Actif'
            }
            onPress={() => void openDetail(offer)}
            onDisable={() => void disableOffer(offer)}
          />
        ))}
        {activeCatalogOnly.map((item) => (
          <ActiveRow
            key={item.catalogId}
            title={item.title}
            subtitle="Actif · catalogue"
            onPress={() => void openCatalogDetail(item)}
          />
        ))}
        {active.length === 0 && activeCatalogOnly.length === 0 ? (
          <Text style={[styles.emptySection, { color: shell.pageKicker }]}>Aucun privilège actif pour le moment.</Text>
        ) : null}

        <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>
          Historique — refusés & désactivés ({history.length})
        </Text>
        {history.length === 0 ? (
          <Text style={[styles.emptySection, { color: shell.pageKicker }]}>
            Aucun privilège refusé ou désactivé pour l’instant.
          </Text>
        ) : (
          history.map((offer) => (
            <ActiveRow
              key={offer.id}
              title={offer.catalogTitle}
              subtitle={
                offer.status === 'declined'
                  ? `Refusé${offer.partnerResponseNote ? ` · ${offer.partnerResponseNote}` : ''}`
                  : PARTNER_OFFER_STATUS_LABELS[offer.status]
              }
              subtitleColor={offer.status === 'declined' ? '#f87171' : undefined}
              onPress={() => void openDetail(offer)}
            />
          ))
        )}
      </KeyboardAwareFormScroll>

      <Modal visible={detailOffer != null} transparent animationType="slide" onRequestClose={() => setDetailOffer(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
            {detailOffer ? (
              <>
                <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>{detailOffer.catalogTitle}</Text>
                <KeyboardAwareFormScroll style={{ maxHeight: 360 }} nestedScrollEnabled keyboardPriority={10}>
                  <DetailRow label="Description" value={detailOffer.catalogDescription || '—'} shell={shell} />
                  <DetailRow label="Statut" value={PARTNER_OFFER_STATUS_LABELS[detailOffer.status]} shell={shell} />
                  <DetailRow
                    label="Lieu de validité"
                    value={formatOfferingScopeLabel(detailOffer.contentType, detailOffer.contentTitle)}
                    shell={shell}
                  />
                  <DetailRow label="Pays" value={getCountryLabel(detailOffer.countryCode)} shell={shell} />
                  {detailOffer.city ? <DetailRow label="Ville" value={detailOffer.city} shell={shell} /> : null}
                  {detailExtra?.kindLabel ? <DetailRow label="Type" value={detailExtra.kindLabel} shell={shell} /> : null}
                  {detailExtra?.validityDays != null ? (
                    <DetailRow label="Validité" value={`${detailExtra.validityDays} jours`} shell={shell} />
                  ) : null}
                  {detailExtra?.quantity != null ? (
                    <DetailRow label="Quantité" value={`×${detailExtra.quantity}`} shell={shell} />
                  ) : null}
                  {detailExtra?.maxUses != null ? (
                    <DetailRow label="Utilisations max" value={String(detailExtra.maxUses)} shell={shell} />
                  ) : null}
                  <DetailRow label="Proposé le" value={formatDateFr(detailOffer.createdAt)} shell={shell} />
                  {detailOffer.respondedAt ? (
                    <DetailRow label="Répondu le" value={formatDateFr(detailOffer.respondedAt)} shell={shell} />
                  ) : null}
                  {detailOffer.partnerResponseNote ? (
                    <DetailRow label="Votre motif" value={detailOffer.partnerResponseNote} shell={shell} />
                  ) : null}
                  {detailOffer.adminNote ? (
                    <DetailRow label="Note THE LOOP" value={detailOffer.adminNote} shell={shell} />
                  ) : null}
                </KeyboardAwareFormScroll>
                {detailOffer.status === 'pending' ? (
                  <View style={styles.modalActions}>
                    <Pressable style={[styles.btn, { backgroundColor: PRO_ACCENT, flex: 1 }]} onPress={() => void acceptOffer(detailOffer)}>
                      <Text style={styles.btnText}>Accepter</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.btn, { backgroundColor: '#64748b', flex: 1 }]}
                      onPress={() => {
                        setRejectOffer(detailOffer);
                        setRejectReason('');
                      }}
                    >
                      <Text style={styles.btnText}>Refuser</Text>
                    </Pressable>
                  </View>
                ) : null}
                {detailOffer.status === 'accepted' || detailOffer.status === 'auto_accepted' ? (
                  <Pressable
                    style={[styles.btn, { backgroundColor: '#64748b', marginTop: 8 }]}
                    onPress={() => void disableOffer(detailOffer)}
                  >
                    <Text style={styles.btnText}>Désactiver ce privilège</Text>
                  </Pressable>
                ) : null}
                <Pressable style={styles.modalClose} onPress={() => setDetailOffer(null)}>
                  <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Fermer</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal visible={rejectOffer != null} transparent animationType="slide" onRequestClose={() => setRejectOffer(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalSheet, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}>
            <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>Refuser le privilège</Text>
            <Text style={[styles.meta, { color: shell.pageKicker, marginBottom: 12 }]}>
              {rejectOffer ? `« ${rejectOffer.catalogTitle} » — THE LOOP recevra votre motif.` : ''}
            </Text>
            <Text style={[styles.label, { color: shell.pageKicker }]}>Motif du refus *</Text>
            <TextInput
              style={inputStyle}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Ex. conditions incompatibles, période non disponible…"
              placeholderTextColor={shell.pageKicker}
              multiline
              textAlignVertical="top"
              autoFocus
            />
            <Pressable style={[styles.btn, { backgroundColor: '#ef4444' }]} onPress={() => void confirmReject()}>
              <Text style={styles.btnText}>Confirmer le refus</Text>
            </Pressable>
            <Pressable style={styles.modalClose} onPress={() => setRejectOffer(null)}>
              <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
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
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: shell.pageKicker, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ color: shell.pageTitle, fontSize: 13, marginTop: 4, lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 40 },
  sectionTitle: { marginTop: 20, marginBottom: 8, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  emptySection: { fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  activeRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeRowText: { flex: 1, minWidth: 0 },
  activeTitle: { fontSize: 14, fontWeight: '700' },
  activeSub: { marginTop: 2, fontSize: 11 },
  activeChevron: { fontSize: 11, fontWeight: '700' },
  disableChip: { paddingHorizontal: 8, paddingVertical: 4 },
  title: { fontSize: 15, fontWeight: '700' },
  meta: { marginTop: 6, fontSize: 12, lineHeight: 18 },
  badge: { marginTop: 8, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  lockHint: { marginTop: 6, fontSize: 11, fontStyle: 'italic' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  btn: { flexGrow: 1, minWidth: 90, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnOutline: { flexGrow: 1, minWidth: 90, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  btnOutlineText: { fontWeight: '700', fontSize: 12 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { borderWidth: 1, borderRadius: 16, margin: 12, marginBottom: 24, padding: 16 },
  modalTitle: { fontSize: 17, fontWeight: '800', marginBottom: 12 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modalClose: { alignItems: 'center', paddingVertical: 14 },
  label: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 100, fontSize: 14, marginBottom: 12 },
});
