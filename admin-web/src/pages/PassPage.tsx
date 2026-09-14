import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminCountry } from '../context/AdminCountryContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatWhen } from '../lib/format';
import {
  HERITAGE_CATALOG_ID,
  INTERMEDIATE_CATALOG_ID,
  PERIOD_LABELS,
  SHOP_PERIOD_VALIDITY_DAYS,
  computeExpiry,
  countActiveGrantsForCatalog,
  grantPass,
  listActiveGrants,
  loadActivationMessages,
  loadPassCatalog,
  loadPassPrices,
  loadShopSettings,
  revokePass,
  saveActivationMessages,
  savePassCatalog,
  savePassPrices,
  saveShopSettings,
  searchGrantTargets,
  type ActiveGrantRow,
  type BillingPeriod,
  type PassActivationMessage,
  type PassCatalogEntry,
  type PassMessageType,
  type PassPriceMap,
  type PassShopSettings,
} from '../lib/pass';

type Tab = 'ops' | 'prices' | 'messages';

function newCatalogDraft(): Omit<PassCatalogEntry, 'id' | 'createdAt' | 'updatedAt' | 'isBuiltin' | 'sortOrder'> {
  return {
    label: '',
    description: '',
    priceGnf: 0,
    validityDays: 30,
    grantableBySuperAdmin: true,
    purchasableInShop: false,
    shopBillingPeriod: null,
    status: 'active',
  };
}

export function PassPage() {
  const { profile } = useAuth();
  const { countryCode, countryLabel } = useAdminCountry();
  const { can } = usePermissions();

  const canOps = can('pass_catalog') || can('pass_management');
  const canPrices = can('pass_prices') || can('pass_management');
  const canMessages = can('pass_messages') || can('pass_management');

  const [tab, setTab] = useState<Tab>(canOps ? 'ops' : canPrices ? 'prices' : 'messages');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [catalog, setCatalog] = useState<PassCatalogEntry[]>([]);
  const [grants, setGrants] = useState<ActiveGrantRow[]>([]);
  const [draft, setDraft] = useState(newCatalogDraft());
  const [editingId, setEditingId] = useState<string | null>(null);

  const [grantCatalogId, setGrantCatalogId] = useState('');
  const [grantQuery, setGrantQuery] = useState('');
  const [grantTargets, setGrantTargets] = useState<{ id: string; email: string; name: string }[]>([]);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantNote, setGrantNote] = useState('');

  const [prices, setPrices] = useState<PassPriceMap | null>(null);
  const [shop, setShop] = useState<PassShopSettings>({ maxPendingPasses: 3 });

  const [messages, setMessages] = useState<PassActivationMessage[]>([]);
  const [msgDraft, setMsgDraft] = useState({
    name: '',
    passType: 'default' as PassMessageType,
    titleTemplate: 'Votre {passLabel} est actif',
    messageTemplate: 'Bonjour {firstName}, votre {passLabel} est maintenant actif. {validity}',
  });

  const reloadOps = useCallback(async () => {
    const [c, g] = await Promise.all([loadPassCatalog(countryCode), listActiveGrants()]);
    setCatalog(c);
    setGrants(g);
    if (!grantCatalogId) {
      const first = c.find((x) => x.status === 'active' && x.id !== INTERMEDIATE_CATALOG_ID);
      if (first) setGrantCatalogId(first.id);
    }
  }, [countryCode, grantCatalogId]);

  const reloadPrices = useCallback(async () => {
    const [p, s] = await Promise.all([loadPassPrices(countryCode), loadShopSettings(countryCode)]);
    setPrices(p);
    setShop(s);
  }, [countryCode]);

  const reloadMessages = useCallback(async () => {
    setMessages(await loadActivationMessages(countryCode));
  }, [countryCode]);

  useEffect(() => {
    setMsg(null);
    if (tab === 'ops') void reloadOps();
    if (tab === 'prices') void reloadPrices();
    if (tab === 'messages') void reloadMessages();
  }, [tab, countryCode, reloadOps, reloadPrices, reloadMessages]);

  useEffect(() => {
    if (grantQuery.trim().length < 2) {
      setGrantTargets([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchGrantTargets(grantQuery, countryCode).then(setGrantTargets);
    }, 250);
    return () => window.clearTimeout(t);
  }, [grantQuery, countryCode]);

  async function persistCatalog(next: PassCatalogEntry[]) {
    setBusy(true);
    const res = await savePassCatalog(countryCode, next);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Erreur catalogue');
      return;
    }
    setCatalog(next);
    setMsg('Catalogue enregistré.');
  }

  async function handleSaveEntry(e: FormEvent) {
    e.preventDefault();
    if (!draft.label.trim()) {
      setMsg('Libellé requis.');
      return;
    }
    const now = new Date().toISOString();
    let next = [...catalog];
    let keepId = editingId;
    if (editingId) {
      next = next.map((c) =>
        c.id === editingId
          ? {
              ...c,
              ...draft,
              label: draft.label.trim(),
              description: draft.description.trim(),
              updatedAt: now,
              purchasableInShop:
                editingId === HERITAGE_CATALOG_ID ? false : draft.purchasableInShop,
            }
          : c,
      );
    } else {
      const created: PassCatalogEntry = {
        ...draft,
        id: `pass-${Date.now()}`,
        label: draft.label.trim(),
        description: draft.description.trim(),
        isBuiltin: false,
        sortOrder: next.length + 2,
        createdAt: now,
        updatedAt: now,
      };
      next.push(created);
      keepId = created.id;
    }
    // Un seul slot shop par période
    if (draft.purchasableInShop && draft.shopBillingPeriod && keepId) {
      next = next.map((c) =>
        c.shopBillingPeriod === draft.shopBillingPeriod && c.id !== keepId
          ? { ...c, purchasableInShop: false, shopBillingPeriod: null }
          : c,
      );
    }
    await persistCatalog(next);
    setEditingId(null);
    setDraft(newCatalogDraft());
  }

  async function setStatus(entry: PassCatalogEntry, status: PassCatalogEntry['status']) {
    if (status !== 'active' && entry.status === 'active') {
      const n = await countActiveGrantsForCatalog(entry.id);
      if (n > 0 && !window.confirm(`${n} PASS actifs sur ce catalogue. Continuer ?`)) return;
    }
    const next = catalog.map((c) =>
      c.id === entry.id ? { ...c, status, updatedAt: new Date().toISOString() } : c,
    );
    await persistCatalog(next);
  }

  async function handleGrant(e: FormEvent) {
    e.preventDefault();
    if (!profile || !grantUserId || !grantCatalogId) {
      setMsg('Choisissez un PASS et un membre.');
      return;
    }
    const entry = catalog.find((c) => c.id === grantCatalogId);
    if (!entry) return;
    setBusy(true);
    const res = await grantPass(entry, grantUserId, profile.id, grantNote);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Octroi impossible');
      return;
    }
    setMsg('PASS octroyé.');
    setGrantNote('');
    setGrantUserId('');
    setGrantQuery('');
    void reloadOps();
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Abonnements</p>
          <h2>Gestion PASS</h2>
          <p className="meta">
            Catalogue, octroi, prix — pays : {countryLabel}.{' '}
            <Link to="/payments">Paiements Djomy →</Link>
          </p>
        </div>
      </header>

      <nav className="tabs">
        {canOps ? (
          <button type="button" className={`tab ${tab === 'ops' ? 'active' : ''}`} onClick={() => setTab('ops')}>
            Catalogue & octroi
          </button>
        ) : null}
        {canPrices ? (
          <button
            type="button"
            className={`tab ${tab === 'prices' ? 'active' : ''}`}
            onClick={() => setTab('prices')}
          >
            Prix
          </button>
        ) : null}
        {canMessages ? (
          <button
            type="button"
            className={`tab ${tab === 'messages' ? 'active' : ''}`}
            onClick={() => setTab('messages')}
          >
            Messages
          </button>
        ) : null}
      </nav>

      {msg ? <p className="muted">{msg}</p> : null}

      {tab === 'ops' && canOps ? (
        <>
          <div className="split-pane">
            <div>
              <h3>Catalogue</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>PASS</th>
                      <th>Prix</th>
                      <th>Validité</th>
                      <th>Statut</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog
                      .filter((c) => c.status !== 'archived')
                      .map((c) => (
                        <tr key={c.id}>
                          <td>
                            <strong>{c.label}</strong>
                            <div className="meta">{c.description}</div>
                            {c.purchasableInShop && c.shopBillingPeriod ? (
                              <div className="meta">Boutique · {PERIOD_LABELS[c.shopBillingPeriod]}</div>
                            ) : null}
                          </td>
                          <td>{c.priceGnf.toLocaleString('fr-FR')}</td>
                          <td>{c.validityDays == null ? 'Illimité' : `${c.validityDays} j`}</td>
                          <td>
                            <span className={`badge ${c.status === 'active' ? 'ok' : 'warn'}`}>
                              {c.status}
                            </span>
                          </td>
                          <td>
                            <div className="edit-actions">
                              <button
                                type="button"
                                className="btn small ghost"
                                onClick={() => {
                                  setEditingId(c.id);
                                  setDraft({
                                    label: c.label,
                                    description: c.description,
                                    priceGnf: c.priceGnf,
                                    validityDays: c.validityDays,
                                    grantableBySuperAdmin: c.grantableBySuperAdmin,
                                    purchasableInShop: c.purchasableInShop,
                                    shopBillingPeriod: c.shopBillingPeriod,
                                    status: c.status,
                                  });
                                }}
                              >
                                Éditer
                              </button>
                              <button
                                type="button"
                                className="btn small ghost"
                                disabled={busy || c.id === INTERMEDIATE_CATALOG_ID}
                                onClick={() =>
                                  void setStatus(c, c.status === 'active' ? 'inactive' : 'active')
                                }
                              >
                                {c.status === 'active' ? 'Désactiver' : 'Activer'}
                              </button>
                              {!c.isBuiltin ? (
                                <button
                                  type="button"
                                  className="btn small ghost"
                                  disabled={busy}
                                  onClick={() => void setStatus(c, 'archived')}
                                >
                                  Archiver
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            <form className="card edit-panel" onSubmit={(e) => void handleSaveEntry(e)}>
              <h3>{editingId ? 'Modifier PASS' : 'Nouveau PASS'}</h3>
              <div className="field">
                <label>Libellé</label>
                <input
                  value={draft.label}
                  onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label>Description</label>
                <input
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Prix</label>
                <input
                  type="number"
                  min={0}
                  value={draft.priceGnf}
                  onChange={(e) => setDraft((d) => ({ ...d, priceGnf: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="field">
                <label>Validité (jours, vide = illimité)</label>
                <input
                  type="number"
                  min={1}
                  value={draft.validityDays ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      validityDays: e.target.value === '' ? null : Number(e.target.value) || null,
                    }))
                  }
                />
              </div>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={draft.purchasableInShop}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      purchasableInShop: e.target.checked,
                      shopBillingPeriod: e.target.checked ? d.shopBillingPeriod ?? 'monthly' : null,
                    }))
                  }
                />
                Vitrine boutique
              </label>
              {draft.purchasableInShop ? (
                <div className="field">
                  <label>Formule boutique</label>
                  <select
                    value={draft.shopBillingPeriod ?? 'monthly'}
                    onChange={(e) => {
                      const period = e.target.value as BillingPeriod;
                      setDraft((d) => ({
                        ...d,
                        shopBillingPeriod: period,
                        validityDays: SHOP_PERIOD_VALIDITY_DAYS[period],
                      }));
                    }}
                  >
                    {(Object.keys(PERIOD_LABELS) as BillingPeriod[]).map((p) => (
                      <option key={p} value={p}>
                        {PERIOD_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="edit-actions">
                <button className="btn" type="submit" disabled={busy}>
                  {editingId ? 'Enregistrer' : 'Créer'}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    className="btn ghost small"
                    onClick={() => {
                      setEditingId(null);
                      setDraft(newCatalogDraft());
                    }}
                  >
                    Annuler
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          <h3 style={{ marginTop: 28 }}>Octroyer un PASS</h3>
          <form className="card" onSubmit={(e) => void handleGrant(e)} style={{ maxWidth: 560 }}>
            <div className="field">
              <label>PASS catalogue</label>
              <select value={grantCatalogId} onChange={(e) => setGrantCatalogId(e.target.value)}>
                {catalog
                  .filter((c) => c.status === 'active' && c.id !== INTERMEDIATE_CATALOG_ID)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <label>Rechercher un membre</label>
              <input
                value={grantQuery}
                onChange={(e) => setGrantQuery(e.target.value)}
                placeholder="E-mail ou nom…"
              />
            </div>
            {grantTargets.length > 0 ? (
              <div className="target-list">
                {grantTargets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`target-chip${grantUserId === t.id ? ' active' : ''}`}
                    onClick={() => setGrantUserId(t.id)}
                  >
                    {t.name} · {t.email}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="field">
              <label>Note (optionnel)</label>
              <input value={grantNote} onChange={(e) => setGrantNote(e.target.value)} />
            </div>
            <button className="btn" type="submit" disabled={busy || !grantUserId}>
              Accorder
            </button>
          </form>

          <h3 style={{ marginTop: 28 }}>PASS actifs octroyés</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Membre</th>
                  <th>PASS</th>
                  <th>Début</th>
                  <th>Fin</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {grants.map((g) => (
                  <tr key={`${g.userId}-${g.localId}`}>
                    <td>
                      <strong>{g.userName}</strong>
                      <div className="meta">{g.userEmail}</div>
                    </td>
                    <td>
                      {g.label}
                      {g.grantNote ? <div className="meta">{g.grantNote}</div> : null}
                    </td>
                    <td>{formatWhen(g.startedAt)}</td>
                    <td>{g.expiresAt ? formatWhen(g.expiresAt) : 'Illimité'}</td>
                    <td>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm('Retirer ce PASS ?')) return;
                          void revokePass(g.userId, g.localId).then((r) => {
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else {
                              setMsg('PASS retiré.');
                              void reloadOps();
                            }
                          });
                        }}
                      >
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {grants.length === 0 ? (
              <p className="muted" style={{ padding: 16 }}>
                Aucun PASS actif.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === 'prices' && canPrices && prices ? (
        <form
          className="card"
          style={{ maxWidth: 480 }}
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              setBusy(true);
              const a = await savePassPrices(countryCode, prices);
              const b = await saveShopSettings(countryCode, shop);
              setBusy(false);
              setMsg(a.ok && b.ok ? 'Prix enregistrés.' : a.error ?? b.error ?? 'Erreur');
            })();
          }}
        >
          <h3>Tarifs boutique ({countryLabel})</h3>
          {(Object.keys(PERIOD_LABELS) as BillingPeriod[]).map((p) => (
            <div className="field" key={p}>
              <label>{PERIOD_LABELS[p]}</label>
              <input
                type="number"
                min={1}
                value={prices[p]}
                onChange={(e) =>
                  setPrices((prev) =>
                    prev ? { ...prev, [p]: Number(e.target.value) || prev[p] } : prev,
                  )
                }
              />
            </div>
          ))}
          <div className="field">
            <label>File d’attente max (PASS pending)</label>
            <input
              type="number"
              min={0}
              max={20}
              value={shop.maxPendingPasses}
              onChange={(e) =>
                setShop({ maxPendingPasses: Math.min(20, Math.max(0, Number(e.target.value) || 0)) })
              }
            />
          </div>
          <p className="meta">
            Exemple échéance mensuelle : {formatWhen(computeExpiry(30))}
          </p>
          <button className="btn" type="submit" disabled={busy}>
            Enregistrer
          </button>
        </form>
      ) : null}

      {tab === 'messages' && canMessages ? (
        <>
          <form
            className="card"
            style={{ maxWidth: 560, marginBottom: 16 }}
            onSubmit={(e) => {
              e.preventDefault();
              const now = new Date().toISOString();
              const next: PassActivationMessage[] = [
                ...messages,
                {
                  id: `msg-${Date.now()}`,
                  ...msgDraft,
                  name: msgDraft.name.trim() || `Message ${msgDraft.passType}`,
                  status: 'active',
                  createdAt: now,
                  updatedAt: now,
                },
              ];
              void saveActivationMessages(countryCode, next).then((r) => {
                if (!r.ok) setMsg(r.error ?? 'Erreur');
                else {
                  setMessages(next);
                  setMsg('Message ajouté.');
                  setMsgDraft((d) => ({ ...d, name: '' }));
                }
              });
            }}
          >
            <h3>Nouveau modèle</h3>
            <div className="field">
              <label>Nom</label>
              <input
                value={msgDraft.name}
                onChange={(e) => setMsgDraft((d) => ({ ...d, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Type</label>
              <select
                value={msgDraft.passType}
                onChange={(e) =>
                  setMsgDraft((d) => ({ ...d, passType: e.target.value as PassMessageType }))
                }
              >
                {(['default', 'heritage', 'monthly', 'quarterly', 'annual', 'lifetime', 'referral'] as PassMessageType[]).map(
                  (t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="field">
              <label>Titre</label>
              <input
                value={msgDraft.titleTemplate}
                onChange={(e) => setMsgDraft((d) => ({ ...d, titleTemplate: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Message</label>
              <textarea
                rows={3}
                value={msgDraft.messageTemplate}
                onChange={(e) => setMsgDraft((d) => ({ ...d, messageTemplate: e.target.value }))}
              />
            </div>
            <p className="meta">Variables : {'{firstName}'} {'{passLabel}'} {'{passType}'} {'{validity}'}</p>
            <button className="btn" type="submit">
              Ajouter
            </button>
          </form>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Type</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {messages
                  .filter((m) => m.status !== 'archived')
                  .map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.name}</strong>
                        <div className="meta">{m.titleTemplate}</div>
                      </td>
                      <td>{m.passType}</td>
                      <td>
                        <span className={`badge ${m.status === 'active' ? 'ok' : 'warn'}`}>
                          {m.status}
                        </span>
                      </td>
                      <td>
                        <div className="edit-actions">
                          <button
                            type="button"
                            className="btn small ghost"
                            onClick={() => {
                              const next: PassActivationMessage[] = messages.map((x) =>
                                x.id === m.id
                                  ? {
                                      ...x,
                                      status: x.status === 'active' ? ('inactive' as const) : ('active' as const),
                                      updatedAt: new Date().toISOString(),
                                    }
                                  : x,
                              );
                              void saveActivationMessages(countryCode, next).then(() => setMessages(next));
                            }}
                          >
                            {m.status === 'active' ? 'Désactiver' : 'Activer'}
                          </button>
                          <button
                            type="button"
                            className="btn small ghost"
                            onClick={() => {
                              const next = messages.map((x) =>
                                x.id === m.id
                                  ? { ...x, status: 'archived' as const, updatedAt: new Date().toISOString() }
                                  : x,
                              );
                              void saveActivationMessages(countryCode, next).then(() => setMessages(next));
                            }}
                          >
                            Archiver
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
    </section>
  );
}
