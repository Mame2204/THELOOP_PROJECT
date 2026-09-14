import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAdminCountry } from '../context/AdminCountryContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatWhen } from '../lib/format';
import {
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

type TypeTab = 'all' | CatalogKind;

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

  const tabParam = params.get('tab');
  const typeTab: TypeTab =
    tabParam === 'events' || tabParam === 'spots' || tabParam === 'tools'
      ? (tabParam === 'events' ? 'event' : tabParam === 'spots' ? 'spot' : 'tool')
      : 'all';

  const [statusFilter, setStatusFilter] = useState<ContentStatus | 'all'>('all');
  const [items, setItems] = useState<CatalogContentItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [featureDraft, setFeatureDraft] = useState<Record<string, { start: string; end: string }>>(
    {},
  );

  function setTypeTab(next: TypeTab) {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'all') p.delete('tab');
      else p.set('tab', next === 'event' ? 'events' : next === 'spot' ? 'spots' : 'tools');
      return p;
    });
  }

  const load = useCallback(async () => {
    setError(null);
    const kinds: CatalogKind[] = [];
    if (typeTab === 'all') {
      if (canEvents) kinds.push('event');
      if (canSpots) kinds.push('spot');
      if (canTools) kinds.push('tool');
    } else {
      kinds.push(typeTab);
    }
    const res = await listCatalogContent(countryCode, kinds);
    if (res.error) setError(res.error);
    setItems(res.items);
  }, [countryCode, typeTab, canEvents, canSpots, canTools]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => items.filter((i) => statusFilter === 'all' || i.contentStatus === statusFilter),
    [items, statusFilter],
  );

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
            Events, spots, outils — pays : {countryLabel}. Hub équipe :{' '}
            <Link to="/loop">THE LOOP</Link> · blocs éditoriaux : <Link to="/accueil">Accueil</Link>.
          </p>
        </div>
      </header>

      <nav className="tabs">
        <button
          type="button"
          className={`tab ${typeTab === 'all' ? 'active' : ''}`}
          onClick={() => setTypeTab('all')}
        >
          Tous
        </button>
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
            {filtered.map((item) => {
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
        {filtered.length === 0 ? (
          <p className="muted" style={{ padding: 16 }}>
            Aucun contenu pour ces filtres.
          </p>
        ) : null}
      </div>
    </section>
  );
}
