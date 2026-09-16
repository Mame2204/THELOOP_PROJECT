import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAdminCountry } from '../context/AdminCountryContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatWhen } from '../lib/format';
import { ListPager } from '../components/ListPager';
import {
  ACCUEIL_BLOCK_LABELS,
  ACCUEIL_PAGE_SIZE,
  clearWalkFeaturedWeek,
  deleteChronique,
  deleteCorner,
  deleteLogo,
  deletePoll,
  createPoll,
  createWalkSimple,
  createCornerSimple,
  createChroniqueSimple,
  createLogo,
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
  CATALOG_PICKER_LIMIT,
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
  const { canSub } = usePermissions();
  const [params, setParams] = useSearchParams();

  const canOverview = canSub('featured', 'featured_overview');
  const canHero = canSub('featured', 'featured_hero');
  const canPoll = canSub('featured', 'featured_poll');
  const canWalks = canSub('featured', 'featured_walks');
  const canCorner = canSub('featured', 'featured_corner');
  const canChronique = canSub('featured', 'featured_chronique');
  const canLogos = canSub('featured', 'featured_logos');

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
    setCornerPage(0);
    setChroniquePage(0);
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', next);
      return p;
    });
  }

  useEffect(() => {
    setCornerPage(0);
    setChroniquePage(0);
  }, [countryCode]);

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [sections, setSections] = useState<AppSectionsConfig | null>(null);
  const [featuredItems, setFeaturedItems] = useState<CatalogContentItem[]>([]);
  const [kindFilter, setKindFilter] = useState<CatalogKind | 'all'>('all');
  const [featureView, setFeatureView] = useState<'all' | 'featured' | 'not_featured'>('all');

  const [polls, setPolls] = useState<AccueilPollRow[]>([]);
  const [walks, setWalks] = useState<AccueilWalkRow[]>([]);
  const [corners, setCorners] = useState<AccueilCornerRow[]>([]);
  const [cornerPage, setCornerPage] = useState(0);
  const [cornerTotal, setCornerTotal] = useState(0);
  const [chroniques, setChroniques] = useState<AccueilChroniqueRow[]>([]);
  const [chroniquePage, setChroniquePage] = useState(0);
  const [chroniqueTotal, setChroniqueTotal] = useState(0);
  const [logos, setLogos] = useState<AccueilLogoRow[]>([]);

  const [newWalkTitle, setNewWalkTitle] = useState('');
  const [newWalkDuration, setNewWalkDuration] = useState('');
  const [newCornerSubject, setNewCornerSubject] = useState('');
  const [newCornerTitle, setNewCornerTitle] = useState('');
  const [newCornerImpact, setNewCornerImpact] = useState('');
  const [newChroniqueTitle, setNewChroniqueTitle] = useState('');
  const [newChroniqueBody, setNewChroniqueBody] = useState('');
  const [newLogoName, setNewLogoName] = useState('');
  const [newLogoUrl, setNewLogoUrl] = useState('');

  const loadOverview = useCallback(async () => {
    setSections(await loadAppSections(countryCode));
  }, [countryCode]);

  const loadFeatured = useCallback(async () => {
    const res = await listCatalogContent(countryCode, undefined, {
      pageSize: CATALOG_PICKER_LIMIT,
      status: 'published',
    });
    setFeaturedItems(res.items.filter((i) => i.contentStatus === 'published'));
  }, [countryCode]);

  const loadPolls = useCallback(async () => {
    setPolls(await listAccueilPolls(countryCode));
  }, [countryCode]);

  const loadWalks = useCallback(async () => {
    setWalks(await listAccueilWalks(countryCode));
  }, [countryCode]);

  const loadCorners = useCallback(async () => {
    const res = await listAccueilCorners(countryCode, {
      page: cornerPage,
      pageSize: ACCUEIL_PAGE_SIZE,
      withTotal: true,
    });
    setCorners(res.items);
    setCornerTotal(res.total);
    if (res.error) setMsg(res.error);
  }, [countryCode, cornerPage]);

  const loadChroniques = useCallback(async () => {
    const res = await listAccueilChroniques(countryCode, {
      page: chroniquePage,
      pageSize: ACCUEIL_PAGE_SIZE,
      withTotal: true,
    });
    setChroniques(res.items);
    setChroniqueTotal(res.total);
    if (res.error) setMsg(res.error);
  }, [countryCode, chroniquePage]);

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
        <>
        <div className="card" style={{ maxWidth: 480, marginBottom: 12 }}>
          <h3>Nouveau parcours</h3>
          <div className="field">
            <label>Titre</label>
            <input value={newWalkTitle} onChange={(e) => setNewWalkTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Durée (min, optionnel)</label>
            <input value={newWalkDuration} onChange={(e) => setNewWalkDuration(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              const dur = Number.parseInt(newWalkDuration, 10);
              void createWalkSimple(countryCode, newWalkTitle, Number.isFinite(dur) ? dur : undefined).then((r) => {
                setBusy(false);
                if (!r.ok) setMsg(r.error ?? 'Erreur');
                else {
                  setNewWalkTitle('');
                  setNewWalkDuration('');
                  setMsg('Parcours créé (brouillon). Complétez les étapes sur mobile si besoin.');
                  void loadWalks();
                }
              });
            }}
          >
            Créer
          </button>
        </div>
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
        </>
      ) : null}

      {tab === 'corner' && canCorner ? (
        <>
        <div className="card" style={{ maxWidth: 520, marginBottom: 12 }}>
          <h3>Nouveau Singulier</h3>
          <div className="field"><label>Sujet</label><input value={newCornerSubject} onChange={(e) => setNewCornerSubject(e.target.value)} /></div>
          <div className="field"><label>Titre œuvre</label><input value={newCornerTitle} onChange={(e) => setNewCornerTitle(e.target.value)} /></div>
          <div className="field"><label>Impact</label><textarea rows={2} value={newCornerImpact} onChange={(e) => setNewCornerImpact(e.target.value)} /></div>
          <button type="button" className="btn" disabled={busy} onClick={() => {
            setBusy(true);
            void createCornerSimple(countryCode, { subjectName: newCornerSubject, title: newCornerTitle, impactDescription: newCornerImpact }).then((r) => {
              setBusy(false);
              if (!r.ok) setMsg(r.error ?? 'Erreur');
              else { setNewCornerSubject(''); setNewCornerTitle(''); setNewCornerImpact(''); setMsg('Singulier créé.'); void loadCorners(); }
            });
          }}>Créer</button>
        </div>
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
        <ListPager
          page={cornerPage}
          total={cornerTotal}
          pageSize={ACCUEIL_PAGE_SIZE}
          onPageChange={setCornerPage}
          label="singuliers"
        />
        </>
      ) : null}

      {tab === 'chronique' && canChronique ? (
        <>
        <div className="card" style={{ maxWidth: 520, marginBottom: 12 }}>
          <h3>Nouveau Fragment</h3>
          <div className="field"><label>Titre</label><input value={newChroniqueTitle} onChange={(e) => setNewChroniqueTitle(e.target.value)} /></div>
          <div className="field"><label>Texte</label><textarea rows={3} value={newChroniqueBody} onChange={(e) => setNewChroniqueBody(e.target.value)} /></div>
          <button type="button" className="btn" disabled={busy} onClick={() => {
            setBusy(true);
            void createChroniqueSimple(countryCode, { title: newChroniqueTitle, body: newChroniqueBody }).then((r) => {
              setBusy(false);
              if (!r.ok) setMsg(r.error ?? 'Erreur');
              else { setNewChroniqueTitle(''); setNewChroniqueBody(''); setMsg('Fragment créé.'); void loadChroniques(); }
            });
          }}>Créer</button>
        </div>
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
        <ListPager
          page={chroniquePage}
          total={chroniqueTotal}
          pageSize={ACCUEIL_PAGE_SIZE}
          onPageChange={setChroniquePage}
          label="fragments"
        />
        </>
      ) : null}

      {tab === 'logos' && canLogos ? (
        <>
        <div className="card" style={{ maxWidth: 480, marginBottom: 12 }}>
          <h3>Nouveau logo</h3>
          <div className="field"><label>Nom</label><input value={newLogoName} onChange={(e) => setNewLogoName(e.target.value)} /></div>
          <div className="field"><label>URL image</label><input value={newLogoUrl} onChange={(e) => setNewLogoUrl(e.target.value)} placeholder="https://…" /></div>
          <button type="button" className="btn" disabled={busy} onClick={() => {
            setBusy(true);
            void createLogo(countryCode, { name: newLogoName, logoUrl: newLogoUrl }).then((r) => {
              setBusy(false);
              if (!r.ok) setMsg(r.error ?? 'Erreur');
              else { setNewLogoName(''); setNewLogoUrl(''); setMsg('Logo créé.'); void loadLogos(); }
            });
          }}>Créer</button>
        </div>
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
        </>
      ) : null}
    </section>
  );
}
