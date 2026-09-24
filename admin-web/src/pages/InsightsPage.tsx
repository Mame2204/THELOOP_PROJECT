import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ListPager } from '../components/ListPager';
import { useAuth } from '../context/AuthContext';
import { useAdminCountry } from '../context/AdminCountryContext';
import { usePermissions } from '../context/PermissionsContext';
import { isSuperAdminUser } from '../lib/permissions';
import {
  loadInsights,
  pickTopPerfRows,
  type ContentTypeUsageRow,
  type InsightsBundle,
  type PlatformCornerRow,
  type PlatformPollRow,
  type WalkInsightRow,
} from '../lib/insights';
import { LOOP_PERF_PAGE_SIZE, type LoopPerfMetricTab } from '../lib/loop-perf-sort';
import type { TeamLoopPerfRow } from '../lib/team-loop-performance';

type Tab = 'overview' | 'events' | 'spots' | 'tools' | 'benefits' | 'platform';
type EventMetricTab = 'all' | 'favorites' | 'clicks';
type SpotMetricTab = 'all' | 'favorites' | 'clicks' | 'stars' | 'ratings';
type PlatformMetricTab = 'all' | 'corner' | 'polls' | 'walks';

const INSIGHTS_PAGE_SIZE = LOOP_PERF_PAGE_SIZE;
const ACCUEIL_INSIGHTS_TOP = 5;

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
    setEventMetric('all');
    setSpotMetric('all');
    setPlatformMetric('all');
    setListPage(0);
    setBenefitsPage(0);
  }

  const [data, setData] = useState<InsightsBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eventMetric, setEventMetric] = useState<EventMetricTab>('all');
  const [spotMetric, setSpotMetric] = useState<SpotMetricTab>('all');
  const [toolMetric, setToolMetric] = useState<SpotMetricTab>('all');
  const [platformMetric, setPlatformMetric] = useState<PlatformMetricTab>('all');
  const [listPage, setListPage] = useState(0);
  const [benefitsPage, setBenefitsPage] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const bundle = await loadInsights(countryCode, { includePlatform: isSuper });
      setData(bundle);
      if (bundle.error) setError(bundle.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chargement impossible');
    }
  }, [countryCode, isSuper]);

  useEffect(() => {
    void load();
  }, [load]);

  const weights = data?.perf.weights;

  const eventList = useMemo(() => {
    if (!data || !weights) return [];
    const m: LoopPerfMetricTab =
      eventMetric === 'favorites' ? 'favorites' : eventMetric === 'clicks' ? 'clicks' : 'all';
    return pickTopPerfRows(data.perf.events, m, weights, 500);
  }, [data, eventMetric, weights]);

  const spotList = useMemo(() => {
    if (!data || !weights) return [];
    const m: LoopPerfMetricTab =
      spotMetric === 'favorites'
        ? 'favorites'
        : spotMetric === 'clicks'
          ? 'clicks'
          : spotMetric === 'stars'
            ? 'stars'
            : spotMetric === 'ratings'
              ? 'ratings'
              : 'all';
    return pickTopPerfRows(data.perf.spots, m, weights, 500);
  }, [data, spotMetric, weights]);

  const toolList = useMemo(() => {
    if (!data || !weights) return [];
    const m: LoopPerfMetricTab =
      toolMetric === 'favorites'
        ? 'favorites'
        : toolMetric === 'clicks'
          ? 'clicks'
          : toolMetric === 'stars'
            ? 'stars'
            : toolMetric === 'ratings'
              ? 'ratings'
              : 'all';
    return pickTopPerfRows(data.perf.tools, m, weights, 500);
  }, [data, toolMetric, weights]);

  const pagedEventList = eventList.slice(listPage * INSIGHTS_PAGE_SIZE, (listPage + 1) * INSIGHTS_PAGE_SIZE);
  const pagedSpotList = spotList.slice(listPage * INSIGHTS_PAGE_SIZE, (listPage + 1) * INSIGHTS_PAGE_SIZE);
  const pagedToolList = toolList.slice(listPage * INSIGHTS_PAGE_SIZE, (listPage + 1) * INSIGHTS_PAGE_SIZE);

  const catalogStatsPaged = useMemo(() => {
    if (!data) return [];
    const start = benefitsPage * INSIGHTS_PAGE_SIZE;
    return data.catalogStats.slice(start, start + INSIGHTS_PAGE_SIZE);
  }, [data, benefitsPage]);

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
            Accueil
          </button>
        ) : null}
      </nav>

      {error ? <p className="error-text">{error}</p> : null}
      {!data ? <p className="muted">Chargement…</p> : null}

      {data ? (
        <div className="kpi-grid" style={{ marginBottom: 16 }}>
          {tab === 'overview' ? (
            <>
              <Kpi label="Événements publiés" value={data.counts.events} />
              <Kpi label="Spots publiés" value={data.counts.spots} />
              <Kpi label="Outils publiés" value={data.counts.tools} />
              <Kpi label="Parcours publiés" value={data.counts.walks} />
            </>
          ) : null}
          {tab === 'events' ? <Kpi label="Événements publiés" value={data.counts.events} /> : null}
          {tab === 'spots' ? <Kpi label="Spots publiés" value={data.counts.spots} /> : null}
          {tab === 'tools' ? <Kpi label="Outils publiés" value={data.counts.tools} /> : null}
          {tab === 'platform' ? (
            <>
              <Kpi label="Parcours publiés" value={data.counts.walks} />
              <Kpi label="Fiches Singulier" value={data.platform.corners.length} hint="Top 5 par clics ci-dessous" />
              <Kpi label="Fragments" value={data.platform.chroniques.length} hint="Top 5 par clics ci-dessous" />
              <Kpi label="Sondages" value={data.platform.polls.length} hint="Top 5 récents ci-dessous" />
            </>
          ) : null}
          {tab === 'benefits' ? (
            <>
              <Kpi
                label="Modèles actifs"
                value={data.validatedCatalogActive}
                hint="Catalogue actif, partenaire et lieu associés"
              />
              <Kpi label="Octrois membres" value={data.benefitKpis.granted} hint="Hors droits par rôle" />
              <Kpi label="Consommés" value={data.benefitKpis.consumed} />
              <Kpi label="En cours" value={data.benefitKpis.active} />
              <Kpi label="Expirés" value={data.benefitKpis.expired} />
            </>
          ) : null}
        </div>
      ) : null}

      {data && tab === 'overview' && canOverview ? (
        <>
          <EngagementByType rows={data.contentTypeUsage} />
          {canBenefits ? (
            <div className="card" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>Octrois membres</h3>
              <p className="meta" style={{ marginTop: 0 }}>
                Comptage aligné sur la consommation réelle (date d&apos;utilisation), hors avantages automatiques
                par rôle.
              </p>
              <div className="kpi-grid">
                <Kpi label="Octrois" value={data.benefitKpis.granted} />
                <Kpi label="En cours" value={data.benefitKpis.active} />
                <Kpi label="Consommés" value={data.benefitKpis.consumed} />
                <Kpi label="Expirés" value={data.benefitKpis.expired} />
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {data && tab === 'events' && canEvents && weights ? (
        <>
          <MetricTabs
            tabs={
              [
                ['all', 'Tous'],
                ['favorites', 'Favoris'],
                ['clicks', 'Clics'],
              ] as const
            }
            active={eventMetric}
            onChange={(m) => {
              setEventMetric(m);
              setListPage(0);
            }}
          />
          <p className="meta" style={{ marginBottom: 8 }}>
            Tri « Tous » : score = clics×{weights.clickWeight} + favoris×{weights.favoriteWeight} + moyenne
            note×{weights.ratingWeight}.
          </p>
          <PerfRankList rows={pagedEventList} rankOffset={listPage * INSIGHTS_PAGE_SIZE} />
          <ListPager
            page={listPage}
            total={eventList.length}
            pageSize={INSIGHTS_PAGE_SIZE}
            onPageChange={setListPage}
            label="événements"
          />
        </>
      ) : null}

      {data && tab === 'spots' && canSpots && weights ? (
        <>
          <MetricTabs
            tabs={
              [
                ['all', 'Tous'],
                ['favorites', 'Favoris'],
                ['clicks', 'Clics'],
                ['stars', 'Étoiles'],
                ['ratings', 'Notes'],
              ] as const
            }
            active={spotMetric}
            onChange={(m) => {
              setSpotMetric(m);
              setListPage(0);
            }}
          />
          <PerfRankList rows={pagedSpotList} rankOffset={listPage * INSIGHTS_PAGE_SIZE} />
          <ListPager
            page={listPage}
            total={spotList.length}
            pageSize={INSIGHTS_PAGE_SIZE}
            onPageChange={setListPage}
            label="spots"
          />
        </>
      ) : null}

      {data && tab === 'tools' && canTools && weights ? (
        <>
          <MetricTabs
            tabs={
              [
                ['all', 'Tous'],
                ['favorites', 'Favoris'],
                ['clicks', 'Clics'],
                ['stars', 'Étoiles'],
                ['ratings', 'Notes'],
              ] as const
            }
            active={toolMetric}
            onChange={(m) => {
              setToolMetric(m);
              setListPage(0);
            }}
          />
          <PerfRankList rows={pagedToolList} rankOffset={listPage * INSIGHTS_PAGE_SIZE} />
          <ListPager
            page={listPage}
            total={toolList.length}
            pageSize={INSIGHTS_PAGE_SIZE}
            onPageChange={setListPage}
            label="outils"
          />
        </>
      ) : null}

      {data && tab === 'benefits' && canBenefits ? (
        <>
          <p className="meta" style={{ marginTop: 0 }}>
            Tableau : modèles <strong>actifs</strong> avec partenaire / lieu associé ayant au moins un octroi membre.
          </p>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Catalogue</th>
                  <th>Octroyés</th>
                  <th>Consommés</th>
                  <th>Non consommés</th>
                </tr>
              </thead>
              <tbody>
                {catalogStatsPaged.map((s) => (
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
                Aucun privilège actif associé avec octroi enregistré.
              </p>
            ) : null}
          </div>
          <ListPager
            page={benefitsPage}
            total={data.catalogStats.length}
            pageSize={INSIGHTS_PAGE_SIZE}
            onPageChange={setBenefitsPage}
            label="catalogues"
          />
        </>
      ) : null}

      {data && tab === 'platform' && canPlatform ? (
        <>
          <MetricTabs
            tabs={
              [
                ['all', 'Tous'],
                ['corner', 'Le Singulier / Fragment'],
                ['polls', 'Sondages'],
                ['walks', 'Parcours'],
              ] as const
            }
            active={platformMetric}
            onChange={(m) => setPlatformMetric(m)}
          />
          <p className="meta" style={{ marginBottom: 12 }}>
            Chaque bloc affiche le <strong>top {ACCUEIL_INSIGHTS_TOP}</strong> (pas de pagination).
          </p>
          {platformMetric === 'all' || platformMetric === 'corner' ? (
            <>
              <CornerList
                title={`Le Singulier — top ${ACCUEIL_INSIGHTS_TOP} clics`}
                rows={data.platform.corners}
                limit={ACCUEIL_INSIGHTS_TOP}
              />
              <CornerList
                title={`Le Fragment — top ${ACCUEIL_INSIGHTS_TOP} clics`}
                rows={data.platform.chroniques}
                limit={ACCUEIL_INSIGHTS_TOP}
              />
            </>
          ) : null}
          {platformMetric === 'all' || platformMetric === 'polls' ? (
            <PollList
              polls={data.platform.polls}
              limit={ACCUEIL_INSIGHTS_TOP}
              title={`Sondages — top ${ACCUEIL_INSIGHTS_TOP} (récents)`}
            />
          ) : null}
          {platformMetric === 'all' || platformMetric === 'walks' ? (
            <WalkList
              walks={data.platform.walks}
              limit={ACCUEIL_INSIGHTS_TOP}
              title={`Parcours — top ${ACCUEIL_INSIGHTS_TOP} clics`}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="card kpi-card">
      <div className="meta">{label}</div>
      <strong>{value}</strong>
      {hint ? <div className="meta">{hint}</div> : null}
    </div>
  );
}

function MetricTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly (readonly [T, string])[];
  active: T;
  onChange: (next: T) => void;
}) {
  return (
    <nav className="tabs" style={{ marginBottom: 12 }}>
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={`tab ${active === id ? 'active' : ''}`}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

function EngagementByType({ rows }: { rows: ContentTypeUsageRow[] }) {
  const visible = rows.filter((r) => r.itemCount > 0);
  if (!visible.length) {
    return <p className="muted">Pas encore de données plébiscités.</p>;
  }
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Plébiscités par type</h3>
      <p className="meta">Du plus plébiscité au moins plébiscité (favoris, clics, notes).</p>
      <ol className="top-list">
        {visible.map((row, index) => (
          <li key={row.kind}>
            <span>
              <span className="meta" style={{ marginRight: 8 }}>
                #{index + 1}
              </span>
              <strong>{row.label}</strong>
              <span className="meta"> · {formatUsageMeta(row)}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatUsageMeta(row: ContentTypeUsageRow): string {
  if (row.kind === 'event') {
    return `${row.totalFavorites} favori${row.totalFavorites > 1 ? 's' : ''} · ${row.totalClicks} clic${row.totalClicks > 1 ? 's' : ''} · ${row.itemCount} fiche${row.itemCount > 1 ? 's' : ''}`;
  }
  if (row.kind === 'corner') {
    return `${row.itemCount} profil${row.itemCount > 1 ? 's' : ''} · ${row.totalClicks} clic${row.totalClicks > 1 ? 's' : ''}`;
  }
  if (row.kind === 'chronique') {
    return `${row.itemCount} Fragment${row.itemCount > 1 ? 's' : ''} · ${row.totalClicks} clic${row.totalClicks > 1 ? 's' : ''}`;
  }
  if (row.kind === 'poll') {
    const rate =
      row.totalRatingCount > 0
        ? `${row.ratingAvg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
        : '—';
    return `${row.totalFavorites} vote${row.totalFavorites > 1 ? 's' : ''} · ${row.itemCount} sondage${row.itemCount > 1 ? 's' : ''} (${rate})`;
  }
  const rating =
    row.totalRatingCount > 0
      ? `${row.ratingAvg.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/5 · ${row.totalRatingCount} avis · `
      : '';
  return `${row.totalFavorites} favori${row.totalFavorites > 1 ? 's' : ''} · ${row.totalClicks} clic${row.totalClicks > 1 ? 's' : ''} · ${rating}${row.itemCount} fiche${row.itemCount > 1 ? 's' : ''}`;
}

function PerfRankList({ rows, rankOffset }: { rows: TeamLoopPerfRow[]; rankOffset: number }) {
  if (rows.length === 0) {
    return (
      <p className="muted" style={{ marginBottom: 12 }}>
        Aucun contenu publié avec engagement pour ce pays.
      </p>
    );
  }
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <ol className="top-list">
        {rows.map((r, index) => (
          <li key={r.id}>
            <div style={{ flex: 1 }}>
              <span className="meta" style={{ marginRight: 6 }}>
                #{rankOffset + index + 1}
              </span>
              <span>{r.title}</span>
              <div className="meta" style={{ marginTop: 4 }}>
                {r.displayLine}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CornerList({
  title,
  rows,
  limit,
}: {
  title: string;
  rows: PlatformCornerRow[];
  limit: number;
}) {
  const slice = rows.slice(0, limit);
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {rows.length === 0 ? (
        <p className="muted">Aucune fiche.</p>
      ) : (
        <ol className="top-list">
          {slice.map((r) => (
            <li key={r.id}>
              <span>
                {r.title}
                {r.personName ? <span className="meta"> · {r.personName}</span> : null}
                {!r.isActive ? <span className="meta"> · inactif</span> : null}
              </span>
              <strong>{r.clickCount}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function PollList({
  polls,
  limit,
  title,
}: {
  polls: PlatformPollRow[];
  limit: number;
  title: string;
}) {
  const slice = polls.slice(0, limit);
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {polls.length === 0 ? (
        <p className="muted">Aucun sondage.</p>
      ) : (
        slice.map((poll) => (
          <div key={poll.id} style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #eee' }}>
            <strong>{poll.question}</strong>
            <p className="meta">
              {poll.responseCount} réponse{poll.responseCount > 1 ? 's' : ''} · {poll.viewCount} vue
              {poll.viewCount > 1 ? 's' : ''} ·{' '}
              {poll.responseRate.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % des vues
              {!poll.isActive ? ' · inactif' : ''}
            </p>
            {poll.options.length ? (
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {poll.options.map((opt) => (
                  <li key={opt.optionId} className="meta">
                    {opt.label} — {opt.voteCount} (
                    {opt.voteRate.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %)
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

function WalkList({
  walks,
  limit,
  title,
}: {
  walks: WalkInsightRow[];
  limit: number;
  title: string;
}) {
  const sorted = [...walks].sort((a, b) => b.clicks - a.clicks || b.favorites - a.favorites);
  const slice = sorted.slice(0, limit);
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {sorted.length === 0 ? (
        <p className="muted">Aucun parcours publié.</p>
      ) : (
        <ol className="top-list">
          {slice.map((w) => (
            <li key={w.id}>
              <span>
                {w.title}
                <div className="meta">{w.displayLine}</div>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
