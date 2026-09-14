import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getPartnerStats } from '@/lib/partner-analytics';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-loop-black">{value}</p>
    </article>
  );
}

export function PartnerStatsSection() {
  const { user } = useAuth();
  const stats = useMemo(
    () => getPartnerStats(user?.id ?? 'partner-demo', user?.company ?? user?.fullName ?? 'Partenaire'),
    [user],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Vues totales" value={stats.totalViews.toLocaleString('fr-FR')} />
        <StatCard label="Clics actions" value={stats.totalActionClicks.toLocaleString('fr-FR')} />
        <StatCard label="Ajouts favoris" value={String(stats.totalFavorites)} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-4 py-3">
          <h2 className="text-sm font-bold text-loop-black">Performance par contenu</h2>
          <p className="text-xs text-neutral-500">Du plus populaire au moins populaire</p>
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
              {stats.rows.map((row) => (
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
        {stats.rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-neutral-500">Aucune donnée disponible pour le moment.</p>
        )}
      </div>
      <p className="text-center text-[10px] text-neutral-400">Données démo · mises à jour en temps réel</p>
    </div>
  );
}
