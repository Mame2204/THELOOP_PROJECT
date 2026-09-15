import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminCountry } from '../context/AdminCountryContext';
import { usePermissions } from '../context/PermissionsContext';
import { isSuperAdminUser } from '../lib/permissions';
import { loadInsights, type InsightsBundle, type InsightRow } from '../lib/insights';

type Tab = 'overview' | 'events' | 'spots' | 'tools' | 'benefits' | 'platform';

export function InsightsPage() {
  const { profile } = useAuth();
  const { countryCode, countryLabel } = useAdminCountry();
  const { canSub } = usePermissions();
  const [params, setParams] = useSearchParams();
  const isSuper = isSuperAdminUser(profile?.role);

  const canOverview = canSub('insights', 'insights_overview');
  const canEvents = canSub('insights', 'insights_events');
  const canSpots = canSub('insights', 'insights_spots');
  const canTools = canSub('insights', 'insights_tools');
  const canBenefits = canSub('insights', 'insights_benefits');
  const canPlatform = canSub('insights', 'insights_platform') && isSuper;

  const defaultTab: Tab = canOverview
    ? 'overview'
    : canEvents
      ? 'events'
      : canSpots
        ? 'spots'
        : canTools
          ? 'tools'
          : canBenefits
            ? 'benefits'
            : 'platform';

  const tabParam = params.get('tab');
  const tab: Tab =
    tabParam === 'overview' ||
    tabParam === 'events' ||
    tabParam === 'spots' ||
    tabParam === 'tools' ||
    tabParam === 'benefits' ||
    tabParam === 'platform'
      ? tabParam
      : defaultTab;

  function setTab(next: Tab) {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', next);
      return p;
    });
  }

  const [data, setData] = useState<InsightsBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await loadInsights(countryCode));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible');
    }
  }, [countryCode]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Analytics</p>
          <h2>Insights</h2>
          <p className="meta">Engagement catalogue et privilèges — pays : {countryLabel}.</p>
        </div>
        <button type="button" className="btn ghost small" onClick={() => void load()}>
          Actualiser
        </button>
      </header>

      <nav className="tabs">
        {canOverview ? (
          <button
            type="button"
            className={`tab ${tab === 'overview' ? 'active' : ''}`}
            onClick={() => setTab('overview')}
          >
            Vue d’ensemble
          </button>
        ) : null}
        {canEvents ? (
          <button
            type="button"
            className={`tab ${tab === 'events' ? 'active' : ''}`}
            onClick={() => setTab('events')}
          >
            Événements
          </button>
        ) : null}
        {canSpots ? (
          <button
            type="button"
            className={`tab ${tab === 'spots' ? 'active' : ''}`}
            onClick={() => setTab('spots')}
          >
            Spots
          </button>
        ) : null}
        {canTools ? (
          <button
            type="button"
            className={`tab ${tab === 'tools' ? 'active' : ''}`}
            onClick={() => setTab('tools')}
          >
            Outils
          </button>
        ) : null}
        {canBenefits ? (
          <button
            type="button"
            className={`tab ${tab === 'benefits' ? 'active' : ''}`}
            onClick={() => setTab('benefits')}
          >
            Privilèges
          </button>
        ) : null}
        {canPlatform ? (
          <button
            type="button"
            className={`tab ${tab === 'platform' ? 'active' : ''}`}
            onClick={() => setTab('platform')}
          >
            Plateforme
          </button>
        ) : null}
      </nav>

      {error ? <p className="error-text">{error}</p> : null}
      {!data ? <p className="muted">Chargement…</p> : null}

      {data && tab === 'overview' && canOverview ? (
        <>
          <div className="kpi-grid">
            <Kpi label="Événements publiés" value={data.counts.events} />
            <Kpi label="Spots publiés" value={data.counts.spots} />
            <Kpi label="Outils publiés" value={data.counts.tools} />
            <Kpi label="Octrois" value={data.benefitKpis.granted} />
            <Kpi label="Actifs" value={data.benefitKpis.active} />
            <Kpi label="Consommés" value={data.benefitKpis.consumed} />
          </div>
          <div className="split-pane" style={{ marginTop: 16 }}>
            <TopCard title="Top events (clics)" rows={data.eventsByClicks} />
            <TopCard title="Top spots (clics)" rows={data.spotsByClicks} />
          </div>
        </>
      ) : null}

      {data && tab === 'events' && canEvents ? (
        <TopCard title="Événements — clics" rows={data.eventsByClicks} />
      ) : null}
      {data && tab === 'spots' && canSpots ? (
        <TopCard title="Spots — clics" rows={data.spotsByClicks} />
      ) : null}
      {data && tab === 'tools' && canTools ? (
        <TopCard title="Outils — clics" rows={data.toolsByClicks} />
      ) : null}

      {data && tab === 'benefits' && canBenefits ? (
        <>
          <div className="kpi-grid">
            <Kpi label="Octroyés" value={data.benefitKpis.granted} />
            <Kpi label="Actifs" value={data.benefitKpis.active} />
            <Kpi label="Expirés" value={data.benefitKpis.expired} />
            <Kpi label="Utilisés" value={data.benefitKpis.consumed} />
          </div>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Catalogue</th>
                  <th>Octroyés</th>
                  <th>Utilisés</th>
                  <th>En cours</th>
                </tr>
              </thead>
              <tbody>
                {data.catalogStats.map((s) => (
                  <tr key={s.catalogId}>
                    <td>
                      <strong>{s.title}</strong>
                    </td>
                    <td>{s.granted}</td>
                    <td>{s.used}</td>
                    <td>{s.unusedAssigned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.catalogStats.length === 0 ? (
              <p className="muted" style={{ padding: 16 }}>
                Pas encore de stats catalogue.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {data && tab === 'platform' && canPlatform ? (
        <div className="card">
          <h3>Plateforme</h3>
          <p className="meta">
            Métriques Accueil avancées (Singulier, Fragment, sondages) restent détaillées sur mobile.
            Ici : synthèse catalogue + privilèges ci-dessus.
          </p>
          <div className="kpi-grid" style={{ marginTop: 12 }}>
            <Kpi label="Catalogue total" value={data.counts.events + data.counts.spots + data.counts.tools} />
            <Kpi label="Octrois" value={data.benefitKpis.granted} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="card kpi-card">
      <div className="meta">{label}</div>
      <strong>{value}</strong>
    </div>
  );
}

function TopCard({ title, rows }: { title: string; rows: InsightRow[] }) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">Aucune donnée.</p>
      ) : (
        <ol className="top-list">
          {rows.map((r) => (
            <li key={r.id}>
              <span>
                {r.title}
                {r.subtitle ? <span className="meta"> · {r.subtitle}</span> : null}
              </span>
              <strong>{r.metric}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
