import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdminCountry } from '../context/AdminCountryContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatWhen } from '../lib/format';
import {
  OFFER_STATUS_LABELS,
  deleteOffer,
  getCatalogUsageStats,
  listBenefitCatalog,
  listPartnerOffers,
  listRecentGrants,
  revokeGrant,
  setBenefitCatalogActive,
  setOfferStatus,
  type BenefitCatalogRow,
  type CatalogUsageStat,
  type GrantRow,
  type PartnerOfferRow,
} from '../lib/privileges';

type Tab = 'validations' | 'catalog' | 'suivi' | 'grants';

export function PrivilegesPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();

  const canValidations = can('prime_benefits_validations') || can('prime_benefits');
  const canCatalog = can('prime_benefits_catalog') || can('prime_benefits');
  const canSuivi = can('prime_benefits_suivi') || can('prime_benefits');
  const canGrants = can('prime_benefits_grant') || can('prime_benefits');

  const defaultTab: Tab = canValidations
    ? 'validations'
    : canCatalog
      ? 'catalog'
      : canSuivi
        ? 'suivi'
        : 'grants';

  const tabParam = params.get('tab');
  const tab: Tab =
    tabParam === 'validations' || tabParam === 'catalog' || tabParam === 'suivi' || tabParam === 'grants'
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
  const [offers, setOffers] = useState<PartnerOfferRow[]>([]);
  const [catalog, setCatalog] = useState<BenefitCatalogRow[]>([]);
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [stats, setStats] = useState<CatalogUsageStat[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);

  const loadOffers = useCallback(async () => {
    const res = await listPartnerOffers(countryCode);
    setOffers(res.items);
    if (res.error) setMsg(res.error);
  }, [countryCode]);

  const loadCatalog = useCallback(async () => {
    const res = await listBenefitCatalog(countryCode);
    setCatalog(res.items);
    if (res.error) setMsg(res.error);
  }, [countryCode]);

  const loadSuivi = useCallback(async () => {
    setStats(await getCatalogUsageStats(countryCode));
  }, [countryCode]);

  const loadGrants = useCallback(async () => {
    const res = await listRecentGrants(countryCode);
    setGrants(res.items);
    if (res.error) setMsg(res.error);
  }, [countryCode]);

  useEffect(() => {
    setMsg(null);
    if (tab === 'validations' && canValidations) void loadOffers();
    if (tab === 'catalog' && canCatalog) void loadCatalog();
    if (tab === 'suivi' && canSuivi) void loadSuivi();
    if (tab === 'grants' && canGrants) void loadGrants();
  }, [
    tab,
    canValidations,
    canCatalog,
    canSuivi,
    canGrants,
    loadOffers,
    loadCatalog,
    loadSuivi,
    loadGrants,
  ]);

  const filteredCatalog = useMemo(
    () =>
      catalog.filter((c) => {
        if (catalogFilter === 'active') return c.isActive;
        if (catalogFilter === 'inactive') return !c.isActive;
        return true;
      }),
    [catalog, catalogFilter],
  );

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Avantages membres</p>
          <h2>Privilèges</h2>
          <p className="meta">
            Validations partenaires, catalogue et octrois — pays : {countryLabel}.
          </p>
        </div>
      </header>

      <nav className="tabs">
        {canValidations ? (
          <button
            type="button"
            className={`tab ${tab === 'validations' ? 'active' : ''}`}
            onClick={() => setTab('validations')}
          >
            Validations
          </button>
        ) : null}
        {canCatalog ? (
          <button
            type="button"
            className={`tab ${tab === 'catalog' ? 'active' : ''}`}
            onClick={() => setTab('catalog')}
          >
            Catalogue
          </button>
        ) : null}
        {canSuivi ? (
          <button
            type="button"
            className={`tab ${tab === 'suivi' ? 'active' : ''}`}
            onClick={() => setTab('suivi')}
          >
            Suivi
          </button>
        ) : null}
        {canGrants ? (
          <button
            type="button"
            className={`tab ${tab === 'grants' ? 'active' : ''}`}
            onClick={() => setTab('grants')}
          >
            Octrois
          </button>
        ) : null}
      </nav>

      {msg ? <p className="muted">{msg}</p> : null}

      {tab === 'validations' && canValidations ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Offre</th>
                <th>Partenaire</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.catalogTitle}</strong>
                    <div className="meta">{formatWhen(o.createdAt)}</div>
                  </td>
                  <td>{o.partnerName}</td>
                  <td>
                    <span
                      className={`badge ${
                        o.status === 'accepted' || o.status === 'auto_accepted'
                          ? 'ok'
                          : o.status === 'declined' || o.status === 'disabled'
                            ? 'err'
                            : 'warn'
                      }`}
                    >
                      {OFFER_STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </td>
                  <td>
                    <div className="edit-actions" style={{ marginTop: 0 }}>
                      {(o.status === 'declined' || o.status === 'disabled') && (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            void setOfferStatus(o, 'pending').then((r) => {
                              setBusy(false);
                              if (!r.ok) setMsg(r.error ?? 'Erreur');
                              else {
                                setMsg('Demande renvoyée.');
                                void loadOffers();
                              }
                            });
                          }}
                        >
                          Relancer
                        </button>
                      )}
                      {o.status !== 'disabled' ? (
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            void setOfferStatus(o, 'disabled').then((r) => {
                              setBusy(false);
                              if (!r.ok) setMsg(r.error ?? 'Erreur');
                              else {
                                setMsg('Offre archivée.');
                                void loadOffers();
                              }
                            });
                          }}
                        >
                          Archiver
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm('Supprimer cette demande ?')) return;
                          setBusy(true);
                          void deleteOffer(o.id).then((r) => {
                            setBusy(false);
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadOffers();
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
          {offers.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              Aucune validation partenaire.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'catalog' && canCatalog ? (
        <>
          <div className="tabs" style={{ marginBottom: 12 }}>
            {(['all', 'active', 'inactive'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`tab ${catalogFilter === f ? 'active' : ''}`}
                onClick={() => setCatalogFilter(f)}
              >
                {f === 'all' ? 'Tous' : f === 'active' ? 'Actifs' : 'Inactifs'}
              </button>
            ))}
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Catalogue</th>
                  <th>Partenaires</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredCatalog.map((c) => (
                  <tr key={c.localId}>
                    <td>
                      <strong>{c.title}</strong>
                      <div className="meta">{c.benefitKind}</div>
                    </td>
                    <td className="meta">{c.partnerNames.join(' · ') || '—'}</td>
                    <td>
                      <span className={`badge ${c.isActive ? 'ok' : 'warn'}`}>
                        {c.isActive ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void setBenefitCatalogActive(c.localId, !c.isActive).then((r) => {
                            setBusy(false);
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadCatalog();
                          });
                        }}
                      >
                        {c.isActive ? 'Désactiver' : 'Activer'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredCatalog.length === 0 ? (
              <p className="muted" style={{ padding: 16 }}>
                Catalogue vide. Création riche encore sur mobile.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === 'suivi' && canSuivi ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Catalogue</th>
                <th>Octroyés</th>
                <th>Utilisés</th>
                <th>En cours</th>
                <th>Actif</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((s) => (
                <tr key={s.catalogId}>
                  <td>
                    <strong>{s.title}</strong>
                  </td>
                  <td>{s.granted}</td>
                  <td>{s.used}</td>
                  <td>{s.unusedAssigned}</td>
                  <td>
                    <span className={`badge ${s.isActive ? 'ok' : 'warn'}`}>
                      {s.isActive ? 'Oui' : 'Non'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {stats.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              Aucune statistique.
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === 'grants' && canGrants ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Privilège</th>
                <th>Membre</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.localId}>
                  <td>
                    <strong>{g.title}</strong>
                    <div className="meta">{formatWhen(g.createdAt)}</div>
                  </td>
                  <td className="meta">{g.userId.slice(0, 8)}…</td>
                  <td>
                    <span
                      className={`badge ${
                        g.status === 'used'
                          ? 'ok'
                          : g.status === 'expired_unused'
                            ? 'err'
                            : 'warn'
                      }`}
                    >
                      {g.status}
                    </span>
                  </td>
                  <td>
                    {g.status !== 'used' && g.status !== 'expired_unused' ? (
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm('Révoquer cet octroi ?')) return;
                          setBusy(true);
                          void revokeGrant(g.localId).then((r) => {
                            setBusy(false);
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else {
                              setMsg('Octroi révoqué.');
                              void loadGrants();
                            }
                          });
                        }}
                      >
                        Révoquer
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {grants.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              Aucun octroi récent. Campagnes d’octroi encore sur mobile.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

