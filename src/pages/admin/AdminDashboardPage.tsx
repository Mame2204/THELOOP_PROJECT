import { useMemo, useState } from 'react';
import { EVENT_CATEGORY_LABELS } from '@/types';
import { computeAnalytics, getAnalyticsContent, getAnalyticsPartners } from '@/lib/analytics';
import { useAdminData } from '@/hooks/useAdminData';

function KpiCard({
  label,
  value,
  delta,
  positive,
}: {
  label: string;
  value: string;
  delta: string;
  positive: boolean;
}) {
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-loop-black">{value}</p>
      <p className={`mt-1 text-[11px] font-semibold ${positive ? 'text-green-600' : 'text-red-500'}`}>{delta}</p>
    </article>
  );
}

export function AdminDashboardPage() {
  const { store, pendingApplications, pendingStagingEvents, pendingStagingLocations } = useAdminData();
  const partners = useMemo(() => getAnalyticsPartners(), [store]);
  const contentOptions = useMemo(() => getAnalyticsContent(), [store]);

  const [partnerId, setPartnerId] = useState('all');
  const [contentType, setContentType] = useState<'all' | 'event' | 'location'>('all');
  const [contentId, setContentId] = useState('all');

  const filteredContentOptions = contentOptions.filter((item) => {
    if (contentType !== 'all' && item.type !== contentType) return false;
    if (partnerId !== 'all') {
      const partner = partners.find((p) => p.id === partnerId);
      return item.partnerName === partner?.name;
    }
    return true;
  });

  const analytics = useMemo(
    () => computeAnalytics({ partnerId, contentType, contentId }),
    [partnerId, contentType, contentId, store],
  );

  const maxTrend = Math.max(...analytics.dailyTrend.map((d) => d.visits), 1);

  return (
    <div className="px-4 py-6 lg:px-8">
      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-loop-gold">Analytics</p>
        <h1 className="mt-1 text-2xl font-bold text-loop-black">Dashboard Analytics</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {pendingApplications.length} candidatures · {pendingStagingEvents.length} événements staging · {pendingStagingLocations.length} adresses staging
        </p>
      </header>

      <section className="mb-6 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-bold text-loop-black">Filtres</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select
            value={partnerId}
            onChange={(e) => {
              setPartnerId(e.target.value);
              setContentId('all');
            }}
            className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black"
          >
            <option value="all">Tous les partenaires</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>{partner.name}</option>
            ))}
          </select>
          <select
            value={contentType}
            onChange={(e) => {
              setContentType(e.target.value as 'all' | 'event' | 'location');
              setContentId('all');
            }}
            className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black"
          >
            <option value="all">Événements + Adresses</option>
            <option value="event">Événements uniquement</option>
            <option value="location">Adresses uniquement</option>
          </select>
          <select
            value={contentId}
            onChange={(e) => setContentId(e.target.value)}
            className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-loop-black"
          >
            <option value="all">Tout le contenu filtré</option>
            {filteredContentOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.type === 'event' ? '📅' : '🏛️'} {item.name}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard label="Visites Totales" value={analytics.totalVisits.toLocaleString('fr-FR')} delta={analytics.visitsDelta} positive />
        <KpiCard label="Clics Événements" value={analytics.eventClicks.toLocaleString('fr-FR')} delta={analytics.clicksDelta} positive />
        <KpiCard label="Taux de Clic Global" value={`${analytics.globalCtr}%`} delta={analytics.ctrDelta} positive />
        <KpiCard label="Partenaires Actifs" value={String(analytics.activePartners)} delta={analytics.partnersDelta} positive={analytics.activePartners >= 7} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-loop-black">Tendance hebdomadaire</h2>
          <div className="mt-4 flex h-40 items-end gap-2">
            {analytics.dailyTrend.map((day) => (
              <div key={day.label} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex w-full items-end justify-center gap-0.5">
                  <div className="w-2 rounded-t bg-neutral-200" style={{ height: `${(day.visits / maxTrend) * 100}%` }} title={`Visites ${day.visits}`} />
                  <div className="w-2 rounded-t bg-loop-black" style={{ height: `${(day.clicks / maxTrend) * 100}%` }} title={`Clics ${day.clicks}`} />
                </div>
                <span className="text-[10px] text-neutral-500">{day.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-neutral-400">Gris = visites · Noir = clics</p>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-loop-black">Répartition par catégorie (événements)</h2>
          <div className="mt-4 space-y-3">
            {(Object.entries(analytics.categoryRates) as [keyof typeof analytics.categoryRates, number][]).map(([cat, rate]) => (
              <div key={cat}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-neutral-700">{EVENT_CATEGORY_LABELS[cat]}</span>
                  <span className="font-bold text-loop-black">{rate}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-loop-gold" style={{ width: `${rate}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm xl:col-span-2">
          <div className="border-b border-neutral-200 px-5 py-4">
            <h2 className="text-sm font-bold text-loop-black">Top 5 contenus filtrés</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-5 py-3">Rang</th>
                  <th className="px-5 py-3">Nom</th>
                  <th className="px-5 py-3">Partenaire</th>
                  <th className="px-5 py-3">Clics</th>
                  <th className="px-5 py-3">Conversion</th>
                </tr>
              </thead>
              <tbody>
                {analytics.topPerformers.map((row) => (
                  <tr key={row.id} className="border-t border-neutral-100">
                    <td className="px-5 py-3 font-bold text-loop-gold">#{row.rank}</td>
                    <td className="px-5 py-3 font-medium text-loop-black">{row.name}</td>
                    <td className="px-5 py-3 text-neutral-500">{row.partnerName ?? '—'}</td>
                    <td className="px-5 py-3 font-semibold">{row.clicks.toLocaleString('fr-FR')}</td>
                    <td className="px-5 py-3 font-semibold">{row.conversionRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-loop-black">Part du clic par partenaire</h2>
          <ul className="mt-4 space-y-3">
            {analytics.partnerBreakdown.map((row) => (
              <li key={row.partnerName}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-neutral-700">{row.partnerName}</span>
                  <span className="font-bold">{row.share}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-loop-black" style={{ width: `${row.share}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
