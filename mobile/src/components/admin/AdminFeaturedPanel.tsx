import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { DateTimeField } from '@/components/DateTimeField';
import { TogglePill } from '@/components/admin/TogglePill';
import { AdminTabMenu } from '@/components/admin/AdminTabMenu';
import { adminCardStyle } from '@/components/admin/AdminShell';
import { listFeaturedCandidates, setContentFeatured } from '@/lib/admin-content-store';
import { invalidateContentCache } from '@/lib/content-store';
import { emitHomeRefresh } from '@/lib/home-refresh';
import { useAdminCatalog } from '@/hooks/useAdminCatalog';
import { useMemberTheme } from '@/hooks/useMemberTheme';
import { toolLocationIds, isToolLocation } from '@/lib/location-kind-utils';
import { formatDateFr } from '@/lib/date-utils';
import type { AdminContentItem } from '@/lib/admin-types';

type KindTab = 'all' | 'events' | 'spots' | 'tools';
type ViewTab = 'featured' | 'not_featured' | 'all';

/** Gestion « À la une » — réutilisable Accueil (onglet) et écran dédié. */
export function AdminFeaturedPanel({
  enabled = true,
  compactHeader = false,
}: {
  enabled?: boolean;
  compactHeader?: boolean;
}) {
  const { shell } = useMemberTheme();
  const { publicEvents, primeEvents, getHomeLocations, refresh } = useAdminCatalog();
  const allEvents = useMemo(() => [...publicEvents, ...primeEvents], [publicEvents, primeEvents]);
  // getHomeLocations() inclut déjà spots + outils — ne pas reconcaténer les outils.
  const allLocations = useMemo(() => getHomeLocations(), [getHomeLocations]);
  const [items, setItems] = useState<AdminContentItem[]>([]);
  const [kindTab, setKindTab] = useState<KindTab>('all');
  const [viewTab, setViewTab] = useState<ViewTab>('all');

  const load = useCallback(async () => {
    setItems(await listFeaturedCandidates(allEvents, allLocations));
  }, [allEvents, allLocations]);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const toolIds = useMemo(() => toolLocationIds(allLocations), [allLocations]);
  const verifiedToolIds = useMemo(
    () => new Set(allLocations.filter((l) => isToolLocation(l) && l.isVerified === true).map((l) => l.id)),
    [allLocations],
  );

  const filtered = useMemo(() => {
    return items
      .filter((i) => {
        // Outils non validés : jamais dans la liste À la une
        if (i.kind === 'spot' && toolIds.has(i.id) && !verifiedToolIds.has(i.id)) return false;
        if (kindTab === 'all') return true;
        if (kindTab === 'events') return i.kind === 'event';
        if (kindTab === 'tools') return i.kind === 'spot' && verifiedToolIds.has(i.id);
        return i.kind === 'spot' && !toolIds.has(i.id);
      })
      .filter((i) => {
        if (viewTab === 'featured') return i.isFeatured;
        if (viewTab === 'not_featured') return !i.isFeatured;
        return true;
      });
  }, [items, kindTab, viewTab, toolIds, verifiedToolIds]);

  const featuredCount = items.filter((i) => {
    if (!i.isFeatured) return false;
    if (i.kind === 'spot' && toolIds.has(i.id) && !verifiedToolIds.has(i.id)) return false;
    if (kindTab === 'all') return true;
    if (kindTab === 'events') return i.kind === 'event';
    if (kindTab === 'tools') return i.kind === 'spot' && verifiedToolIds.has(i.id);
    return i.kind === 'spot' && !toolIds.has(i.id);
  }).length;

  async function toggleFeatured(item: AdminContentItem, next: boolean) {
    if (item.kind !== 'event' && item.kind !== 'spot') return;
    const result = await setContentFeatured(item.kind, item.id, next, item.featuredStartDate, item.featuredEndDate);
    if (!result.ok) {
      Alert.alert(
        'À la une',
        result.error ?? 'Impossible de mettre à jour ce contenu. Vérifiez qu\'il est bien publié en base.',
      );
      return;
    }
    invalidateContentCache();
    await refresh();
    await load();
    emitHomeRefresh('featured');
  }

  async function updateFeaturedDates(item: AdminContentItem, start: string, end: string) {
    if (item.kind !== 'event' && item.kind !== 'spot') return;
    const result = await setContentFeatured(item.kind, item.id, item.isFeatured, start || null, end || null);
    if (!result.ok) {
      Alert.alert('À la une', result.error ?? 'Impossible de mettre à jour les dates.');
      return;
    }
    invalidateContentCache();
    await refresh();
    await load();
    emitHomeRefresh('featured');
  }

  return (
    <View>
      {compactHeader ? (
        <Text style={[styles.hint, { color: shell.pageKicker }]}>
        Contenu du carousel Accueil. Événements expirés, spots masqués et outils non validés par THE LOOP sont exclus de la liste.
      </Text>
      ) : null}

      <AdminTabMenu
        tabs={[
          { id: 'all', label: 'Tous' },
          { id: 'events', label: 'Événements' },
          { id: 'spots', label: 'Spots' },
          { id: 'tools', label: 'Outils' },
        ]}
        active={kindTab}
        onChange={setKindTab}
        shell={shell}
      />
      <AdminTabMenu
        tabs={[
          { id: 'all', label: 'Tous' },
          { id: 'featured', label: 'Actif', badge: featuredCount },
          { id: 'not_featured', label: 'Inactif' },
        ]}
        active={viewTab}
        onChange={setViewTab}
        shell={shell}
        accent="#fbbf24"
      />

      {filtered.map((item) => (
        <View key={`${item.kind}-${item.id}`} style={adminCardStyle(shell)}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: shell.pageTitle }]}>{item.title}</Text>
              <Text style={[styles.meta, { color: shell.pageKicker }]}>{item.subtitle}</Text>
            </View>
            <View style={styles.toggleCol}>
              <Text style={[styles.toggleLabel, { color: shell.pageKicker }]}>À la une</Text>
              <TogglePill
                value={item.isFeatured}
                onChange={(next) => void toggleFeatured(item, next)}
                activeLabel="Actif"
                inactiveLabel="Off"
                activeColor="#fbbf24"
                shell={shell}
              />
            </View>
          </View>
          {item.isFeatured ? (
            <View style={styles.dateBlock}>
              <Text style={[styles.dateLabel, { color: shell.pageKicker }]}>Début d'affichage</Text>
              <DateTimeField
                value={item.featuredStartDate ?? ''}
                onChange={(v) => void updateFeaturedDates(item, v, item.featuredEndDate ?? '')}
                placeholder="Immédiat si vide"
                shell={shell}
                dateOnly
              />
              <Text style={[styles.dateLabel, { color: shell.pageKicker }]}>Fin d'affichage</Text>
              <DateTimeField
                value={item.featuredEndDate ?? ''}
                onChange={(v) => void updateFeaturedDates(item, item.featuredStartDate ?? '', v)}
                placeholder="Sans limite si vide"
                shell={shell}
                dateOnly
              />
              {item.featuredStartDate || item.featuredEndDate ? (
                <Text style={[styles.dateHint, { color: shell.pageKicker }]}>
                  {item.featuredStartDate ? `Du ${formatDateFr(item.featuredStartDate)}` : 'Dès activation'}
                  {item.featuredEndDate ? ` au ${formatDateFr(item.featuredEndDate)}` : ''}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}

      {filtered.length === 0 ? (
        <Text style={[styles.empty, { color: shell.pageKicker }]}>Aucun contenu pour ce filtre.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 12, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 15, fontWeight: '700' },
  meta: { marginTop: 2, fontSize: 11 },
  toggleCol: { alignItems: 'flex-end', gap: 4 },
  toggleLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  dateBlock: { marginTop: 12, gap: 4 },
  dateLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', marginTop: 4 },
  dateHint: { fontSize: 10, marginTop: 4, fontStyle: 'italic' },
  empty: { fontSize: 13, fontStyle: 'italic', marginTop: 24, textAlign: 'center' },
});
