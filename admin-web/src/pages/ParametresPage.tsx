import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAdminCountry } from '../context/AdminCountryContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionsContext';
import { isSuperAdminUser } from '../lib/permissions';
import { COUNTRY_OPTIONS } from '../lib/countries';
import { formatWhen } from '../lib/format';
import { PermissionGroupEditor } from '../components/PermissionGroupEditor';
import {
  CATEGORY_KIND_LABELS,
  DEFAULT_APP_GATES,
  LEGAL_DOCS,
  listAdminUsersLite,
  listCategories,
  loadAppGates,
  loadDefaultPermissions,
  loadEnabledCountries,
  loadLegalDoc,
  loadSuggestionButton,
  loadUserPermissions,
  saveAppGates,
  saveDefaultPermissions,
  saveEnabledCountries,
  saveLegalDoc,
  saveSuggestionButton,
  saveUserPermissionOverrides,
  setCategoryActive,
  updateCategoryLabel,
  type AdminUserLite,
  type AppGates,
  type CategoryKind,
  type CategoryRow,
  type LegalDoc,
  type LegalKey,
} from '../lib/settings';
import type { AdminPermissionId } from '../lib/permissions';
import { loadReferralSettings, saveReferralSettings, type ReferralSettings } from '../lib/referral';

type Tab = 'gates' | 'countries' | 'categories' | 'permissions' | 'legal' | 'referral' | 'more';

export function ParametresPage() {
  const { refreshEnabledCountries } = useAdminCountry();
  const { profile } = useAuth();
  const { can } = usePermissions();
  const isSuper = isSuperAdminUser(profile?.role);
  const [params, setParams] = useSearchParams();

  const canGates = can('manage_admins');
  const canCountries = can('content_countries') || can('manage_admins');
  const canCategories = can('categories') || can('manage_admins');
  const canPermissions = (can('admin_permissions') || can('manage_admins')) && isSuper;
  const canLegal = can('legal') || can('manage_admins');
  const canReferral = isSuper || can('manage_admins');

  const defaultTab: Tab = canGates
    ? 'gates'
    : canCountries
      ? 'countries'
      : canCategories
        ? 'categories'
        : canLegal
          ? 'legal'
          : 'more';

  const tabParam = params.get('tab');
  const tab: Tab =
    tabParam === 'gates' ||
    tabParam === 'countries' ||
    tabParam === 'categories' ||
    tabParam === 'permissions' ||
    tabParam === 'legal' ||
    tabParam === 'referral' ||
    tabParam === 'more'
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

  const [gates, setGates] = useState<AppGates>(DEFAULT_APP_GATES);
  const [suggestion, setSuggestion] = useState(true);

  const [countries, setCountries] = useState<string[]>(['GN']);

  const [catKind, setCatKind] = useState<CategoryKind | 'all'>('event');
  const [categories, setCategories] = useState<CategoryRow[]>([]);

  const [defaultPerms, setDefaultPerms] = useState<AdminPermissionId[]>([]);
  const [admins, setAdmins] = useState<AdminUserLite[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState<string>('');
  const [userPerms, setUserPerms] = useState<AdminPermissionId[]>([]);

  const [legalKey, setLegalKey] = useState<LegalKey>('cgu');
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);

  const [referral, setReferral] = useState<ReferralSettings | null>(null);
  const [referralsPerReward, setReferralsPerReward] = useState('10');
  const [rewardMonths, setRewardMonths] = useState('1');
  const [maxRewardMonthsPerYear, setMaxRewardMonthsPerYear] = useState('5');

  const loadGates = useCallback(async () => {
    const [g, s] = await Promise.all([loadAppGates(), loadSuggestionButton()]);
    setGates(g);
    setSuggestion(s);
  }, []);

  const loadCountries = useCallback(async () => {
    setCountries(await loadEnabledCountries());
  }, []);

  const loadCats = useCallback(async () => {
    const kind = catKind === 'all' ? undefined : catKind;
    const res = await listCategories(kind);
    setCategories(res.items);
    if (res.error) setMsg(res.error);
  }, [catKind]);

  const loadPerms = useCallback(async () => {
    const [defs, list] = await Promise.all([loadDefaultPermissions(), listAdminUsersLite()]);
    setDefaultPerms(defs);
    setAdmins(list.filter((a) => a.role === 'admin'));
  }, []);

  const loadLegal = useCallback(async () => {
    setLegalDoc(await loadLegalDoc(legalKey));
  }, [legalKey]);

  const loadReferral = useCallback(async () => {
    const { settings, error } = await loadReferralSettings();
    setReferral(settings);
    setReferralsPerReward(String(settings.referralsPerReward));
    setRewardMonths(String(settings.rewardMonths));
    setMaxRewardMonthsPerYear(String(settings.maxRewardMonthsPerYear));
    if (error) setMsg(error);
  }, []);

  useEffect(() => {
    setMsg(null);
    if (tab === 'gates' && canGates) void loadGates();
    if (tab === 'countries' && canCountries) void loadCountries();
    if (tab === 'categories' && canCategories) void loadCats();
    if (tab === 'permissions' && canPermissions) void loadPerms();
    if (tab === 'legal' && canLegal) void loadLegal();
    if (tab === 'referral' && canReferral) void loadReferral();
  }, [
    tab,
    canGates,
    canCountries,
    canCategories,
    canPermissions,
    canLegal,
    canReferral,
    loadGates,
    loadCountries,
    loadCats,
    loadPerms,
    loadLegal,
    loadReferral,
  ]);

  useEffect(() => {
    if (!selectedAdmin) {
      setUserPerms([]);
      return;
    }
    void loadUserPermissions(selectedAdmin).then(setUserPerms);
  }, [selectedAdmin]);

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Plateforme</p>
          <h2>Paramètres</h2>
          <p className="meta">Gates, pays, catégories, droits et légal.</p>
        </div>
      </header>

      <nav className="tabs">
        {canGates ? (
          <button type="button" className={`tab ${tab === 'gates' ? 'active' : ''}`} onClick={() => setTab('gates')}>
            Gates
          </button>
        ) : null}
        {canCountries ? (
          <button
            type="button"
            className={`tab ${tab === 'countries' ? 'active' : ''}`}
            onClick={() => setTab('countries')}
          >
            Pays
          </button>
        ) : null}
        {canCategories ? (
          <button
            type="button"
            className={`tab ${tab === 'categories' ? 'active' : ''}`}
            onClick={() => setTab('categories')}
          >
            Catégories
          </button>
        ) : null}
        {canPermissions ? (
          <button
            type="button"
            className={`tab ${tab === 'permissions' ? 'active' : ''}`}
            onClick={() => setTab('permissions')}
          >
            Permissions
          </button>
        ) : null}
        {canLegal ? (
          <button type="button" className={`tab ${tab === 'legal' ? 'active' : ''}`} onClick={() => setTab('legal')}>
            Légal
          </button>
        ) : null}
        {canReferral ? (
          <button
            type="button"
            className={`tab ${tab === 'referral' ? 'active' : ''}`}
            onClick={() => setTab('referral')}
          >
            Parrainage
          </button>
        ) : null}
        <button type="button" className={`tab ${tab === 'more' ? 'active' : ''}`} onClick={() => setTab('more')}>
          Plus
        </button>
      </nav>

      {msg ? <p className="muted">{msg}</p> : null}

      {tab === 'gates' && canGates ? (
        <div className="card" style={{ maxWidth: 560 }}>
          <h3>Kill-switches & lancement</h3>
          <label className="check-inline" style={{ display: 'flex', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={suggestion}
              onChange={(e) => setSuggestion(e.target.checked)}
            />
            Bouton « Suggestion » visible
          </label>
          <label className="check-inline" style={{ display: 'flex', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={gates.signupEnabled}
              onChange={(e) => setGates((g) => ({ ...g, signupEnabled: e.target.checked }))}
            />
            Inscription ouverte
          </label>
          <label className="check-inline" style={{ display: 'flex', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={gates.passPurchaseEnabled}
              onChange={(e) => setGates((g) => ({ ...g, passPurchaseEnabled: e.target.checked }))}
            />
            Achat PASS activé
          </label>
          <label className="check-inline" style={{ display: 'flex', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={gates.privilegesVisible}
              onChange={(e) => setGates((g) => ({ ...g, privilegesVisible: e.target.checked }))}
            />
            Privilèges visibles sur les fiches (indépendant de l’achat PASS)
          </label>

          <h4>Avant-lancement</h4>
          <label className="check-inline" style={{ display: 'flex', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={gates.prelaunch.enabled}
              onChange={(e) =>
                setGates((g) => ({
                  ...g,
                  prelaunch: { ...g.prelaunch, enabled: e.target.checked },
                }))
              }
            />
            Écran avant-lancement
          </label>
          <div className="field">
            <label>Titre</label>
            <input
              value={gates.prelaunch.title}
              onChange={(e) =>
                setGates((g) => ({ ...g, prelaunch: { ...g.prelaunch, title: e.target.value } }))
              }
            />
          </div>
          <div className="field">
            <label>Message</label>
            <textarea
              rows={2}
              value={gates.prelaunch.message}
              onChange={(e) =>
                setGates((g) => ({ ...g, prelaunch: { ...g.prelaunch, message: e.target.value } }))
              }
            />
          </div>

          {isSuper ? (
            <>
              <h4>Maintenance</h4>
              <label className="check-inline" style={{ display: 'flex', marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={gates.maintenance.enabled}
                  onChange={(e) =>
                    setGates((g) => ({
                      ...g,
                      maintenance: { ...g.maintenance, enabled: e.target.checked },
                    }))
                  }
                />
                Mode maintenance
              </label>
              <div className="field">
                <label>Titre</label>
                <input
                  value={gates.maintenance.title}
                  onChange={(e) =>
                    setGates((g) => ({
                      ...g,
                      maintenance: { ...g.maintenance, title: e.target.value },
                    }))
                  }
                />
              </div>
              <div className="field">
                <label>Message</label>
                <textarea
                  rows={2}
                  value={gates.maintenance.message}
                  onChange={(e) =>
                    setGates((g) => ({
                      ...g,
                      maintenance: { ...g.maintenance, message: e.target.value },
                    }))
                  }
                />
              </div>
            </>
          ) : null}

          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void (async () => {
                const a = await saveAppGates(gates);
                const b = await saveSuggestionButton(suggestion);
                setBusy(false);
                setMsg(a.ok && b.ok ? 'Gates enregistrés.' : a.error ?? b.error ?? 'Erreur');
              })();
            }}
          >
            Enregistrer
          </button>
        </div>
      ) : null}

      {tab === 'countries' && canCountries ? (
        <div className="card" style={{ maxWidth: 480 }}>
          <h3>Pays du contenu</h3>
          <p className="meta">Pays actifs pour le catalogue et le filtre admin.</p>
          {COUNTRY_OPTIONS.map((c) => (
            <label key={c.code} className="check-inline" style={{ display: 'flex', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={countries.includes(c.code)}
                onChange={(e) => {
                  setCountries((prev) => {
                    if (e.target.checked) return [...new Set([...prev, c.code])];
                    const next = prev.filter((x) => x !== c.code);
                    return next.length ? next : ['GN'];
                  });
                }}
              />
              {c.label} ({c.code})
            </label>
          ))}
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void saveEnabledCountries(countries).then(async (r) => {
                setBusy(false);
                setMsg(r.ok ? 'Pays enregistrés.' : r.error ?? 'Erreur');
                if (r.ok) await refreshEnabledCountries();
              });
            }}
          >
            Enregistrer
          </button>
        </div>
      ) : null}

      {tab === 'categories' && canCategories ? (
        <>
          <div className="tabs" style={{ marginBottom: 12 }}>
            {(['event', 'spot', 'tool'] as CategoryKind[]).map((k) => (
              <button
                key={k}
                type="button"
                className={`tab ${catKind === k ? 'active' : ''}`}
                onClick={() => setCatKind(k)}
              >
                {CATEGORY_KIND_LABELS[k]}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Catégorie</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={`${c.kind}-${c.slug}`}>
                    <td>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          style={{ width: 48 }}
                          value={c.emoji}
                          onChange={(e) =>
                            setCategories((prev) =>
                              prev.map((x) =>
                                x.slug === c.slug && x.kind === c.kind
                                  ? { ...x, emoji: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                        <input
                          value={c.label}
                          onChange={(e) =>
                            setCategories((prev) =>
                              prev.map((x) =>
                                x.slug === c.slug && x.kind === c.kind
                                  ? { ...x, label: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="meta">{c.slug}</div>
                    </td>
                    <td>
                      <span className={`badge ${c.isActive ? 'ok' : 'warn'}`}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="edit-actions" style={{ marginTop: 0 }}>
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            void updateCategoryLabel(c.kind, c.slug, c.label, c.emoji).then((r) => {
                              setBusy(false);
                              if (!r.ok) setMsg(r.error ?? 'Erreur');
                              else setMsg('Catégorie mise à jour.');
                            });
                          }}
                        >
                          Sauver
                        </button>
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            void setCategoryActive(c.kind, c.slug, !c.isActive).then((r) => {
                              setBusy(false);
                              if (!r.ok) setMsg(r.error ?? 'Erreur');
                              else void loadCats();
                            });
                          }}
                        >
                          {c.isActive ? 'Désactiver' : 'Activer'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === 'permissions' && canPermissions ? (
        <div className="split-pane form-list-stack">
          <div className="card">
            <h3>Droits par défaut (admins délégués)</h3>
            <PermissionGroupEditor value={defaultPerms} onChange={setDefaultPerms} />
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void saveDefaultPermissions(defaultPerms).then((r) => {
                  setBusy(false);
                  setMsg(r.ok ? 'Defaults enregistrés.' : r.error ?? 'Erreur');
                });
              }}
            >
              Enregistrer defaults
            </button>
          </div>

          <div className="card">
            <h3>Overrides par admin</h3>
            <div className="field">
              <label>Admin</label>
              <select value={selectedAdmin} onChange={(e) => setSelectedAdmin(e.target.value)}>
                <option value="">Choisir…</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.email}
                  </option>
                ))}
              </select>
            </div>
            {selectedAdmin ? (
              <>
                <PermissionGroupEditor value={userPerms} onChange={setUserPerms} />
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void saveUserPermissionOverrides(selectedAdmin, defaultPerms, userPerms).then(
                      (r) => {
                        setBusy(false);
                        setMsg(r.ok ? 'Overrides enregistrés.' : r.error ?? 'Erreur');
                      },
                    );
                  }}
                >
                  Enregistrer overrides
                </button>
              </>
            ) : (
              <p className="muted">Sélectionnez un admin.</p>
            )}
          </div>
        </div>
      ) : null}

      {tab === 'referral' && canReferral ? (
        <div className="card" style={{ maxWidth: 560 }}>
          <h3>Parrainage</h3>
          <p className="meta" style={{ marginBottom: 16 }}>
            Récompenses membres — filleuls validés et mois Prime offerts (PASS Parrainage à l’octroi).
          </p>
          {referral ? (
            <p className="meta" style={{ marginBottom: 12 }}>
              Dernière mise à jour : {formatWhen(referral.updatedAt)}
            </p>
          ) : null}
          <div className="field">
            <label>Filleuls par récompense</label>
            <input
              type="number"
              min={1}
              value={referralsPerReward}
              onChange={(e) => setReferralsPerReward(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Mois Prime offerts (par palier)</label>
            <input
              type="number"
              min={1}
              value={rewardMonths}
              onChange={(e) => setRewardMonths(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Plafond mois offerts / an</label>
            <input
              type="number"
              min={1}
              value={maxRewardMonthsPerYear}
              onChange={(e) => setMaxRewardMonthsPerYear(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              const per = Number.parseInt(referralsPerReward.trim(), 10);
              const months = Number.parseInt(rewardMonths.trim(), 10);
              const maxYear = Number.parseInt(maxRewardMonthsPerYear.trim(), 10);
              if (!Number.isFinite(per) || per <= 0 || !Number.isFinite(months) || months <= 0 || !Number.isFinite(maxYear) || maxYear <= 0) {
                setMsg('Saisissez des nombres entiers strictement positifs.');
                return;
              }
              setBusy(true);
              void saveReferralSettings({
                referralsPerReward: per,
                rewardMonths: months,
                maxRewardMonthsPerYear: maxYear,
              }).then((r) => {
                setBusy(false);
                if (!r.ok) {
                  setMsg(r.error ?? 'Enregistrement impossible.');
                  return;
                }
                setMsg(
                  `Enregistré — ${per} filleul${per > 1 ? 's' : ''} → ${months} mois · plafond ${maxYear} mois/an.`,
                );
                if (r.settings) setReferral(r.settings);
                void loadReferral();
              });
            }}
          >
            Enregistrer
          </button>
        </div>
      ) : null}

      {tab === 'legal' && canLegal && legalDoc ? (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="tabs" style={{ marginBottom: 12 }}>
            {LEGAL_DOCS.map((d) => (
              <button
                key={d.key}
                type="button"
                className={`tab ${legalKey === d.key ? 'active' : ''}`}
                onClick={() => setLegalKey(d.key)}
              >
                {d.title.split(' ')[0]}
              </button>
            ))}
          </div>
          <div className="field">
            <label>Titre</label>
            <input
              value={legalDoc.title}
              onChange={(e) => setLegalDoc({ ...legalDoc, title: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Corps</label>
            <textarea
              rows={14}
              value={legalDoc.body}
              onChange={(e) => setLegalDoc({ ...legalDoc, body: e.target.value })}
            />
          </div>
          <p className="meta">Mis à jour : {formatWhen(legalDoc.updatedAt)}</p>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void saveLegalDoc(legalKey, legalDoc.title, legalDoc.body).then((r) => {
                setBusy(false);
                setMsg(r.ok ? 'Document enregistré.' : r.error ?? 'Erreur');
                if (r.ok) void loadLegal();
              });
            }}
          >
            Enregistrer
          </button>
        </div>
      ) : null}

      {tab === 'more' ? (
        <div className="card">
          <h3>Modules Paramètres</h3>
          <p className="meta" style={{ marginBottom: 12 }}>
            Hub Control Tower — mêmes entrées que le mobile.
          </p>
          <div className="kpi-grid">
            <Link className="card kpi-card" to="/notifications">
              <div className="meta">🔔 Notifications</div>
              <strong>Push</strong>
            </Link>
            <Link className="card kpi-card" to="/automation">
              <div className="meta">⚡ Automatisations</div>
              <strong>Jobs</strong>
            </Link>
            <Link className="card kpi-card" to="/milestones">
              <div className="meta">🏅 Paliers</div>
              <strong>Partenaires</strong>
            </Link>
            <Link className="card kpi-card" to="/etoiles">
              <div className="meta">⭐ Étoiles</div>
              <strong>Spots</strong>
            </Link>
            <Link className="card kpi-card" to="/horaires">
              <div className="meta">🕒 Horaires</div>
              <strong>Presets</strong>
            </Link>
            <Link className="card kpi-card" to="/payments">
              <div className="meta">💳 Paiements</div>
              <strong>Djomy</strong>
            </Link>
            <Link className="card kpi-card" to="/pass">
              <div className="meta">🎫 PASS</div>
              <strong>Catalogue</strong>
            </Link>
            <Link className="card kpi-card" to="/onglets">
              <div className="meta">📱 Onglets</div>
              <strong>App</strong>
            </Link>
            <Link className="card kpi-card" to="/types-privileges">
              <div className="meta">🏷️ Types</div>
              <strong>Privilèges</strong>
            </Link>
            <Link className="card kpi-card" to="/privilege-standalone">
              <div className="meta">✨ Standalone</div>
              <strong>THE LOOP</strong>
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
