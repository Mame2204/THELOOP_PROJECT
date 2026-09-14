import { useMemo, useState } from 'react';
import { PublicHeader } from '@/components/public/PublicHeader';
import { FilterPills } from '@/components/public/FilterPills';
import { useAuth } from '@/hooks/useAuth';
import { usePartnerData } from '@/hooks/usePartnerData';
import { getPartnerStats } from '@/lib/partner-analytics';

type StatsFilter = 'all' | 'events' | 'locations';

const STATS_FILTERS: { value: StatsFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'events', label: 'Événements' },
  { value: 'locations', label: 'Adresses' },
];

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-loop-black">{value}</p>
    </article>
  );
}

export function PartnerStatsPage() {
  const { user } = useAuth();
  const { workspace } = usePartnerData();
  const [filter, setFilter] = useState<StatsFilter>('all');

  const stats = useMemo(
    () =>
      getPartnerStats(
        user?.id ?? 'partner-demo',
        user?.company ?? user?.fullName ?? 'Partenaire',
        workspace.events.map((e) => ({ title: e.title })),
        workspace.addresses.map((a) => ({ name: a.name })),
      ),
    [user, workspace.events, workspace.addresses],
  );

  const rows = stats.rows.filter(
    (row) => filter === 'all' || (filter === 'events' ? row.type === 'event' : row.type === 'location'),
  );

  return (
    <div className="min-h-full pb-4">
      <PublicHeader />
      <div className="px-4 pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-loop-gold">Espace Pro</p>
        <h1 className="mt-1 text-2xl font-bold text-loop-black">Statistiques</h1>
        <p className="mt-1 text-sm text-neutral-600">Tous vos événements et adresses</p>

        <div className="mt-4">
          <FilterPills options={STATS_FILTERS} active={filter} onChange={setFilter} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Vues totales" value={stats.totalViews.toLocaleString('fr-FR')} />
          <StatCard label="Clics actions" value={stats.totalActionClicks.toLocaleString('fr-FR')} />
          <StatCard label="Ajouts favoris" value={String(stats.totalFavorites)} />
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h2 className="text-sm font-bold text-loop-black">Performance par contenu</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Contenu</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Vues</th>
                  <th className="px-4 py-3">Clics</th>
                  <th className="px-4 py-3">Favoris</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-100">
                    <td className="px-4 py-3 font-medium text-loop-black">{row.name}</td>
                    <td className="px-4 py-3 capitalize text-neutral-500">{row.type === 'event' ? 'Événement' : 'Adresse'}</td>
                    <td className="px-4 py-3">{row.views.toLocaleString('fr-FR')}</td>
                    <td className="px-4 py-3 font-semibold">{row.actionClicks.toLocaleString('fr-FR')}</td>
                    <td className="px-4 py-3">{row.favorites}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-neutral-500">Aucune donnée pour ce filtre.</p>
          )}
        </div>
      </div>
    </div>
  );
}