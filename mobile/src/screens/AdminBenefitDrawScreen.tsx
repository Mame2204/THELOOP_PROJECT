import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { KeyboardSafeTextInput as TextInput } from '@/components/KeyboardSafeTextInput';
import { KeyboardAwareFormScroll } from '@/components/KeyboardAwareFormScroll';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GuineaLocationPicker } from '@/components/GuineaLocationPicker';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useAuthContext } from '@/context/AuthContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { AdminModuleDenied } from '@/components/admin/AdminModuleDenied';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import {
  ALL_DRAW_TARGET_ROLES,
  allDrawRolesSelected,
  countEligibleDrawCandidates,
  DRAW_ROLE_OPTIONS,
  listAdminBenefitDraws,
  listDrawEligibleCatalog,
  runAdminBenefitDraw,
  type BenefitDrawRecord,
  type DrawTargetRole,
} from '@/lib/admin-benefit-draw-store';
import {
  offeringsForBenefit,
  offeringPartnerKey,
  uniqueGrantableBenefits,
  type GrantableCatalogEntry,
} from '@/lib/admin-automation-benefits';
import { formatGrantableBenefitGeoLabel, geoTargetFromGrantableEntry } from '@/lib/benefit-geo';
import { formatOfferingScopeLabel } from '@/lib/partner-content-options';
import { formatDateFr } from '@/lib/date-utils';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminBenefitDraw'>;

export function AdminBenefitDrawScreen({ navigation }: Props) {
  const { role, user } = useAuthContext();
  const { countryCode } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed, isLoading, permissionLabel } = useAdminModuleAccess('benefit_draw');

  const [refreshing, setRefreshing] = useState(false);
  const [grantableOfferings, setGrantableOfferings] = useState<GrantableCatalogEntry[]>([]);
  const grantableBenefits = useMemo(() => uniqueGrantableBenefits(grantableOfferings), [grantableOfferings]);
  const [history, setHistory] = useState<BenefitDrawRecord[]>([]);
  const [eligible, setEligible] = useState(0);
  const [selectedRoles, setSelectedRoles] = useState<DrawTargetRole[]>(['USER_FREE', 'USER_PRIME']);
  const [winnerCount, setWinnerCount] = useState('3');
  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [selectedPartnerKey, setSelectedPartnerKey] = useState<string | null>(null);
  const [drawCity, setDrawCity] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [running, setRunning] = useState(false);
  const [detailDraw, setDetailDraw] = useState<BenefitDrawRecord | null>(null);

  const selectedCatalog = useMemo(
    () => grantableBenefits.find((c) => c.id === catalogId) ?? null,
    [grantableBenefits, catalogId],
  );

  const partnerOfferings = useMemo(
    () => (catalogId ? offeringsForBenefit(grantableOfferings, catalogId) : []),
    [grantableOfferings, catalogId],
  );

  const selectedOffering = useMemo(() => {
    if (!selectedPartnerKey) return partnerOfferings[0] ?? null;
    return (
      partnerOfferings.find(
        (o) => offeringPartnerKey(o.partnerId, o.partnerDisplayName) === selectedPartnerKey,
      ) ?? partnerOfferings[0] ?? null
    );
  }, [partnerOfferings, selectedPartnerKey]);

  const loadGrantable = useCallback(async () => {
    if (!selectedRoles.length) {
      setGrantableOfferings([]);
      return;
    }
    const grantable = await listDrawEligibleCatalog({
      roles: selectedRoles,
      countryCode,
      drawCity: drawCity.trim() || null,
    });
    setGrantableOfferings(grantable);
  }, [countryCode, drawCity, selectedRoles]);

  const refreshEligible = useCallback(async () => {
    setEligible(
      await countEligibleDrawCandidates(selectedRoles, countryCode, {
        drawCity: drawCity.trim() || null,
        catalogGeo: selectedOffering ? geoTargetFromGrantableEntry(selectedOffering) : null,
      }),
    );
  }, [selectedRoles, countryCode, drawCity, selectedOffering]);

  const load = useCallback(async () => {
    await loadGrantable();
    const draws = await listAdminBenefitDraws(countryCode);
    setHistory(draws);
    await refreshEligible();
  }, [countryCode, loadGrantable, refreshEligible]);

  const { run } = useFocusLoad(
    async () => {
      await load();
    },
    { ttlMs: 90_000, enabled: role === 'ADMIN', resetKey: countryCode },
  );

  useEffect(() => {
    void refreshEligible();
  }, [refreshEligible]);

  useEffect(() => {
    if (catalogId && !grantableBenefits.some((b) => b.id === catalogId)) {
      setCatalogId(null);
    }
  }, [grantableBenefits, catalogId]);

  useEffect(() => {
    if (!catalogId) {
      setSelectedPartnerKey(null);
      return;
    }
    const options = offeringsForBenefit(grantableOfferings, catalogId);
    if (!options.length) {
      setSelectedPartnerKey(null);
      return;
    }
    setSelectedPartnerKey((current) => {
      if (current && options.some((o) => offeringPartnerKey(o.partnerId, o.partnerDisplayName) === current)) {
        return current;
      }
      const first = options[0];
      return offeringPartnerKey(first.partnerId, first.partnerDisplayName);
    });
  }, [catalogId, grantableOfferings]);

  function toggleRole(r: DrawTargetRole) {
    setSelectedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  function toggleAllRoles() {
    setSelectedRoles((prev) => (allDrawRolesSelected(prev) ? [] : [...ALL_DRAW_TARGET_ROLES]));
  }

  async function handleDraw() {
    if (!user || !catalogId || !selectedOffering) {
      Alert.alert('Champs requis', 'Sélectionnez un privilège validé et un partenaire.');
      return;
    }
    const count = Number(winnerCount);
    if (!Number.isFinite(count) || count < 1) {
      Alert.alert('Nombre invalide', 'Indiquez combien de comptes tirer au sort.');
      return;
    }
    if (!selectedRoles.length) {
      Alert.alert('Rôles requis', 'Sélectionnez au moins un rôle cible.');
      return;
    }
    if (count > eligible) {
      Alert.alert('Pool insuffisant', `Seulement ${eligible} compte(s) éligible(s) pour ces critères.`);
      return;
    }

    const validityHint =
      selectedCatalog?.validityStartsOnActivation !== false
        ? `${selectedCatalog?.defaultValidityDays ?? 30} j. à partir de la 1ʳᵉ consommation`
        : `${selectedCatalog?.defaultValidityDays ?? 30} j. dès l'octroi`;

    Alert.alert(
      'Lancer le tirage',
      `Tirer ${count} gagnant(s) parmi ${eligible} éligibles · ${selectedCatalog?.title ?? 'privilège'} · validité catalogue : ${validityHint}.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tirer',
          onPress: () => {
            setRunning(true);
            void runAdminBenefitDraw({
              roles: selectedRoles,
              winnerCount: count,
              catalogId,
              partnerId: selectedOffering.partnerId,
              partnerDisplayName: selectedOffering.partnerDisplayName,
              drawCity: drawCity.trim() || null,
              countryCode,
              customNote: customNote.trim() || null,
              drawnBy: user.id,
            })
              .then((res) => {
                if (!res.ok || !res.record) {
                  const msg =
                    res.error === 'no_candidates'
                      ? 'Aucun compte éligible pour cette zone / ce privilège.'
                      : res.error === 'catalog_not_draw_eligible'
                        ? 'Ce privilège est déjà octroyé à tout le rôle cible. Utilisez « Octroyer » ou choisissez une campagne limitée / code promo.'
                        : res.error === 'grant_failed'
                          ? 'Octroi impossible.'
                          : 'Tirage impossible.';
                  Alert.alert('Erreur', msg);
                  return;
                }
                Alert.alert(
                  'Tirage terminé',
                  `${res.record.winners.length} gagnant(s) ont reçu « ${res.record.catalogTitle} ».`,
                );
                void load();
              })
              .finally(() => setRunning(false));
          },
        },
      ],
    );
  }

  if (!allowed && !isLoading) {
    return <AdminModuleDenied shell={shell} moduleLabel={permissionLabel} onBack={() => navigation.goBack()} />;
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
            tintColor={ADMIN_THEME.accent}
          />
        }
      >
        <AdminPageHeader
          title="Tirage au sort"
          subtitle="Attribuer un privilège à des gagnants tirés aléatoirement"
          shell={shell}
          onBack={() => navigation.goBack()}
        />
        <AdminCountryBar shell={shell} />

        <View style={[styles.help, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
          <Text style={{ color: shell.pageTitle, fontWeight: '800', fontSize: 13 }}>Campagnes limitées</Text>
          <Text style={{ color: shell.pageKicker, fontSize: 11, lineHeight: 17, marginTop: 6 }}>
            Le tirage attribue N gagnants parmi un pool — pas tout un rôle. Exemples : 3 dîners offerts ce mois-ci parmi 800 membres, 10 codes promo Instagram, 5 places VIP Loop.
          </Text>
          <Text style={{ color: shell.pageKicker, fontSize: 11, lineHeight: 17, marginTop: 6 }}>
            Choisissez un ou plusieurs rôles, ou « Tous » (Membres + Prime + Partenaires + Admins délégués). Le super admin est exclu du pool.
          </Text>
          <Text style={{ color: shell.pageKicker, fontSize: 11, lineHeight: 17, marginTop: 6 }}>
            Privilège disponible pour le tirage = actif, validé par un partenaire Pro, et pas déjà donné à tout le rôle sélectionné via Octroyer (sauf codes promo). Maillage ville = préfecture.
          </Text>
          <Text style={{ color: ADMIN_THEME.accent, fontSize: 12, fontWeight: '700', marginTop: 8 }}>
            {eligible} compte(s) éligible(s) · {countryCode}
            {drawCity.trim() ? ` · ${drawCity.trim()}` : ''}
          </Text>
        </View>

        <GuineaLocationPicker
          value={drawCity}
          onChange={setDrawCity}
          shell={shell}
          label="Maillage localisation (tirage)"
          countryCode={countryCode}
          allowCommuneOnly
          optional
          placeholder="Vide = tout le pays — filtre le pool et le catalogue"
        />

        <Text style={[styles.lbl, { color: shell.pageKicker }]}>Rôles du pool de tirage</Text>
        <View style={styles.chips}>
          <Pressable
            style={[styles.chip, allDrawRolesSelected(selectedRoles) && { backgroundColor: ADMIN_THEME.accent }]}
            onPress={toggleAllRoles}
          >
            <Text
              style={{
                color: allDrawRolesSelected(selectedRoles) ? '#fff' : shell.pageTitle,
                fontSize: 11,
                fontWeight: '700',
              }}
            >
              Tous
            </Text>
          </Pressable>
          {DRAW_ROLE_OPTIONS.map((r) => (
            <Pressable
              key={r.value}
              style={[styles.chip, selectedRoles.includes(r.value) && { backgroundColor: ADMIN_THEME.accent }]}
              onPress={() => toggleRole(r.value)}
            >
              <Text style={{ color: selectedRoles.includes(r.value) ? '#fff' : shell.pageTitle, fontSize: 11, fontWeight: '700' }}>
                {r.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          style={inputStyle}
          placeholder="Nombre de comptes à tirer"
          placeholderTextColor={shell.pageKicker}
          keyboardType="number-pad"
          value={winnerCount}
          onChangeText={setWinnerCount}
        />

        <Text style={[styles.lbl, { color: shell.pageKicker }]}>Privilège à tirer</Text>
        {grantableBenefits.length === 0 ? (
          <Text style={[styles.hint, { color: shell.pageKicker, marginBottom: 8 }]}>
            Aucun privilège disponible pour ces rôles et cette zone. Vérifiez le catalogue (actif + validé partenaire), ou retirez l’octroi global dans Octroyer si le privilège est déjà pour tout le rôle.
          </Text>
        ) : null}
        {grantableBenefits.map((item) => (
          <Pressable
            key={item.id}
            style={[
              styles.catalogRow,
              {
                borderColor: catalogId === item.id ? ADMIN_THEME.accent : shell.filterInactiveBorder,
                backgroundColor: shell.filterInactiveBg,
              },
            ]}
            onPress={() => setCatalogId(item.id)}
          >
            <Text style={{ color: shell.pageTitle, fontWeight: '700' }}>{item.title}</Text>
            <Text style={{ color: shell.pageKicker, fontSize: 10, marginTop: 4, fontWeight: '700' }}>
              {formatGrantableBenefitGeoLabel(item, grantableOfferings)}
            </Text>
            <Text style={{ color: shell.pageKicker, fontSize: 11, marginTop: 4 }}>{item.description}</Text>
          </Pressable>
        ))}

        {catalogId && partnerOfferings.length > 0 ? (
          <>
            <Text style={[styles.lbl, { color: shell.pageKicker }]}>Partenaire offrant</Text>
            <View style={styles.chips}>
              {partnerOfferings.map((opt) => {
                const key = offeringPartnerKey(opt.partnerId, opt.partnerDisplayName);
                const active = selectedPartnerKey === key;
                return (
                  <Pressable
                    key={key}
                    style={[styles.chip, active && { backgroundColor: ADMIN_THEME.accent }]}
                    onPress={() => setSelectedPartnerKey(key)}
                  >
                    <Text style={{ color: active ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '700' }}>
                      {opt.partnerDisplayName}
                    </Text>
                    <Text style={{ color: active ? '#111' : shell.pageKicker, fontSize: 8, marginTop: 2 }}>
                      {formatOfferingScopeLabel(opt.contentType, opt.contentTitle)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {catalogId && partnerOfferings.length === 0 ? (
          <Text style={{ color: '#f87171', fontSize: 12, marginBottom: 8 }}>
            Aucun partenaire validé pour ce privilège dans cette zone.
          </Text>
        ) : null}

        {selectedCatalog ? (
          <Text style={[styles.hint, { color: shell.pageKicker, marginBottom: 8 }]}>
            Validité catalogue : {selectedCatalog.defaultValidityDays} j.
            {selectedCatalog.validityStartsOnActivation !== false
              ? ' · compte à rebours à la 1ʳᵉ consommation'
              : ' · compte à rebours dès l\'octroi'}
          </Text>
        ) : null}

        <TextInput
          style={inputStyle}
          placeholder="Note optionnelle pour les gagnants"
          placeholderTextColor={shell.pageKicker}
          value={customNote}
          onChangeText={setCustomNote}
        />

        <Pressable
          style={[styles.drawBtn, { backgroundColor: running ? '#64748b' : ADMIN_THEME.accent }]}
          disabled={running}
          onPress={() => void handleDraw()}
        >
          <Text style={styles.drawBtnText}>{running ? 'Tirage…' : '🎲 Lancer le tirage'}</Text>
        </Pressable>

        <Text style={[styles.lbl, { color: shell.pageKicker, marginTop: 24 }]}>Historique ({history.length})</Text>
        {history.length === 0 ? (
          <Text style={{ color: shell.pageKicker, fontStyle: 'italic', fontSize: 12 }}>Aucun tirage pour l'instant.</Text>
        ) : (
          history.map((draw) => (
            <Pressable
              key={draw.id}
              style={[styles.historyCard, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
              onPress={() => setDetailDraw(draw)}
            >
              <Text style={{ color: shell.pageTitle, fontWeight: '800' }}>{draw.catalogTitle}</Text>
              <Text style={{ color: shell.pageKicker, fontSize: 11, marginTop: 4 }}>
                {draw.winners.length} gagnant(s) · {formatDateFr(draw.drawnAt)}
              </Text>
              <Text style={{ color: ADMIN_THEME.accent, fontSize: 11, marginTop: 2, fontWeight: '700' }}>Détails →</Text>
            </Pressable>
          ))
        )}
      </KeyboardAwareFormScroll>

      <Modal visible={Boolean(detailDraw)} transparent animationType="fade" onRequestClose={() => setDetailDraw(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDetailDraw(null)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}
            onPress={() => {}}
          >
            {detailDraw ? (
              <>
                <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>{detailDraw.catalogTitle}</Text>
                <Text style={{ color: shell.pageKicker, fontSize: 12, marginTop: 6 }}>
                  {detailDraw.winners.length} gagnant(s) · {formatDateFr(detailDraw.drawnAt)}
                </Text>
                <Text style={{ color: shell.pageKicker, fontSize: 12, marginTop: 4 }}>
                  Rôles : {detailDraw.roles.map((r) => DRAW_ROLE_OPTIONS.find((o) => o.value === r)?.label ?? r).join(', ')}
                </Text>
                {detailDraw.drawCity ? (
                  <Text style={{ color: shell.pageKicker, fontSize: 12, marginTop: 4 }}>
                    Zone : {detailDraw.drawCity}
                  </Text>
                ) : null}
                <Text style={{ color: shell.pageKicker, fontSize: 12, marginTop: 4 }}>
                  Validité catalogue :{' '}
                  {detailDraw.validityDays == null
                    ? 'Sans date de validité'
                    : `${detailDraw.validityDays} j.${detailDraw.validityStartsOnActivation ? ' à partir de la consommation' : ' à partir de l\'octroi'}`}
                </Text>
                <Text style={[styles.lbl, { color: shell.pageKicker, marginTop: 12 }]}>Gagnants</Text>
                {detailDraw.winners.map((w) => (
                  <Text key={w.benefitId} style={{ color: shell.pageTitle, fontSize: 12, marginTop: 4 }}>
                    {w.displayName ?? w.phone ?? w.userId}
                  </Text>
                ))}
                <Pressable style={styles.modalClose} onPress={() => setDetailDraw(null)}>
                  <Text style={{ color: ADMIN_THEME.accent, fontWeight: '800' }}>Fermer</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  help: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  lbl: { fontSize: 10, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#64748b' },
  hint: { fontSize: 12, lineHeight: 17 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10, fontSize: 14 },
  catalogRow: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  drawBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  drawBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  historyCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  modalClose: { marginTop: 20, alignItems: 'center' },
});
