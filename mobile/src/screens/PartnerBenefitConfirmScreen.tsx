import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import {
  applyPartnerBenefitValidationRemote,
  cancelRedemptions,
  fetchPartnerPendingValidations,
  listPendingRedemptionsForMemberAndPartner,
  validateRedemptions,
  type BenefitRedemption,
} from '@/lib/benefit-redemption-store';
import {
  getRoleEntitlementBadge,
  revertBenefitToActive,
  syncExpiredBenefitPendingStates,
  type PrimeBenefit,
} from '@/lib/prime-benefits-store';
import { establishmentTypeLabel } from '@/lib/partner-establishments';
import { scannedMemberRoleLabel } from '@/lib/member-qr-scan';
import { sendPartnerBenefitValidatedNotification, sendPartnerBenefitCancelledNotification } from '@/lib/user-notifications-store';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PartnerBenefitConfirm'>;

type PendingItem = {
  redemption: BenefitRedemption;
  benefit: PrimeBenefit;
};

function syntheticBenefitFromValidation(
  row: { benefitTitle: string; benefitDescription: string; redemption: BenefitRedemption },
  memberUserId: string,
  memberPhone: string | null,
): PrimeBenefit {
  const { redemption } = row;
  return {
    id: redemption.benefitId,
    userId: memberUserId,
    userPhone: memberPhone,
    catalogId: 'remote',
    title: row.benefitTitle,
    description: row.benefitDescription,
    partnerName: redemption.partnerName,
    benefitKind: 'unlimited',
    quantityTotal: null,
    quantityUsed: 0,
    maxUses: null,
    usesCount: 0,
    status: 'pending_validation',
    grantedAt: redemption.createdAt,
    expiresAt: redemption.expiresAt,
    usedAt: null,
    grantedBy: 'admin',
    grantAudience: 'individual',
    customNote: null,
    contentId: redemption.contentId ?? null,
    contentType: redemption.contentType ?? null,
    contentTitle: redemption.contentTitle ?? null,
  };
}

function dedupePendingItems(items: PendingItem[]): PendingItem[] {
  const byBenefit = new Map<string, PendingItem>();
  for (const item of items) {
    const existing = byBenefit.get(item.benefit.id);
    if (
      !existing ||
      new Date(item.redemption.createdAt).getTime() > new Date(existing.redemption.createdAt).getTime()
    ) {
      byBenefit.set(item.benefit.id, item);
    }
  }
  return Array.from(byBenefit.values());
}

/**
 * Demande initiée par le membre pour l'établissement sélectionné.
 * Sans établissement choisi : affiche toutes les demandes en attente pour ce partenaire.
 */
function isPendingRequestForSelectedEstablishment(
  benefit: PrimeBenefit,
  redemption: BenefitRedemption,
  establishmentId?: string,
): boolean {
  if (benefit.status !== 'pending_validation') return false;

  const linkedIds = [benefit.contentId, redemption.contentId]
    .map((id) => id?.trim())
    .filter((id): id is string => Boolean(id));

  if (!establishmentId) return true;

  if (!linkedIds.length) return true;

  return linkedIds.includes(establishmentId);
}

export function PartnerBenefitConfirmScreen({ navigation, route }: Props) {
  const {
    partnerId,
    partnerName,
    partnerCode,
    memberUserId,
    memberFirstName,
    memberLastName,
    memberPhone,
    memberRole,
    establishmentId,
    establishmentType,
    establishmentTitle,
  } = route.params;
  const { shell } = useMemberTheme();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const memberName = useMemo(
    () => [memberFirstName, memberLastName].filter(Boolean).join(' ').trim() || 'Membre',
    [memberFirstName, memberLastName],
  );
  const roleLabel = scannedMemberRoleLabel(memberRole);

  const load = useCallback(async () => {
    setInitialLoading(true);
    try {
      void syncExpiredBenefitPendingStates(memberUserId).catch(() => undefined);

      let next: PendingItem[] = [];

      const rpcRows = await Promise.race([
        fetchPartnerPendingValidations(memberUserId, partnerCode, {
          partnerId,
          partnerName,
          establishmentId,
        }),
        new Promise<Awaited<ReturnType<typeof fetchPartnerPendingValidations>>>((resolve) =>
          setTimeout(() => resolve([]), 8000),
        ),
      ]);

      if (rpcRows.length) {
        next = dedupePendingItems(
          rpcRows.map((row) => ({
            redemption: row.redemption,
            benefit: syntheticBenefitFromValidation(row, memberUserId, memberPhone),
          })),
        );
      } else {
        const redemptions = await Promise.race([
          listPendingRedemptionsForMemberAndPartner(memberUserId, partnerId, partnerName, partnerCode),
          new Promise<Awaited<ReturnType<typeof listPendingRedemptionsForMemberAndPartner>>>((resolve) =>
            setTimeout(() => resolve([]), 5000),
          ),
        ]);
        const { fetchRemotePrimeBenefitsForUserPublic } = await import('@/lib/prime-benefits-sync');
        const remoteBenefits = await Promise.race([
          fetchRemotePrimeBenefitsForUserPublic(memberUserId),
          new Promise<PrimeBenefit[]>((resolve) => setTimeout(() => resolve([]), 5000)),
        ]);
        const pendingById = new Map<string, PrimeBenefit>();
        for (const benefit of remoteBenefits) {
          if (benefit.status === 'pending_validation' || benefit.status === 'active') {
            pendingById.set(benefit.id, benefit);
          }
        }

        const usedBenefitIds = new Set(
          remoteBenefits.filter((b) => b.status === 'used').map((b) => b.id),
        );

        next = redemptions
          .filter((redemption) => !usedBenefitIds.has(redemption.benefitId))
          .map((redemption) => {
            let benefit = pendingById.get(redemption.benefitId);
            if (!benefit) {
              // Grant distant absent / RLS : afficher quand même la demande pending
              return {
                redemption,
                benefit: syntheticBenefitFromValidation(
                  {
                    benefitTitle: redemption.contentTitle || 'Privilège',
                    benefitDescription: '',
                    redemption,
                  },
                  memberUserId,
                  memberPhone,
                ),
              };
            }
            if (benefit.status === 'active') {
              benefit = { ...benefit, status: 'pending_validation' };
            }
            return { redemption, benefit };
          })
          .filter(Boolean) as PendingItem[];
      }

      next = dedupePendingItems(next);

      next = next.filter(({ benefit, redemption }) =>
        isPendingRequestForSelectedEstablishment(benefit, redemption, establishmentId),
      );

      if (__DEV__) {
        console.log('[PartnerBenefitConfirm] pending', {
          memberUserId,
          partnerCode,
          establishmentId: establishmentId ?? null,
          count: next.length,
        });
      }

      setItems(next);
      setSelected(new Set(next.map((i) => i.redemption.id)));
    } finally {
      setInitialLoading(false);
    }
  }, [
    memberPhone,
    memberUserId,
    memberRole,
    memberFirstName,
    memberLastName,
    partnerId,
    partnerName,
    partnerCode,
    establishmentId,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCancel() {
    if (!items.length) {
      Alert.alert('Retour', 'Aucune demande en attente.', [{ text: 'OK', onPress: () => navigation.popToTop() }]);
      return;
    }
    setLoading(true);
    try {
      const ids = items.map((i) => i.redemption.id);
      const partnerHint = { partnerId, partnerName, establishmentId };
      const finalizeItems = items.map((item) => ({
        redemptionId: item.redemption.id,
        benefitId: item.benefit.id,
        memberUserId,
      }));
      const cancelled = await applyPartnerBenefitValidationRemote(
        partnerCode,
        ids,
        false,
        partnerHint,
        finalizeItems,
      );
      if (cancelled === 0) {
        await cancelRedemptions(ids);
        await Promise.all(items.map((item) => revertBenefitToActive(item.benefit.id)));
      }

      void Promise.all(
        items.map((item) =>
          sendPartnerBenefitCancelledNotification({
            memberUserId,
            benefitTitle: item.benefit.title,
            partnerName,
            displayContext:
              item.benefit.contentTitle?.trim() ??
              establishmentTitle?.trim() ??
              partnerName,
          }),
        ),
      ).catch(() => undefined);

      Alert.alert(
        'Annulé',
        `${items.length} demande(s) annulée(s). Le membre peut réutiliser ${items.length > 1 ? 'ses privilèges' : 'son privilège'}.`,
        [{ text: 'OK', onPress: () => navigation.popToTop() }],
      );
    } catch {
      Alert.alert(
        'Erreur',
        'Impossible d\'annuler la validation. Vérifiez la connexion et réessayez.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDone() {
    navigation.popToTop();
  }

  async function handleValidate() {
    const picked = items.filter((i) => selected.has(i.redemption.id));
    if (!picked.length) {
      Alert.alert('Sélection requise', 'Choisissez au moins un privilège à valider.');
      return;
    }
    setLoading(true);
    try {
      const pickedIds = picked.map((i) => i.redemption.id);
      const finalizeItems = picked.map((item) => ({
        redemptionId: item.redemption.id,
        benefitId: item.benefit.id,
        memberUserId,
      }));
      const partnerHint = { partnerId, partnerName, establishmentId };

      let applied = 0;
      try {
        applied = await applyPartnerBenefitValidationRemote(
          partnerCode,
          pickedIds,
          true,
          partnerHint,
          finalizeItems,
        );
      } catch {
        applied = 0;
      }

      if (applied === 0) {
        Alert.alert(
          'Échec validation',
          'Impossible de confirmer la validation sur le serveur. Réessayez ou vérifiez la connexion.',
        );
        return;
      }

      void validateRedemptions(pickedIds).catch(() => undefined);

      void Promise.all(
        picked.map((item) =>
          sendPartnerBenefitValidatedNotification({
            memberUserId,
            benefitTitle: item.benefit.title,
            partnerName,
            displayContext:
              item.benefit.contentTitle?.trim() ??
              establishmentTitle?.trim() ??
              partnerName,
          }),
        ),
      ).catch(() => undefined);

      const skipped = items.filter((i) => !selected.has(i.redemption.id));
      if (skipped.length) {
        const skippedIds = skipped.map((i) => i.redemption.id);
        void applyPartnerBenefitValidationRemote(
          partnerCode,
          skippedIds,
          false,
          partnerHint,
          skipped.map((item) => ({
            redemptionId: item.redemption.id,
            benefitId: item.benefit.id,
            memberUserId,
          })),
        ).catch(() => undefined);
        void Promise.all(
          skipped.map((item) =>
            sendPartnerBenefitCancelledNotification({
              memberUserId,
              benefitTitle: item.benefit.title,
              partnerName,
              displayContext:
                item.benefit.contentTitle?.trim() ??
                establishmentTitle?.trim() ??
                partnerName,
            }),
          ),
        ).catch(() => undefined);
      }

      Alert.alert(
        'Validé',
        `${applied} privilège(s) validé(s)${skipped.length ? ` · ${skipped.length} autre(s) annulé(s)` : ''}. Le membre a été notifié.`,
        [{ text: 'OK', onPress: () => navigation.popToTop() }],
      );
    } finally {
      setLoading(false);
    }
  }

  const emptyMessage =
    'Aucune demande en attente pour ce membre. Les privilèges déjà validés ne réapparaissent pas ici — le membre doit retaper « Utiliser chez le partenaire » sur un privilège encore actif.';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: shell.pageBg }} contentContainerStyle={styles.container}>
      <Text style={[styles.kicker, { color: shell.pageKicker }]}>Partenaire</Text>
      <Text style={[styles.title, { color: shell.pageTitle }]}>{partnerName}</Text>
      <Text style={[styles.code, { color: '#10b981' }]}>{partnerCode}</Text>

      {establishmentTitle && establishmentType ? (
        <View style={[styles.card, { borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)' }]}>
          <Text style={[styles.section, { color: shell.pageKicker }]}>Établissement concerné</Text>
          <Text style={[styles.memberName, { color: shell.pageTitle }]}>{establishmentTitle}</Text>
          <Text style={[styles.meta, { color: shell.pageKicker }]}>{establishmentTypeLabel(establishmentType)}</Text>
        </View>
      ) : null}

      <View style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}>
        <Text style={[styles.section, { color: shell.pageKicker }]}>Membre scanné</Text>
        <Text style={[styles.memberName, { color: shell.pageTitle }]}>{memberName}</Text>
        <View style={[styles.rolePill, { borderColor: shell.tabIndicator, backgroundColor: shell.filterInactiveBg }]}>
          <Text style={[styles.rolePillText, { color: shell.tabIndicator }]}>{roleLabel}</Text>
        </View>
        {memberPhone ? <Text style={[styles.meta, { color: shell.pageKicker }]}>{memberPhone}</Text> : null}
        <Text style={[styles.verifiedBadge, { color: '#10b981' }]}>✓ Compte THE LOOP actif</Text>
      </View>

      <Text style={[styles.section, { color: shell.pageKicker, marginTop: 16 }]}>
        Demandes en attente{establishmentTitle ? ` · ${establishmentTitle}` : ''}
      </Text>
      {initialLoading ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Chargement des demandes…</Text>
      ) : items.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>{emptyMessage}</Text>
      ) : (
        items.map(({ redemption, benefit }) => {
          const checked = selected.has(redemption.id);
          const roleBadge = getRoleEntitlementBadge(benefit);
          return (
            <Pressable
              key={redemption.id}
              style={[
                styles.benefitRow,
                {
                  borderColor: checked ? '#10b981' : shell.filterInactiveBorder,
                  backgroundColor: shell.filterInactiveBg,
                },
              ]}
              onPress={() => toggle(redemption.id)}
            >
              <Text style={{ fontSize: 18 }}>{checked ? '☑' : '☐'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.benefitTitle, { color: shell.pageTitle }]}>{benefit.title}</Text>
                {roleBadge ? (
                  <View style={[styles.sourcePill, { borderColor: '#10b981' }]}>
                    <Text style={[styles.sourcePillText, { color: '#10b981' }]}>{roleBadge}</Text>
                  </View>
                ) : null}
                <Text style={[styles.meta, { color: shell.pageKicker }]}>{benefit.description}</Text>
                <Text style={[styles.meta, { color: '#10b981', marginTop: 4 }]}>
                  Demande initiée par le membre · {establishmentTitle ?? benefit.contentTitle ?? partnerName}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}

      <View style={styles.actions}>
        {items.length > 0 ? (
          <>
            <Pressable
              style={[styles.btnOutline, { borderColor: shell.filterInactiveBorder, opacity: loading ? 0.6 : 1 }]}
              onPress={() => void handleCancel()}
              disabled={loading}
            >
              <Text style={[styles.btnOutlineText, { color: shell.pageTitle }]}>Annuler</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, { opacity: loading ? 0.6 : 1 }]}
              onPress={() => void handleValidate()}
              disabled={loading}
            >
              <Text style={styles.btnText}>{loading ? 'Traitement…' : 'Valider'}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.btn, styles.btnFull, { opacity: loading ? 0.6 : 1 }]}
            onPress={() => void handleDone()}
            disabled={loading || initialLoading}
          >
            <Text style={styles.btnText}>
              {initialLoading ? 'Chargement…' : 'Membre identifié — Terminer'}
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  kicker: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { marginTop: 4, fontSize: 22, fontWeight: '800' },
  code: { marginTop: 4, fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  card: { marginTop: 16, borderWidth: 1, borderRadius: 14, padding: 14 },
  section: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  memberName: { marginTop: 6, fontSize: 18, fontWeight: '800' },
  rolePill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  rolePillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  meta: { marginTop: 4, fontSize: 13 },
  empty: { fontSize: 13, fontStyle: 'italic', marginTop: 8, lineHeight: 18 },
  verifiedBadge: { marginTop: 10, fontSize: 12, fontWeight: '700' },
  benefitRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  benefitTitle: { fontSize: 15, fontWeight: '700' },
  sourcePill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    marginBottom: 2,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sourcePillText: { fontSize: 10, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 24, alignItems: 'stretch' },
  btnOutline: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnOutlineText: { fontWeight: '700', fontSize: 15 },
  btn: {
    flex: 1,
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  btnFull: { flex: undefined, alignSelf: 'stretch', width: '100%' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
