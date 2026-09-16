import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ListPager } from '../components/ListPager';
import { useAdminCountry } from '../context/AdminCountryContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatWhen } from '../lib/format';
import {
  CATALOG_PAGE_SIZE,
  CONTENT_STATUS_LABELS,
  CONTENT_STATUSES,
  KIND_LABELS,
  adminContentActionsFor,
  listCatalogContent,
  setCatalogContentStatus,
  type CatalogContentItem,
  type CatalogKind,
  type ContentStatus,
} from '../lib/content';
import { isTheLoopLinked, listBenefitCatalog, type BenefitCatalogRow } from '../lib/privileges';
import { loadInsights, type InsightsBundle } from '../lib/insights';

type Tab = 'contenu' | 'privileges' | 'featured' | 'stats';

export function LoopPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const { can, canSub } = usePermissions();
  const [params, setParams] = useSearchParams();

  const canContent = can('loop_hub') || can('content');
  const canBenefits = can('loop_hub') || can('prime_benefits');
  const canFeatured = can('loop_hub') || can('featured');
  const canStats = can('loop_hub') || can('insights');

  const canEvents = can('loop_hub') || canSub('content', 'content_events');
  const canSpots = can('loop_hub') || canSub('content', 'content_spots');
  const canTools = can('loop_hub') || canSub('content', 'content_tools');

  const defaultTab: Tab = canContent
    ? 'contenu'
    : canBenefits
      ? 'privileges'
      : canFeatured
        ? 'featured'
        : 'stats';

  const tabParam = params.get('tab');
  const tab: Tab =
    tabParam === 'contenu' ||
    tabParam === 'privileges' ||
    tabParam === 'featured' ||
    tabParam === 'stats'
      ? tabParam
      : defaultTab;

  function setTab(next: Tab) {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', next);
      return p;
    });
  }

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const defaultKind: CatalogKind = canEvents ? 'event' : canSpots ? 'spot' : 'tool';
  const [typeTab, setTypeTab] = useState<CatalogKind>(defaultKind);
  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>('published');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<CatalogContentItem[]>([]);
  const [benefits, setBenefits] = useState<BenefitCatalogRow[]>([]);
  const [benefitFilter, setBenefitFilter] = useState<'active' | 'all'>('active');
  const [stats, setStats] = useState<InsightsBundle | null>(null);

  const loadContent = useCallback(async () => {
    const res = await listCatalogContent(countryCode, [typeTab], {
      origins: ['admin', 'loop'],
      page,
      pageSize: CATALOG_PAGE_SIZE,
      status: statusFilter,
      withTotal: true,
    });
    setItems(res.items);
    setTotal(res.total);
    if (res.error) setMsg(res.error);
  }, [countryCode, typeTab, page, statusFilter]);

  const loadBenefits = useCallback(async () => {
    const res = await listBenefitCatalog(countryCode);
    setBenefits(res.items.filter((i) => isTheLoopLinked(i.partnerNames)));
    if (res.error) setMsg(res.error);
  }, [countryCode]);

  const loadStats = useCallback(async () => {
    setStats(await loadInsights(countryCode, { teamOnly: true }));
  }, [countryCode]);

  useEffect(() => {
    setMsg(null);
    if (tab === 'contenu' && canContent) void loadContent();
    if ((tab === 'privileges' || tab === 'featured') && canBenefits) void loadBenefits();
    if (tab === 'featured' && canFeatured) void loadContent();
    if (tab === 'stats' && canStats) void loadStats();
  }, [tab, canContent, canBenefits, canFeatured, canStats, loadContent, loadBenefits, loadStats]);

  useEffect(() => {
    setPage(0);
  }, [typeTab, statusFilter, countryCode]);

  useEffect(() => {
    const allowed =
      typeTab === 'event' ? canEvents : typeTab === 'spot' ? canSpots : canTools;
    if (!allowed) setTypeTab(defaultKind);
  }, [typeTab, canEvents, canSpots, canTools, defaultKind]);

  const featuredItems = useMemo(
    () => items.filter((i) => i.isFeatured && i.contentStatus === 'published'),
    [items],
  );

  const filteredBenefits = useMemo(
    () => benefits.filter((b) => benefitFilter === 'all' || b.isActive),
    [benefits, benefitFilter],
  );

  async function applyStatus(item: CatalogContentItem, status: ContentStatus) {
    setBusy(true);
    const res = await setCatalogContentStatus(item.kind, item.id, status);
    setBusy(false);
    if (!res.ok) setMsg(res.error ?? 'Erreur');
    else {
      setMsg(`Statut → ${CONTENT_STATUS_LABELS[status]}`);
      void loadContent();
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Publication équipe</p>
          <h2>THE LOOP</h2>
          <p className="meta">
            Contenu d’origine admin/loop — pays : {countryLabel}. Catalogue global :{' '}
            <Link to="/contenu">Contenu</Link>.
          </p>
        </div>
      </header>

      <nav className="tabs">
        {canContent ? (
          <button
            type="button"
            className={`tab ${tab === 'contenu' ? 'active' : ''}`}
            onClick={() => setTab('contenu')}
          >
            Mon contenu
          </button>
        ) : null}
        {canBenefits ? (
          <button
            type="button"
            className={`tab ${tab === 'privileges' ? 'active' : ''}`}
            onClick={() => setTab('privileges')}
          >
            Privilèges offerts
          </button>
        ) : null}
        {canFeatured ? (
          <button
            type="button"
            className={`tab ${tab === 'featured' ? 'active' : ''}`}
            onClick={() => setTab('featured')}
          >
            À la une
          </button>
        ) : null}
        {canStats ? (
          <button
            type="button"
            className={`tab ${tab === 'stats' ? 'active' : ''}`}
            onClick={() => setTab('stats')}
          >
            Performances
          </button>
        ) : null}
      </nav>

      {msg ? <p className="muted">{msg}</p> : null}

      {tab === 'contenu' && canContent ? (
        <>
          <div className="tabs" style={{ marginBottom: 8 }}>
            {canEvents ? (
              <button
                type="button"
                className={`tab ${typeTab === 'event' ? 'active' : ''}`}
                onClick={() => setTypeTab('event')}
              >
                {KIND_LABELS.event}
              </button>
            ) : null}
            {canSpots ? (
              <button
                type="button"
                className={`tab ${typeTab === 'spot' ? 'active' : ''}`}
                onClick={() => setTypeTab('spot')}
              >
                {KIND_LABELS.spot}
              </button>
            ) : null}
            {canTools ? (
              <button
                type="button"
                className={`tab ${typeTab === 'tool' ? 'active' : ''}`}
                onClick={() => setTypeTab('tool')}
              >
                {KIND_LABELS.tool}
              </button>
            ) : null}
          </div>
          <div className="tabs" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`tab ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              Tous statuts
            </button>
            {CONTENT_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`tab ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {CONTENT_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <ContentTable items={items} busy={busy} onStatus={applyStatus} />
          <ListPager
            page={page}
            total={total}
            pageSize={CATALOG_PAGE_SIZE}
            onPageChange={setPage}
            label="contenus équipe"
          />
        </>
      ) : null}

      {tab === 'privileges' && canBenefits ? (
        <>
          <div className="tabs" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`tab ${benefitFilter === 'active' ? 'active' : ''}`}
              onClick={() => setBenefitFilter('active')}
            >
              Actifs
            </button>
            <button
              type="button"
              className={`tab ${benefitFilter === 'all' ? 'active' : ''}`}
              onClick={() => setBenefitFilter('all')}
            >
              Tous
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Privilège</th>
                  <th>Partenaires</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filteredBenefits.map((b) => (
                  <tr key={b.localId}>
                    <td>
                      <strong>{b.title}</strong>
                      <div className="meta">{b.description.slice(0, 100)}</div>
                    </td>
                    <td className="meta">{b.partnerNames.join(' · ') || '—'}</td>
                    <td>
                      <span className={`badge ${b.isActive ? 'ok' : 'warn'}`}>
                        {b.isActive ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredBenefits.length === 0 ? (
              <p className="muted" style={{ padding: 16 }}>
                Aucun privilège lié à THE LOOP. Gérer via <Link to="/privileges">Privilèges</Link>.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === 'featured' && canFeatured ? (
        <>
          <p className="meta" style={{ marginBottom: 12 }}>
            Lecture seule — édition dans <Link to="/accueil?tab=featured">Accueil → À la une</Link>.
          </p>
          <ContentTable items={featuredItems} busy={busy} onStatus={applyStatus} readOnly />
        </>
      ) : null}

      {tab === 'stats' && canStats && stats ? (
        <>
          <div className="kpi-grid">
            <div className="card kpi-card">
              <div className="meta">Événements</div>
              <strong>{stats.counts.events}</strong>
            </div>
            <div className="card kpi-card">
              <div className="meta">Spots</div>
              <strong>{stats.counts.spots}</strong>
            </div>
            <div className="card kpi-card">
              <div className="meta">Outils</div>
              <strong>{stats.counts.tools}</strong>
            </div>
          </div>
          <h3>Top clics (équipe)</h3>
          <TopList title="Événements" rows={stats.eventsByClicks} />
          <TopList title="Spots" rows={stats.spotsByClicks} />
          <TopList title="Outils" rows={stats.toolsByClicks} />
        </>
      ) : null}
    </section>
  );
}

function ContentTable({
  items,
  busy,
  onStatus,
  readOnly,
}: {
  items: CatalogContentItem[];
  busy: boolean;
  onStatus: (item: CatalogContentItem, status: ContentStatus) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Titre</th>
            <th>Type</th>
            <th>Statut</th>
            {!readOnly ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const actions = adminContentActionsFor(item.contentStatus);
            return (
              <tr key={`${item.kind}-${item.id}`}>
                <td>
                  <strong>{item.title}</strong>
                  <div className="meta">
                    {item.contentOrigin} · {formatWhen(item.updatedAt)}
                    {item.isFeatured ? ' · À la une' : ''}
                  </div>
                </td>
                <td>{KIND_LABELS[item.kind]}</td>
                <td>
                  <span
                    className={`badge ${
                      item.contentStatus === 'published'
                        ? 'ok'
                        : item.contentStatus === 'archived'
                          ? 'err'
                          : 'warn'
                    }`}
                  >
                    {CONTENT_STATUS_LABELS[item.contentStatus]}
                  </span>
                </td>
                {!readOnly ? (
                  <td>
                    <div className="edit-actions" style={{ marginTop: 0 }}>
                      {actions.canPublish ? (
                        <button
                          type="button"
                          className="btn small"
                          disabled={busy}
                          onClick={() => onStatus(item, 'published')}
                        >
                          Publier
                        </button>
                      ) : null}
                      {actions.canDeactivate ? (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={busy}
                          onClick={() => onStatus(item, 'deactivated')}
                        >
                          Désactiver
                        </button>
                      ) : null}
                      {actions.canArchive ? (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={busy}
                          onClick={() => onStatus(item, 'archived')}
                        >
                          Archiver
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {items.length === 0 ? (
        <p className="muted" style={{ padding: 16 }}>
          Aucun contenu équipe.
        </p>
      ) : null}
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: { id: string; title: string; metric: number }[] }) {
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h4 style={{ margin: '0 0 8px' }}>{title}</h4>
      {rows.length === 0 ? (
        <p className="muted">Aucune donnée.</p>
      ) : (
        <ol className="top-list">
          {rows.slice(0, 5).map((r) => (
            <li key={r.id}>
              <span>{r.title}</span>
              <strong>{r.metric}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
