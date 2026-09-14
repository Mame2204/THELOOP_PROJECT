import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
  setCatalogContentFeatured,
  setCatalogContentStatus,
  type CatalogContentItem,
  type CatalogKind,
  type ContentStatus,
} from '../lib/content';

function statusBadge(status: ContentStatus): string {
  if (status === 'published') return 'ok';
  if (status === 'archived') return 'err';
  return 'warn';
}

export function ContenuPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();

  const canEvents = can('content_events') || can('content');
  const canSpots = can('content_spots') || can('content');
  const canTools = can('content_tools') || can('content');

  const defaultKind: CatalogKind = canEvents ? 'event' : canSpots ? 'spot' : 'tool';
  const tabParam = params.get('tab');
  const typeTab: CatalogKind =
    tabParam === 'events' && canEvents
      ? 'event'
      : tabParam === 'spots' && canSpots
        ? 'spot'
        : tabParam === 'tools' && canTools
          ? 'tool'
          : defaultKind;

  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>('all');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<CatalogContentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [featureDraft, setFeatureDraft] = useState<Record<string, { start: string; end: string }>>(
    {},
  );

  function setTypeTab(next: CatalogKind) {
    setPage(0);
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', next === 'event' ? 'events' : next === 'spot' ? 'spots' : 'tools');
      return p;
    });
  }

  const load = useCallback(async () => {
    setError(null);
    // 1 table × 20 lignes + count — pas de « Tous » (3×200 = egress).
    const res = await listCatalogContent(countryCode, [typeTab], {
      page,
      pageSize: CATALOG_PAGE_SIZE,
      status: statusFilter,
      withTotal: true,
    });
    if (res.error) setError(res.error);
    setItems(res.items);
    setTotal(res.total);
  }, [countryCode, typeTab, page, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [countryCode, typeTab, statusFilter]);

  const pages = Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE));

  async function applyStatus(item: CatalogContentItem, status: ContentStatus) {
    setBusy(true);
    const res = await setCatalogContentStatus(item.kind, item.id, status);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Mise à jour impossible');
      return;
    }
    setMsg(`Statut → ${CONTENT_STATUS_LABELS[status]}`);
    void load();
  }

  async function toggleFeatured(item: CatalogContentItem, next: boolean) {
    const draft = featureDraft[item.id] ?? {
      start: item.featuredStartDate ?? '',
      end: item.featuredEndDate ?? '',
    };
    setBusy(true);
    const res = await setCatalogContentFeatured(
      item.kind,
      item.id,
      next,
      draft.start || null,
      draft.end || null,
    );
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Featured impossible');
      return;
    }
    setMsg(next ? 'Mis à la une.' : 'Retiré de la une.');
    void load();
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Catalogue</p>
          <h2>Contenu</h2>
          <p className="meta">
            Events, spots, outils — pays : {countryLabel}. Pages de {CATALOG_PAGE_SIZE} (egress
            limité). Hub : <Link to="/loop">THE LOOP</Link> ·{' '}
            <Link to="/accueil">Accueil</Link>.
          </p>
        </div>
      </header>

      <nav className="tabs">
        {canEvents ? (
          <button
            type="button"
            className={`tab ${typeTab === 'event' ? 'active' : ''}`}
            onClick={() => setTypeTab('event')}
          >
            Événements
          </button>
        ) : null}
        {canSpots ? (
          <button
            type="button"
            className={`tab ${typeTab === 'spot' ? 'active' : ''}`}
            onClick={() => setTypeTab('spot')}
          >
            Spots
          </button>
        ) : null}
        {canTools ? (
          <button
            type="button"
            className={`tab ${typeTab === 'tool' ? 'active' : ''}`}
            onClick={() => setTypeTab('tool')}
          >
            Outils
          </button>
        ) : null}
      </nav>

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

      {msg ? <p className="muted">{msg}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Titre</th>
              <th>Type</th>
              <th>Statut</th>
              <th>À la une</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const actions = adminContentActionsFor(item.contentStatus);
              const draft = featureDraft[item.id] ?? {
                start: item.featuredStartDate ?? '',
                end: item.featuredEndDate ?? '',
              };
              return (
                <tr key={`${item.kind}-${item.id}`}>
                  <td>
                    <strong>{item.title}</strong>
                    <div className="meta">{item.subtitle}</div>
                    <div className="meta">
                      {item.contentOrigin ?? '—'} · {formatWhen(item.updatedAt)}
                    </div>
                  </td>
                  <td>{KIND_LABELS[item.kind]}</td>
                  <td>
                    <span className={`badge ${statusBadge(item.contentStatus)}`}>
                      {CONTENT_STATUS_LABELS[item.contentStatus]}
                    </span>
                  </td>
                  <td>
                    <div className="edit-actions" style={{ marginTop: 0 }}>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => void toggleFeatured(item, !item.isFeatured)}
                      >
                        {item.isFeatured ? 'Retirer' : 'Mettre'}
                      </button>
                    </div>
                    <div className="feature-dates">
                      <input
                        type="date"
                        value={draft.start}
                        onChange={(e) =>
                          setFeatureDraft((prev) => ({
                            ...prev,
                            [item.id]: { ...draft, start: e.target.value },
                          }))
                        }
                      />
                      <input
                        type="date"
                        value={draft.end}
                        onChange={(e) =>
                          setFeatureDraft((prev) => ({
                            ...prev,
                            [item.id]: { ...draft, end: e.target.value },
                          }))
                        }
                      />
                    </div>
                  </td>
                  <td>
                    <div className="edit-actions" style={{ marginTop: 0 }}>
                      {actions.canPublish ? (
                        <button
                          type="button"
                          className="btn small"
                          disabled={busy}
                          onClick={() => void applyStatus(item, 'published')}
                        >
                          Publier
                        </button>
                      ) : null}
                      {actions.canDeactivate ? (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={busy}
                          onClick={() => void applyStatus(item, 'deactivated')}
                        >
                          Désactiver
                        </button>
                      ) : null}
                      {actions.canMoveToDraft ? (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={busy}
                          onClick={() => void applyStatus(item, 'draft')}
                        >
                          Brouillon
                        </button>
                      ) : null}
                      {actions.canArchive ? (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm('Archiver ce contenu ?')) return;
                            void applyStatus(item, 'archived');
                          }}
                        >
                          Archiver
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {items.length === 0 ? (
          <p className="muted" style={{ padding: 16 }}>
            Aucun contenu pour ces filtres.
          </p>
        ) : null}
      </div>

      {total > CATALOG_PAGE_SIZE ? (
        <div className="pager">
          <button
            type="button"
            className="btn ghost"
            disabled={page <= 0}
            onClick={() => setPage((x) => x - 1)}
          >
            Précédent
          </button>
          <span className="muted">
            Page {page + 1}/{pages} · {total} {KIND_LABELS[typeTab].toLowerCase()}s
          </span>
          <button
            type="button"
            className="btn ghost"
            disabled={page + 1 >= pages}
            onClick={() => setPage((x) => x + 1)}
          >
            Suivant
          </button>
        </div>
      ) : total > 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          {total} résultat{total > 1 ? 's' : ''}
        </p>
      ) : null}
    </section>
  );
}
