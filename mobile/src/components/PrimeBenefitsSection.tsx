import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { BENEFIT_REDEMPTION_TIMEOUT_MINUTES } from '@/lib/benefit-redemption-store';
import {
  BENEFIT_STATUS_LABELS,
  canRequestBenefitValidation,
  getBenefitCardKey,
  getBenefitExpiryLabel,
  getRoleEntitlementBadge,
  getBenefitUsageLabel,
  isBenefitFullyUsed,
  listUserPrimeBenefits,
  requestBenefitValidation,
  type PrimeBenefit,
} from '@/lib/prime-benefits-store';
import { resolveBenefitDisplayContext } from '@/lib/benefit-display-context';
import type { CountryCode } from '@/lib/countries';
import { listBenefitCatalog } from '@/lib/benefit-catalog-store';
import type { User } from '@/types';
import type { ShellTheme } from '@/lib/member-grade-theme';

interface Props {
  userId: string;
  phone?: string | null;
  email?: string | null;
  user?: User | null;
  shell: ShellTheme;
  showEmpty?: boolean;
  activeAccent?: string;
  filterCountryCode?: CountryCode;
  emptyMessage?: string;
}

export function PrimeBenefitsSection({
  userId,
  phone,
  email,
  user,
  shell,
  showEmpty = true,
  activeAccent,
  emptyMessage,
  filterCountryCode,
}: Props) {
  const [benefits, setBenefits] = useState<{
    active: PrimeBenefit[];
    used: PrimeBenefit[];
    expired_unused: PrimeBenefit[];
  }>({
    active: [],
    used: [],
    expired_unused: [],
  });
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const listedPromise = listUserPrimeBenefits(userId, { phone, email });
      const catalogPromise = filterCountryCode ? listBenefitCatalog(true) : Promise.resolve([]);
      const [listed, catalog] = await Promise.all([listedPromise, catalogPromise]);
      if (filterCountryCode) {
        const map = new Map(catalog.map((c) => [c.id, c]));
        const { filterBenefitsForCountry } = await import('@/lib/staff-benefit-utils');
        setBenefits({
          active: filterBenefitsForCountry(listed.active, map, filterCountryCode),
          used: filterBenefitsForCountry(listed.used, map, filterCountryCode),
          expired_unused: filterBenefitsForCountry(listed.expired_unused, map, filterCountryCode),
        });
      } else {
        setBenefits(listed);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [userId, phone, email, filterCountryCode]);

  useFocusLoad(load, {
    ttlMs: 90_000,
    enabled: Boolean(userId),
    resetKey: `${userId}:${filterCountryCode ?? ''}`,
  });

  const total = benefits.active.length + benefits.used.length + benefits.expired_unused.length;

  const accent = activeAccent ?? shell.tabIndicator;

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: shell.pageKicker }]}>Mes avantages</Text>
      {loading && total === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Chargement des avantages…</Text>
      ) : null}
      {total === 0 && showEmpty && !loading ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>
          {emptyMessage ??
            'Tout compte THE LOOP peut recevoir des avantages. Les offres octroyées par THE LOOP ou ses partenaires apparaîtront ici.'}
        </Text>
      ) : null}
      <BenefitGroup
        title="Actifs"
        items={benefits.active}
        shell={shell}
        accent={accent}
        userId={userId}
        phone={phone}
        email={email}
        onChanged={load}
      />
      <BenefitGroup title="Déjà utilisés" items={benefits.used} shell={shell} accent="#10b981" />
      <BenefitGroup title="Expirés sans utilisation" items={benefits.expired_unused} shell={shell} accent="#94a3b8" />
    </View>
  );
}

function BenefitGroup({
  title,
  items,
  shell,
  accent,
  userId,
  phone,
  email,
  onChanged,
}: {
  title: string;
  items: PrimeBenefit[];
  shell: ShellTheme;
  accent: string;
  userId?: string;
  phone?: string | null;
  email?: string | null;
  onChanged?: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.groupTitle, { color: accent }]}>
        {title} ({items.length})
      </Text>
      {items.map((b) => {
        const roleBadge = getRoleEntitlementBadge(b);
        return (
        <View
          key={getBenefitCardKey(b)}
          style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
        >
          <Text style={[styles.cardTitle, { color: shell.pageTitle }]}>{b.title}</Text>
          {roleBadge ? (
            <View style={[styles.sourceBadge, { borderColor: accent, backgroundColor: `${accent}22` }]}>
              <Text style={{ color: accent, fontSize: 10, fontWeight: '800' }}>{roleBadge}</Text>
            </View>
          ) : null}
          <BenefitContextMeta benefit={b} shell={shell} />
          <Text style={[styles.cardBody, { color: shell.pageTitle }]}>{b.description}</Text>
          <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>
            {BENEFIT_STATUS_LABELS[b.status]} · {getBenefitUsageLabel(b)} · {getBenefitExpiryLabel(b)}
          </Text>
          {b.status === 'pending_validation' && userId && onChanged ? (
            <Pressable
              style={[styles.useBtn, { borderColor: '#94a3b8' }]}
              onPress={() => {
                Alert.alert(
                  'Renvoyer la demande',
                  `Si le partenaire ne voit rien, renvoyez vers le serveur (valable ${BENEFIT_REDEMPTION_TIMEOUT_MINUTES} min).`,
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Renvoyer',
                      onPress: () => {
                        void requestBenefitValidation(b.id, userId, { phone, email }).then((res) => {
                          void onChanged();
                          if (res.ok) {
                            Alert.alert(
                              'QR activé',
                              `Présentez votre QR au partenaire sous ${BENEFIT_REDEMPTION_TIMEOUT_MINUTES} minutes.`,
                            );
                            return;
                          }
                          if (res.reason === 'remote_sync_failed') {
                            Alert.alert(
                              'Hors ligne',
                              'La demande reste locale. Vérifiez la connexion puis renvoyez.',
                            );
                            return;
                          }
                          Alert.alert('Indisponible', 'Impossible de renvoyer la demande.');
                        });
                      },
                    },
                  ],
                );
              }}
            >
              <Text style={{ color: '#64748b', fontWeight: '700', fontSize: 12 }}>
                En attente · Renvoyer ({BENEFIT_REDEMPTION_TIMEOUT_MINUTES} min)
              </Text>
            </Pressable>
          ) : null}
          {b.status === 'active' && userId && onChanged && canRequestBenefitValidation(b) && !isBenefitFullyUsed(b) ? (
            <Pressable
              style={[styles.useBtn, { borderColor: accent }]}
              onPress={() => {
                Alert.alert(
                  'Utiliser cet avantage',
                  `Présentez votre QR code au partenaire sous ${BENEFIT_REDEMPTION_TIMEOUT_MINUTES} minutes. Passé ce délai, l'avantage redevient utilisable chez le partenaire.`,
                  [
                    { text: 'Annuler', style: 'cancel' },
                    {
                      text: 'Confirmer',
                      onPress: () => {
                        void requestBenefitValidation(b.id, userId, { phone, email }).then((res) => {
                          if (res.ok) {
                            void onChanged();
                            Alert.alert(
                              'QR activé',
                              `Présentez votre QR au partenaire sous ${BENEFIT_REDEMPTION_TIMEOUT_MINUTES} minutes. Vous serez notifié à la validation.`,
                            );
                            return;
                          }
                          if (res.reason === 'remote_sync_failed') {
                            void onChanged();
                            Alert.alert(
                              'Demande enregistrée hors ligne',
                              'La demande est active ici, mais le partenaire peut ne pas la voir. Vérifiez la connexion.',
                            );
                            return;
                          }
                          if (res.reason === 'no_partner') {
                            Alert.alert('Partenaire manquant', 'Cet avantage n\'est pas rattaché à un partenaire.');
                          } else {
                            Alert.alert('Indisponible', 'Impossible de demander la validation pour cet avantage.');
                          }
                        });
                      },
                    },
                  ],
                );
              }}
            >
              <Text style={{ color: accent, fontWeight: '700', fontSize: 12 }}>Utiliser chez le partenaire</Text>
            </Pressable>
          ) : null}
          {b.status === 'used' || isBenefitFullyUsed(b) ? (
            <View style={[styles.pendingBtn, { borderColor: '#b45309', backgroundColor: 'rgba(180,83,9,0.12)' }]}>
              <Text style={{ color: '#b45309', fontWeight: '700', fontSize: 12 }}>
                Quota atteint · {getBenefitUsageLabel(b)}
              </Text>
            </View>
          ) : null}
        </View>
        );
      })}
    </View>
  );
}

function BenefitContextMeta({ benefit, shell }: { benefit: PrimeBenefit; shell: ShellTheme }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolveBenefitDisplayContext(benefit).then((resolved) => {
      if (!cancelled) setLabel(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [benefit.id, benefit.contentId, benefit.contentType, benefit.contentTitle, benefit.partnerName]);

  if (!label) return null;
  return <Text style={[styles.cardMeta, { color: shell.pageKicker }]}>{label}</Text>;
}

const styles = StyleSheet.create({
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
  empty: { fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginBottom: 8 },
  groupTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  roleBadge: { alignSelf: 'flex-start', marginTop: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  sourceBadge: { alignSelf: 'flex-start', marginTop: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  cardBody: { marginTop: 6, fontSize: 13, lineHeight: 18 },
  cardMeta: { marginTop: 4, fontSize: 11 },
  useBtn: { marginTop: 10, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  pendingBtn: { marginTop: 10, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
});
