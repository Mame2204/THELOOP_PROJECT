import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuthContext } from '@/context/AuthContext';
import { useAdminCountry } from '@/context/AdminCountryContext';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { useAdminModuleAccess } from '@/hooks/useAdminModuleAccess';
import { useFocusLoad } from '@/hooks/useFocusLoad';
import { AdminPageHeader, ADMIN_THEME } from '@/components/admin/AdminShell';
import { AdminListPager, ADMIN_LIST_PAGE_SIZE } from '@/components/admin/AdminListPager';
import { AdminCountryBar } from '@/components/admin/AdminCountryBar';
import {
  BENEFIT_KIND_LABELS,
  filterTheLoopOfferedBenefits,
  listBenefitCatalog,
  loadPublishedContentIndexFromSnapshot,
  peekBenefitCatalog,
  type BenefitCatalogItem,
} from '@/lib/benefit-catalog-store';
import { formatOfferingScopeLabel } from '@/lib/partner-content-options';
import { formatDateDdMmYyyy, formatValidityEndFromDays } from '@/lib/date-utils';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'AdminLoopBenefits'>;
type StatusFilter = 'active' | 'all';

export function AdminLoopBenefitsScreen({ navigation }: Props) {
  const { role } = useAuthContext();
  const { countryCode, countryLabel } = useAdminCountry();
  const { shell } = useMemberTheme();
  const { allowed, isLoading } = useAdminModuleAccess('prime_benefits');

  const [items, setItems] = useState<BenefitCatalogItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [refreshing, setRefreshing] = useState(false);
  const [detailItem, setDetailItem] = useState<BenefitCatalogItem | null>(null);
  const [page, setPage] = useState(0);

  const refresh = useCallback(async () => {
    const [fresh, publishedIndex] = await Promise.all([
      listBenefitCatalog(),
      loadPublishedContentIndexFromSnapshot(countryCode),
    ]);
    setItems(
      filterTheLoopOfferedBenefits(fresh, countryCode, statusFilter === 'active', publishedIndex),
    );
  }, [countryCode, statusFilter]);

  const { run } = useFocusLoad(
    async (force) => {
      if (role !== 'ADMIN' || !allowed) return;
      const cached = await peekBenefitCatalog();
      if (cached.length > 0) {
        const publishedIndex = await loadPublishedContentIndexFromSnapshot(countryCode);
        setItems(
          filterTheLoopOfferedBenefits(cached, countryCode, statusFilter === 'active', publishedIndex),
        );
      }
      if (force || cached.length === 0) {
        await refresh();
      }
    },
    {
      ttlMs: 90_000,
      enabled: role === 'ADMIN' && allowed,
      resetKey: `${countryCode}:${statusFilter}`,
    },
  );

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [items],
  );

  const pagedItems = useMemo(() => {
    const start = page * ADMIN_LIST_PAGE_SIZE;
    return sortedItems.slice(start, start + ADMIN_LIST_PAGE_SIZE);
  }, [sortedItems, page]);

  useEffect(() => {
    setPage(0);
  }, [statusFilter, countryCode]);

  if (role !== 'ADMIN' || isLoading) {
    if (role !== 'ADMIN') {
      return (
        <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
          <Text style={[styles.deniedTitle, { color: shell.pageTitle }]}>Privilèges offerts</Text>
          <Text style={[styles.deniedBody, { color: shell.pageKicker }]}>Espace réservé à l'équipe THE LOOP.</Text>
        </View>
      );
    }
    return null;
  }

  if (!allowed) {
    return (
      <View style={[styles.denied, { backgroundColor: shell.pageBg }]}>
        <Text style={[styles.deniedTitle, { color: shell.pageTitle }]}>Accès refusé</Text>
        <Text style={[styles.deniedBody, { color: shell.pageKicker }]}>Permission « Privilèges THE LOOP » requise.</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
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
          title="Privilèges offerts"
          subtitle={`Catalogue THE LOOP · ${countryLabel}`}
          shell={shell}
          onBack={() => navigation.goBack()}
        />
        <AdminCountryBar shell={shell} compact />

        <Text style={[styles.hint, { color: shell.pageKicker }]}>
          Privilèges du catalogue liés à THE LOOP (partenaire + lieu de validité). Les modèles Paramètres sans association n'apparaissent pas ici.
        </Text>

        <View style={styles.chips}>
          {([
            { id: 'active' as const, label: 'Actifs' },
            { id: 'all' as const, label: 'Tous' },
          ]).map((f) => (
            <Pressable
              key={f.id}
              style={[
                styles.chip,
                { borderColor: shell.filterInactiveBorder },
                statusFilter === f.id && { backgroundColor: ADMIN_THEME.accent, borderColor: ADMIN_THEME.accent },
              ]}
              onPress={() => {
                setStatusFilter(f.id);
                setPage(0);
                void (async () => {
                  const publishedIndex = await loadPublishedContentIndexFromSnapshot(countryCode);
                  const cached = await peekBenefitCatalog();
                  setItems(
                    filterTheLoopOfferedBenefits(cached, countryCode, f.id === 'active', publishedIndex),
                  );
                  const fresh = await listBenefitCatalog();
                  setItems(
                    filterTheLoopOfferedBenefits(fresh, countryCode, f.id === 'active', publishedIndex),
                  );
                })();
              }}
            >
              <Text style={{ color: statusFilter === f.id ? '#fff' : shell.pageTitle, fontSize: 10, fontWeight: '700' }}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {sortedItems.length === 0 ? (
          <Text style={[styles.empty, { color: shell.pageKicker }]}>
            {statusFilter === 'active'
              ? 'Aucun privilège THE LOOP actif pour ce pays.'
              : 'Aucun privilège THE LOOP enregistré pour ce pays.'}
          </Text>
        ) : (
          pagedItems.map((item) => (
            <Pressable
              key={item.id}
              style={[styles.card, { borderColor: shell.filterInactiveBorder, backgroundColor: shell.filterInactiveBg }]}
              onPress={() => setDetailItem(item)}
            >
              <Text style={[styles.title, { color: shell.pageTitle }]}>{item.title}</Text>
              <Text style={[styles.meta, { color: shell.pageKicker }]} numberOfLines={2}>
                {item.description}
              </Text>
              {(item.offeringPartners ?? []).map((p) => (
                <Text key={`${p.partnerId}-${p.contentId ?? 'wide'}`} style={[styles.meta, { color: shell.pageKicker }]}>
                  {p.displayName} · {formatOfferingScopeLabel(p.contentType, p.contentTitle)}
                </Text>
              ))}
              <Text style={[styles.badge, { color: item.isActive ? '#34d399' : '#94a3b8' }]}>
                {item.isActive ? 'Actif' : 'Inactif'}
              </Text>
              <Text style={[styles.meta, { color: shell.pageKicker }]}>
                {BENEFIT_KIND_LABELS[item.benefitKind]}
                {item.defaultValidityDays
                  ? ` · jusqu’au ${formatValidityEndFromDays(item.defaultValidityDays)}`
                  : ''}
                {item.city ? ` · ${item.city}` : ''}
              </Text>
            </Pressable>
          ))
        )}
        <AdminListPager
          page={page}
          total={sortedItems.length}
          pageSize={ADMIN_LIST_PAGE_SIZE}
          onPageChange={setPage}
          shell={shell}
          label="privilèges"
        />
      </ScrollView>

      <Modal visible={Boolean(detailItem)} transparent animationType="fade" onRequestClose={() => setDetailItem(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setDetailItem(null)}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: shell.pageBg, borderColor: shell.filterInactiveBorder }]}
            onPress={() => {}}
          >
            {detailItem ? (
              <>
                <Text style={[styles.modalTitle, { color: shell.pageTitle }]}>{detailItem.title}</Text>
                <Text style={[styles.meta, { color: shell.pageKicker, marginTop: 8 }]}>{detailItem.description}</Text>
                <Text style={[styles.meta, { color: shell.pageKicker, marginTop: 8 }]}>
                  Statut : {detailItem.isActive ? 'Actif' : 'Inactif'}
                </Text>
                <Text style={[styles.meta, { color: shell.pageKicker }]}>
                  Type : {BENEFIT_KIND_LABELS[detailItem.benefitKind]}
                </Text>
                <Text style={[styles.meta, { color: shell.pageKicker }]}>
                  Validité : jusqu’au {formatValidityEndFromDays(detailItem.defaultValidityDays)} (
                  {detailItem.defaultValidityDays} j.)
                  {detailItem.validityStartsOnActivation !== false
                    ? ' à partir de la consommation'
                    : " dès l'octroi"}
                </Text>
                {detailItem.validityEndsAt ? (
                  <Text style={[styles.meta, { color: shell.pageKicker }]}>
                    Fin catalogue : {formatDateDdMmYyyy(detailItem.validityEndsAt)}
                  </Text>
                ) : null}
                <Text style={[styles.section, { color: shell.pageKicker }]}>Associations</Text>
                {(detailItem.offeringPartners ?? []).map((p) => (
                  <Text key={`${p.partnerId}-${p.contentId ?? 'wide'}`} style={[styles.meta, { color: shell.pageTitle }]}>
                    · {p.displayName} — {formatOfferingScopeLabel(p.contentType, p.contentTitle)}
                  </Text>
                ))}
                <Pressable style={styles.modalClose} onPress={() => setDetailItem(null)}>
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
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  deniedTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  deniedBody: { fontSize: 13, textAlign: 'center' },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  empty: { fontStyle: 'italic', fontSize: 13, marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  badge: { fontSize: 11, fontWeight: '800', marginTop: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { borderWidth: 1, borderRadius: 16, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  section: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 14, marginBottom: 4 },
  modalClose: { marginTop: 20, alignItems: 'center' },
});
