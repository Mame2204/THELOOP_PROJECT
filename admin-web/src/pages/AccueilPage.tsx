import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAdminCountry } from '../context/AdminCountryContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatWhen } from '../lib/format';
import {
  ACCUEIL_BLOCK_LABELS,
  clearWalkFeaturedWeek,
  deleteChronique,
  deleteCorner,
  deleteLogo,
  deletePoll,
  createPoll,
  deleteWalk,
  listAccueilChroniques,
  listAccueilCorners,
  listAccueilLogos,
  listAccueilPolls,
  listAccueilWalks,
  loadAppSections,
  setAccueilBlock,
  setChroniqueActive,
  setCornerActive,
  setLogoActive,
  setPollActive,
  setWalkFeaturedWeek,
  setWalkPublished,
  type AccueilBlocksConfig,
  type AccueilChroniqueRow,
  type AccueilCornerRow,
  type AccueilLogoRow,
  type AccueilPollRow,
  type AccueilWalkRow,
  type AppSectionsConfig,
} from '../lib/accueil';
import {
  KIND_LABELS,
  listCatalogContent,
  setCatalogContentFeatured,
  type CatalogContentItem,
  type CatalogKind,
} from '../lib/content';

type Tab =
  | 'overview'
  | 'featured'
  | 'poll'
  | 'walks'
  | 'corner'
  | 'chronique'
  | 'logos';

export function AccueilPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();

  const canOverview = can('featured_overview') || can('featured');
  const canHero = can('featured_hero') || can('featured');
  const canPoll = can('featured_poll') || can('featured');
  const canWalks = can('featured_walks') || can('featured');
  const canCorner = can('featured_corner') || can('featured');
  const canChronique = can('featured_chronique') || can('featured');
  const canLogos = can('featured_logos') || can('featured');

  const defaultTab: Tab = canOverview
    ? 'overview'
    : canHero
      ? 'featured'
      : canPoll
        ? 'poll'
        : canWalks
          ? 'walks'
          : canCorner
            ? 'corner'
            : canChronique
              ? 'chronique'
              : 'logos';

  const tabParam = params.get('tab');
  const tab: Tab =
    tabParam === 'overview' ||
    tabParam === 'featured' ||
    tabParam === 'poll' ||
    tabParam === 'walks' ||
    tabParam === 'corner' ||
    tabParam === 'chronique' ||
    tabParam === 'logos'
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

  const [sections, setSections] = useState<AppSectionsConfig | null>(null);
  const [featuredItems, setFeaturedItems] = useState<CatalogContentItem[]>([]);
  const [kindFilter, setKindFilter] = useState<CatalogKind | 'all'>('all');
  const [featureView, setFeatureView] = useState<'all' | 'featured' | 'not_featured'>('all');

  const [polls, setPolls] = useState<AccueilPollRow[]>([]);
  const [walks, setWalks] = useState<AccueilWalkRow[]>([]);
  const [corners, setCorners] = useState<AccueilCornerRow[]>([]);
  const [chroniques, setChroniques] = useState<AccueilChroniqueRow[]>([]);
  const [logos, setLogos] = useState<AccueilLogoRow[]>([]);

  const loadOverview = useCallback(async () => {
    setSections(await loadAppSections(countryCode));
  }, [countryCode]);

  const loadFeatured = useCallback(async () => {
    const res = await listCatalogContent(countryCode);
    setFeaturedItems(res.items.filter((i) => i.contentStatus === 'published'));
  }, [countryCode]);

  const loadPolls = useCallback(async () => {
    setPolls(await listAccueilPolls(countryCode));
  }, [countryCode]);

  const loadWalks = useCallback(async () => {
    setWalks(await listAccueilWalks(countryCode));
  }, [countryCode]);

  const loadCorners = useCallback(async () => {
    setCorners(await listAccueilCorners(countryCode));
  }, [countryCode]);

  const loadChroniques = useCallback(async () => {
    setChroniques(await listAccueilChroniques(countryCode));
  }, [countryCode]);

  const loadLogos = useCallback(async () => {
    setLogos(await listAccueilLogos(countryCode));
  }, [countryCode]);

  useEffect(() => {
    setMsg(null);
    if (tab === 'overview' && canOverview) void loadOverview();
    if (tab === 'featured' && canHero) void loadFeatured();
    if (tab === 'poll' && canPoll) void loadPolls();
    if (tab === 'walks' && canWalks) void loadWalks();
    if (tab === 'corner' && canCorner) void loadCorners();
    if (tab === 'chronique' && canChronique) void loadChroniques();
    if (tab === 'logos' && canLogos) void loadLogos();
  }, [
    tab,
    canOverview,
    canHero,
    canPoll,
    canWalks,
    canCorner,
    canChronique,
    canLogos,
    loadOverview,
    loadFeatured,
    loadPolls,
    loadWalks,
    loadCorners,
    loadChroniques,
    loadLogos,
  ]);

  async function toggleBlock(key: keyof AccueilBlocksConfig, enabled: boolean) {
    setBusy(true);
    const res = await setAccueilBlock(countryCode, key, enabled);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Erreur');
      return;
    }
    if (res.sections) setSections(res.sections);
    setMsg('Visibilité mise à jour.');
  }

  const visibleFeatured = featuredItems.filter((i) => {
    if (kindFilter !== 'all' && i.kind !== kindFilter) return false;
    if (featureView === 'featured' && !i.isFeatured) return false;
    if (featureView === 'not_featured' && i.isFeatured) return false;
    return true;
  });

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Accueil membre</p>
          <h2>Accueil</h2>
          <p className="meta">
            Blocs visibles, À la une, sondages et éditoriaux — pays : {countryLabel}. Catalogue
            statut : <Link to="/contenu">Contenu</Link>.
          </p>
        </div>
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
        {canHero ? (
          <button
            type="button"
            className={`tab ${tab === 'featured' ? 'active' : ''}`}
            onClick={() => setTab('featured')}
          >
            À la une
          </button>
        ) : null}
        {canPoll ? (
          <button
            type="button"
            className={`tab ${tab === 'poll' ? 'active' : ''}`}
            onClick={() => setTab('poll')}
          >
            Sondage
          </button>
        ) : null}
        {canWalks ? (
          <button
            type="button"
            className={`tab ${tab === 'walks' ? 'active' : ''}`}
            onClick={() => setTab('walks')}
          >
            Parcours
          </button>
        ) : null}
        {canCorner ? (
          <button
            type="button"
            className={`tab ${tab === 'corner' ? 'active' : ''}`}
            onClick={() => setTab('corner')}
          >
            Le Singulier
          </button>
        ) : null}
        {canChronique ? (
          <button
            type="button"
            className={`tab ${tab === 'chronique' ? 'active' : ''}`}
            onClick={() => setTab('chronique')}
          >
            Le Fragment
          </button>
        ) : null}
        {canLogos ? (
          <button
            type="button"
            className={`tab ${tab === 'logos' ? 'active' : ''}`}
            onClick={() => setTab('logos')}
          >
            Logos
          </button>
        ) : null}
      </nav>

      {msg ? <p className="muted">{msg}</p> : null}

      {tab === 'overview' && canOverview && sections ? (
        <div className="card" style={{ maxWidth: 520 }}>
          <h3>Blocs visibles sur l’Accueil</h3>
          <p className="meta">Contrôle `app_sections_ui_{countryCode}`.</p>
          {(Object.keys(ACCUEIL_BLOCK_LABELS) as (keyof AccueilBlocksConfig)[]).map((key) => (
            <label key={key} className="check-inline" style={{ display: 'flex', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={sections.accueil[key]}
                disabled={busy}
                onChange={(e) => void toggleBlock(key, e.target.checked)}
              />
              {ACCUEIL_BLOCK_LABELS[key]}
            </label>
          ))}
        </div>
      ) : null}

      {tab === 'featured' && canHero ? (
        <>
          <div className="tabs" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`tab ${kindFilter === 'all' ? 'active' : ''}`}
              onClick={() => setKindFilter('all')}
            >
              Tous
            </button>
            {(Object.keys(KIND_LABELS) as CatalogKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`tab ${kindFilter === k ? 'active' : ''}`}
                onClick={() => setKindFilter(k)}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <div className="tabs" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`tab ${featureView === 'all' ? 'active' : ''}`}
              onClick={() => setFeatureView('all')}
            >
              Tous
            </button>
            <button
              type="button"
              className={`tab ${featureView === 'featured' ? 'active' : ''}`}
              onClick={() => setFeatureView('featured')}
            >
              Actifs
            </button>
            <button
              type="button"
              className={`tab ${featureView === 'not_featured' ? 'active' : ''}`}
              onClick={() => setFeatureView('not_featured')}
            >
              Hors une
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contenu</th>
                  <th>Type</th>
                  <th>Une</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleFeatured.map((item) => (
                  <tr key={`${item.kind}-${item.id}`}>
                    <td>
                      <strong>{item.title}</strong>
                      <div className="meta">{item.subtitle}</div>
                    </td>
                    <td>{KIND_LABELS[item.kind]}</td>
                    <td>
                      <span className={`badge ${item.isFeatured ? 'ok' : 'warn'}`}>
                        {item.isFeatured ? 'Actif' : 'Non'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          void (async () => {
                            setBusy(true);
                            const res = await setCatalogContentFeatured(
                              item.kind,
                              item.id,
                              !item.isFeatured,
                              item.featuredStartDate,
                              item.featuredEndDate,
                            );
                            setBusy(false);
                            if (!res.ok) setMsg(res.error ?? 'Erreur');
                            else {
                              setMsg('À la une mis à jour.');
                              void loadFeatured();
                            }
                          })();
                        }}
                      >
                        {item.isFeatured ? 'Retirer' : 'Mettre à la une'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleFeatured.length === 0 ? (
              <p className="muted" style={{ padding: 16 }}>
                Aucun contenu publié.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === 'poll' && canPoll ? (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <h3>Nouveau sondage</h3>
            <div className="toolbar">
              <input
                id="new-poll-q"
                placeholder="Question du sondage…"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const input = e.currentTarget;
                  const q = input.value;
                  void createPoll(countryCode, q).then((r) => {
                    if (!r.ok) setMsg(r.error ?? 'Erreur');
                    else {
                      input.value = '';
                      setMsg('Sondage créé.');
                      void loadPolls();
                    }
                  });
                }}
              />
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  const input = document.getElementById('new-poll-q') as HTMLInputElement | null;
                  if (!input) return;
                  void createPoll(countryCode, input.value).then((r) => {
                    if (!r.ok) setMsg(r.error ?? 'Erreur');
                    else {
                      input.value = '';
                      setMsg('Sondage créé.');
                      void loadPolls();
                    }
                  });
                }}
              >
                Créer
              </button>
            </div>
          </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Période</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {polls.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.question}</strong>
                    <div className="meta">{formatWhen(p.createdAt)}</div>
                  </td>
                  <td className="meta">
                    {p.periodStart ?? '—'} → {p.periodEnd ?? '—'}
                  </td>
                  <td>
                    <span className={`badge ${p.isActive ? 'ok' : 'warn'}`}>
                      {p.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td>
                    <div className="edit-actions" style={{ marginTop: 0 }}>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          void setPollActive(p.id, !p.isActive).then((r) => {
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadPolls();
                          });
                        }}
                      >
                        {p.isActive ? 'Désactiver' : 'Activer'}
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm('Supprimer ce sondage ?')) return;
                          void deletePoll(p.id).then((r) => {
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadPolls();
                          });
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {polls.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              Aucun sondage.
            </p>
          ) : null}
        </div>
        </>
      ) : null}

      {tab === 'walks' && canWalks ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Parcours</th>
                <th>Statut</th>
                <th>Semaine</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {walks.map((w) => (
                <tr key={w.id}>
                  <td>
                    <strong>{w.title}</strong>
                    <div className="meta">
                      {w.durationMinutes != null ? `${w.durationMinutes} min` : '—'}
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${w.isPublished ? 'ok' : 'warn'}`}>
                      {w.isPublished ? 'Publié' : 'Masqué'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${w.isFeaturedWeek ? 'ok' : 'warn'}`}>
                      {w.isFeaturedWeek ? 'Semaine' : '—'}
                    </span>
                  </td>
                  <td>
                    <div className="edit-actions" style={{ marginTop: 0 }}>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          void setWalkPublished(w.id, !w.isPublished).then((r) => {
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadWalks();
                          });
                        }}
                      >
                        {w.isPublished ? 'Masquer' : 'Publier'}
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          void setWalkFeaturedWeek(w.id, countryCode).then((r) => {
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else {
                              setMsg('Parcours de la semaine défini.');
                              void loadWalks();
                            }
                          });
                        }}
                      >
                        Semaine
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm('Supprimer ce parcours ?')) return;
                          void deleteWalk(w.id).then((r) => {
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadWalks();
                          });
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {walks.some((w) => w.isFeaturedWeek) ? (
            <p style={{ padding: 12 }}>
              <button
                type="button"
                className="btn small ghost"
                onClick={() => {
                  void clearWalkFeaturedWeek(countryCode).then((r) => {
                    if (!r.ok) setMsg(r.error ?? 'Erreur');
                    else void loadWalks();
                  });
                }}
              >
                Effacer parcours de la semaine
              </button>
            </p>
          ) : null}
          {walks.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              Aucun parcours.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'corner' && canCorner ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Singulier</th>
                <th>Période</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {corners.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.subjectName || c.title}</strong>
                    <div className="meta">{c.title}</div>
                  </td>
                  <td className="meta">
                    {c.periodStart ?? '—'} → {c.periodEnd ?? '—'}
                  </td>
                  <td>
                    <span className={`badge ${c.isActive ? 'ok' : 'warn'}`}>
                      {c.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td>
                    <div className="edit-actions" style={{ marginTop: 0 }}>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          void setCornerActive(c.id, !c.isActive).then((r) => {
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadCorners();
                          });
                        }}
                      >
                        {c.isActive ? 'Désactiver' : 'Activer'}
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm('Supprimer ?')) return;
                          void deleteCorner(c.id).then((r) => {
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadCorners();
                          });
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {corners.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              Aucun Singulier.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'chronique' && canChronique ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fragment</th>
                <th>Période</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {chroniques.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.title}</strong>
                    <div className="meta">{c.volumeLabel}</div>
                  </td>
                  <td className="meta">
                    {c.periodStart ?? '—'} → {c.periodEnd ?? '—'}
                  </td>
                  <td>
                    <span className={`badge ${c.isActive ? 'ok' : 'warn'}`}>
                      {c.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td>
                    <div className="edit-actions" style={{ marginTop: 0 }}>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          void setChroniqueActive(c.id, !c.isActive).then((r) => {
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadChroniques();
                          });
                        }}
                      >
                        {c.isActive ? 'Désactiver' : 'Activer'}
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm('Supprimer ?')) return;
                          void deleteChronique(c.id).then((r) => {
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadChroniques();
                          });
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {chroniques.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              Aucun Fragment.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'logos' && canLogos ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Logo</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {logos.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      {l.logoUrl ? (
                        <img
                          src={l.logoUrl}
                          alt=""
                          style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: 6 }}
                        />
                      ) : null}
                      <div>
                        <strong>{l.name}</strong>
                        <div className="meta">{l.websiteUrl}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${l.isActive ? 'ok' : 'warn'}`}>
                      {l.isActive ? 'Actif' : 'Inactif'}
                    </span>
                  </td>
                  <td>
                    <div className="edit-actions" style={{ marginTop: 0 }}>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          void setLogoActive(l.id, !l.isActive).then((r) => {
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadLogos();
                          });
                        }}
                      >
                        {l.isActive ? 'Désactiver' : 'Activer'}
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm('Supprimer ce logo ?')) return;
                          void deleteLogo(l.id).then((r) => {
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadLogos();
                          });
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logos.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              Aucun logo.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
