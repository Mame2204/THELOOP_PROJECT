import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminCountry } from '../context/AdminCountryContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatWhen } from '../lib/format';
import {
  formatOfferingScope,
  listPartnerContentOptions,
  listPartnerOfferingAccounts,
  offeringFromPartnerAndContent,
  offeringIdentityKey,
  type PartnerAccountRow,
  type PartnerContentOptionRow,
} from '../lib/privilege-partners';
import {
  buildRoleAssociations,
  catalogHasPendingOffers,
  createCatalogAssociation,
  deleteBenefitCatalogItem,
  deleteOffer,
  getIndividualUsageStats,
  getRoleBenefitEntitlements,
  GRANT_ROLE_TARGETS,
  grantRoleBenefitEntitlements,
  listAssociatedCatalog,
  listBenefitCatalog,
  listGrantableCatalog,
  listPartnerOffers,
  listRecentGrants,
  listStandaloneBenefits,
  listValidationOffers,
  OFFER_STATUS_LABELS,
  proposeCatalogBenefitsToPartners,
  removeRoleAssociation,
  resendPartnerBenefitOffer,
  revokeGrant,
  setBenefitCatalogActive,
  setOfferStatus,
  updateBenefitCatalogItem,
  type BenefitCatalogRow,
  type BenefitOfferingPartner,
  type CatalogUsageStat,
  type GrantRoleTarget,
  type GrantRow,
  type PartnerOfferRow,
  type RoleAssociationRow,
  type RoleEntitlementKind,
} from '../lib/privileges';

type MainTab = 'creation' | 'catalog' | 'suivi' | 'grant';
type CreationSection = 'create' | 'validations';

export function PrivilegesPage() {
  const { profile } = useAuth();
  const { countryCode, countryLabel } = useAdminCountry();
  const { canSub } = usePermissions();
  const [params, setParams] = useSearchParams();

  const canCreation = canSub('prime_benefits', 'prime_benefits_creation');
  const canValidations = canSub('prime_benefits', 'prime_benefits_validations');
  const canCatalog = canSub('prime_benefits', 'prime_benefits_catalog');
  const canSuivi = canSub('prime_benefits', 'prime_benefits_suivi');
  const canGrants = canSub('prime_benefits', 'prime_benefits_grant');

  const defaultTab: MainTab = canCreation
    ? 'creation'
    : canCatalog
      ? 'catalog'
      : canSuivi
        ? 'suivi'
        : 'grant';

  const tabParam = params.get('tab');
  const tab: MainTab =
    tabParam === 'creation' || tabParam === 'catalog' || tabParam === 'suivi' || tabParam === 'grant'
      ? tabParam
      : defaultTab;

  const creationParam = params.get('section');
  const creationSection: CreationSection =
    creationParam === 'validations' || creationParam === 'create' ? creationParam : 'create';

  function setTab(next: MainTab) {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', next);
      return p;
    });
  }

  function setCreationSection(next: CreationSection) {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', 'creation');
      p.set('section', next);
      return p;
    });
  }

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<BenefitCatalogRow[]>([]);
  const [offers, setOffers] = useState<PartnerOfferRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [roleAssociations, setRoleAssociations] = useState<RoleAssociationRow[]>([]);
  const [individualStats, setIndividualStats] = useState<CatalogUsageStat[]>([]);
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [suiviRoleFilter, setSuiviRoleFilter] = useState<'all' | RoleEntitlementKind>('all');

  const [partnerAccounts, setPartnerAccounts] = useState<PartnerAccountRow[]>([]);
  const [contentOptions, setContentOptions] = useState<PartnerContentOptionRow[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [selectedContentKey, setSelectedContentKey] = useState('');
  const [partnersToAdd, setPartnersToAdd] = useState<BenefitOfferingPartner[]>([]);

  const [grantTarget, setGrantTarget] = useState<GrantRoleTarget>('member');
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const [offeringIndexByCatalog, setOfferingIndexByCatalog] = useState<Record<string, number>>({});

  const [editItem, setEditItem] = useState<BenefitCatalogRow | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const loadAll = useCallback(async () => {
    const [catRes, offerRes, grantRes, entitlements] = await Promise.all([
      listBenefitCatalog(countryCode),
      listPartnerOffers(countryCode),
      listRecentGrants(countryCode),
      getRoleBenefitEntitlements(countryCode),
    ]);
    setCatalog(catRes.items);
    setOffers(offerRes.items);
    setGrants(grantRes.items);
    setRoleAssociations(buildRoleAssociations(entitlements, catRes.items));
    setIndividualStats(await getIndividualUsageStats(countryCode));
    if (catRes.error || offerRes.error || grantRes.error) {
      setMsg(catRes.error ?? offerRes.error ?? grantRes.error ?? null);
    }
  }, [countryCode]);

  const loadPartners = useCallback(async () => {
    const res = await listPartnerOfferingAccounts(countryCode);
    setPartnerAccounts(res.items);
    if (res.error) setMsg(res.error);
  }, [countryCode]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (tab === 'creation' && creationSection === 'create') void loadPartners();
  }, [tab, creationSection, loadPartners]);

  const standaloneBenefits = useMemo(() => listStandaloneBenefits(catalog), [catalog]);
  const validationOffers = useMemo(() => listValidationOffers(offers), [offers]);
  const associatedCatalog = useMemo(() => listAssociatedCatalog(catalog), [catalog]);
  const grantableCatalog = useMemo(() => listGrantableCatalog(catalog), [catalog]);

  const filteredCatalog = useMemo(
    () =>
      associatedCatalog.filter((c) => {
        if (catalogFilter === 'active') return c.isActive;
        if (catalogFilter === 'inactive') return !c.isActive;
        return true;
      }),
    [associatedCatalog, catalogFilter],
  );

  const suiviRows = useMemo(() => {
    if (suiviRoleFilter === 'all') return roleAssociations;
    return roleAssociations.filter((r) => r.role === suiviRoleFilter);
  }, [roleAssociations, suiviRoleFilter]);

  const selectedPartner = partnerAccounts.find((p) => p.id === selectedPartnerId) ?? null;
  const selectedContent =
    contentOptions.find((o) => o.key === selectedContentKey) ?? contentOptions[0] ?? null;

  useEffect(() => {
    if (!selectedPartner) {
      setContentOptions([]);
      setSelectedContentKey('');
      return;
    }
    void listPartnerContentOptions({
      partnerUserId: selectedPartner.userId,
      countryCode,
      isTheLoop: selectedPartner.isTheLoop,
    }).then((res) => {
      setContentOptions(res.items);
      setSelectedContentKey(res.items[0]?.key ?? '');
      if (res.error) setMsg(res.error);
    });
  }, [selectedPartner, countryCode]);

  function toggleCatalogSelection(id: string) {
    setSelectedCatalogIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleCreateAssociation() {
    const template = standaloneBenefits.find((b) => b.localId === templateId);
    if (!template) {
      setMsg('Choisissez un privilège créé dans Paramètres → Privilège standalone.');
      return;
    }
    if (!partnersToAdd.length) {
      setMsg('Ajoutez au moins un partenaire et un lieu de validation.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const created = await createCatalogAssociation({
      template,
      offeringPartners: partnersToAdd,
      countryCode,
    });
    if (!created.ok || !created.localId) {
      setBusy(false);
      setMsg(created.error ?? 'Création impossible.');
      return;
    }
    const onlyTheLoop = partnersToAdd.every((p) => isTheLoopName(p.displayName));
    const proposed = await proposeCatalogBenefitsToPartners({
      catalogLocalId: created.localId,
      catalogTitle: template.title,
      catalogDescription: template.description,
      countryCode,
      defaultValidityDays: template.defaultValidityDays,
      benefitKind: template.benefitKind,
      partners: partnersToAdd,
      onlyTheLoop,
    });
    setBusy(false);
    if (!proposed.ok) {
      setMsg(proposed.error ?? 'Envoi validation impossible.');
      return;
    }
    setPartnersToAdd([]);
    setTemplateId('');
    setMsg(
      onlyTheLoop
        ? 'Association THE LOOP créée — visible dans Catalogue.'
        : 'Envoyé en validation partenaire.',
    );
    if (onlyTheLoop) setTab('catalog');
    else setCreationSection('validations');
    void loadAll();
  }

  async function handleGrantRoles() {
    if (!selectedCatalogIds.length) {
      setMsg('Sélectionnez au moins un privilège validé.');
      return;
    }
    const entries = selectedCatalogIds.map((catalogId) => {
      const item = catalog.find((c) => c.localId === catalogId);
      const idx = offeringIndexByCatalog[catalogId] ?? 0;
      const offering = item?.offeringPartners[idx] ?? item?.offeringPartners[0];
      return {
        catalogId,
        partnerId: offering?.partnerId,
        partnerDisplayName: offering?.displayName,
      };
    });
    setBusy(true);
    const res = await grantRoleBenefitEntitlements({
      countryCode,
      catalogIds: selectedCatalogIds,
      entries,
      target: grantTarget,
      adminId: profile?.id,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Association impossible.');
      return;
    }
    setSelectedCatalogIds([]);
    setOfferingIndexByCatalog({});
    setMsg('Privilèges associés à la cible sélectionnée.');
    void loadAll();
  }

  async function handleToggleActive(item: BenefitCatalogRow) {
    if (!item.isActive && (await catalogHasPendingOffers(item.localId))) {
      setMsg('Validation partenaire en attente — activation impossible.');
      return;
    }
    setBusy(true);
    const res = await setBenefitCatalogActive(item.localId, !item.isActive);
    setBusy(false);
    if (!res.ok) setMsg(res.error ?? 'Erreur');
    else void loadAll();
  }

  async function handleSaveEdit() {
    if (!editItem) return;
    setBusy(true);
    const res = await updateBenefitCatalogItem(
      editItem.localId,
      { title: editTitle, description: editDescription },
      editItem,
    );
    setBusy(false);
    if (!res.ok) setMsg(res.error ?? 'Erreur');
    else {
      setEditItem(null);
      void loadAll();
    }
  }

  function addPartnerToList() {
    if (!selectedPartner || !selectedContent) {
      setMsg('Partenaire et lieu requis.');
      return;
    }
    const offering = offeringFromPartnerAndContent(selectedPartner, selectedContent);
    if (partnersToAdd.some((p) => offeringIdentityKey(p) === offeringIdentityKey(offering))) {
      setMsg('Cette combinaison partenaire / lieu est déjà dans la liste.');
      return;
    }
    setPartnersToAdd((prev) => [...prev, offering]);
    setMsg(null);
  }

  const mainTabs: { id: MainTab; label: string; show: boolean; badge?: number }[] = [
    { id: 'creation', label: 'Création', show: canCreation || canValidations, badge: validationOffers.length || undefined },
    { id: 'catalog', label: 'Catalogue', show: canCatalog, badge: associatedCatalog.filter((c) => c.isActive).length || undefined },
    { id: 'suivi', label: 'Suivi', show: canSuivi, badge: roleAssociations.length || undefined },
    { id: 'grant', label: 'Octroyer', show: canGrants },
  ];

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Avantages membres</p>
          <h2>Privilèges THE LOOP</h2>
          <p className="meta">Création, catalogue, suivi, octroi — pays : {countryLabel}.</p>
        </div>
      </header>

      <nav className="tabs">
        {mainTabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.badge ? ` (${t.badge})` : ''}
            </button>
          ))}
      </nav>

      {msg ? <p className="muted">{msg}</p> : null}

      {tab === 'creation' && (canCreation || canValidations) ? (
        <>
          <nav className="tabs" style={{ marginBottom: 12 }}>
            {canCreation ? (
              <button
                type="button"
                className={`tab ${creationSection === 'create' ? 'active' : ''}`}
                onClick={() => setCreationSection('create')}
              >
                Création
              </button>
            ) : null}
            {canValidations ? (
              <button
                type="button"
                className={`tab ${creationSection === 'validations' ? 'active' : ''}`}
                onClick={() => setCreationSection('validations')}
              >
                Validation{validationOffers.length ? ` (${validationOffers.length})` : ''}
              </button>
            ) : null}
          </nav>

          {creationSection === 'create' && canCreation ? (
            <div className="card">
              <p className="meta">
                Choisissez un modèle depuis{' '}
                <Link to="/privilege-standalone">Paramètres → Privilège standalone</Link>, un partenaire
                (THE LOOP inclus) et un lieu. Hors THE LOOP : envoi en validation — actif après acceptation.
              </p>

              <div className="field">
                <label>Privilège (Paramètres) *</label>
                <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">Choisir un privilège…</option>
                  {standaloneBenefits.map((b) => (
                    <option key={b.localId} value={b.localId}>
                      {b.title}
                    </option>
                  ))}
                </select>
                {standaloneBenefits.length === 0 ? (
                  <p className="meta" style={{ color: '#b45309' }}>
                    Aucun modèle actif — créez-en dans Paramètres → Privilège standalone.
                  </p>
                ) : null}
              </div>

              <div className="field">
                <label>Partenaire *</label>
                <select value={selectedPartnerId} onChange={(e) => setSelectedPartnerId(e.target.value)}>
                  <option value="">Choisir…</option>
                  {partnerAccounts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPartner ? (
                <div className="field">
                  <label>{selectedPartner.isTheLoop ? 'Contenu THE LOOP *' : 'Lieu de validité *'}</label>
                  <select value={selectedContentKey} onChange={(e) => setSelectedContentKey(e.target.value)}>
                    {contentOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.subtitle} · {o.title}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <button type="button" className="btn ghost small" disabled={busy} onClick={addPartnerToList}>
                + Ajouter partenaire et lieu
              </button>

              {partnersToAdd.length > 0 ? (
                <ul className="meta" style={{ marginTop: 12 }}>
                  {partnersToAdd.map((p) => (
                    <li key={offeringIdentityKey(p)}>
                      {p.displayName} · {formatOfferingScope(p.contentType, p.contentTitle)}{' '}
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() =>
                          setPartnersToAdd((prev) =>
                            prev.filter((x) => offeringIdentityKey(x) !== offeringIdentityKey(p)),
                          )
                        }
                      >
                        Retirer
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <button
                type="button"
                className="btn"
                style={{ marginTop: 16 }}
                disabled={busy}
                onClick={() => void handleCreateAssociation()}
              >
                {busy ? 'Création…' : 'Créer l\'association'}
              </button>
            </div>
          ) : null}

          {creationSection === 'validations' && canValidations ? (
            <div className="table-wrap">
              <p className="meta" style={{ padding: '12px 16px 0' }}>
                En attente de validation partenaire — pas de validation automatique.
              </p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Privilège</th>
                    <th>Partenaire</th>
                    <th>Lieu</th>
                    <th>Statut</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {validationOffers.map((o) => (
                    <tr key={o.id}>
                      <td>
                        <strong>{o.catalogTitle}</strong>
                        <div className="meta">{formatWhen(o.createdAt)}</div>
                        {o.status === 'declined' && o.partnerResponseNote ? (
                          <div className="meta" style={{ color: '#dc2626' }}>
                            Motif : {o.partnerResponseNote}
                          </div>
                        ) : null}
                      </td>
                      <td>{o.partnerName}</td>
                      <td className="meta">{formatOfferingScope(o.contentType, o.contentTitle)}</td>
                      <td>
                        <span className={`badge ${o.status === 'pending' ? 'warn' : 'err'}`}>
                          {OFFER_STATUS_LABELS[o.status]}
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
                                void resendPartnerBenefitOffer(o).then((r) => {
                                  setBusy(false);
                                  if (!r.ok) setMsg(r.error ?? 'Erreur');
                                  else {
                                    setMsg('Demande remise en validation.');
                                    void loadAll();
                                  }
                                });
                              }}
                            >
                              Remettre en validation
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
                                  else void loadAll();
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
                                else void loadAll();
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
              {validationOffers.length === 0 ? (
                <p className="muted" style={{ padding: 16 }}>
                  Aucune demande de validation.
                </p>
              ) : null}
            </div>
          ) : null}
        </>
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
                  <th>Partenaires / lieux</th>
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
                    <td className="meta">
                      {(c.offeringPartners ?? []).map((p) => (
                        <div key={offeringIdentityKey(p)}>
                          {p.displayName} · {formatOfferingScope(p.contentType, p.contentTitle)}
                        </div>
                      ))}
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
                            setEditItem(c);
                            setEditTitle(c.title);
                            setEditDescription(c.description);
                          }}
                        >
                          Éditer
                        </button>
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={busy}
                          onClick={() => void handleToggleActive(c)}
                        >
                          {c.isActive ? 'Désactiver' : 'Activer'}
                        </button>
                        <button
                          type="button"
                          className="btn small ghost"
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm('Supprimer ce privilège catalogue ?')) return;
                            setBusy(true);
                            void deleteBenefitCatalogItem(c.localId).then((r) => {
                              setBusy(false);
                              if (!r.ok) setMsg(r.error ?? 'Erreur');
                              else void loadAll();
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
            {filteredCatalog.length === 0 ? (
              <p className="muted" style={{ padding: 16 }}>
                Catalogue vide — créez une association dans l’onglet Création.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === 'suivi' && canSuivi ? (
        <>
          <div className="tabs" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`tab ${suiviRoleFilter === 'all' ? 'active' : ''}`}
              onClick={() => setSuiviRoleFilter('all')}
            >
              Tous rôles
            </button>
            {(['member', 'prime', 'partner'] as RoleEntitlementKind[]).map((role) => (
              <button
                key={role}
                type="button"
                className={`tab ${suiviRoleFilter === role ? 'active' : ''}`}
                onClick={() => setSuiviRoleFilter(role)}
              >
                {role === 'member' ? 'Membres' : role === 'prime' ? 'Prime' : 'Partenaires'}
              </button>
            ))}
          </div>

          <h3>Affectations de rôle ({suiviRows.length})</h3>
          <div className="table-wrap" style={{ marginBottom: 24 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Privilège</th>
                  <th>Partenaire</th>
                  <th>Cible</th>
                </tr>
              </thead>
              <tbody>
                {suiviRows.map((row) => (
                  <tr key={`${row.role}:${row.catalogId}`}>
                    <td>{row.title}</td>
                    <td className="meta">{row.partnerLabel}</td>
                    <td>{row.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {suiviRows.length === 0 ? (
              <p className="muted" style={{ padding: 16 }}>
                Aucune association — utilisez l’onglet Octroyer.
              </p>
            ) : null}
          </div>

          <h3>Consommation individuelle ({individualStats.length})</h3>
          <div className="table-wrap">
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
                {individualStats.map((s) => (
                  <tr key={s.catalogId}>
                    <td>{s.title}</td>
                    <td>{s.granted}</td>
                    <td>{s.used}</td>
                    <td>{s.unusedAssigned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {individualStats.length === 0 ? (
              <p className="muted" style={{ padding: 16 }}>
                Pas encore d’octrois individuels (hors associations de rôle).
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === 'grant' && canGrants ? (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <p className="meta">
              Associez des privilèges validés à une cible (Membre / Prime / Tous). Les comptes se mettent à
              jour à la prochaine connexion. Octrois individuels : voir{' '}
              <Link to="/tirage">Tirage</Link>.
            </p>

            <div className="field">
              <label>Privilèges validés *</label>
              <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
                {grantableCatalog.map((item) => (
                  <button
                    key={item.localId}
                    type="button"
                    className={`btn small ${selectedCatalogIds.includes(item.localId) ? '' : 'ghost'}`}
                    onClick={() => toggleCatalogSelection(item.localId)}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
              {grantableCatalog.length === 0 ? (
                <p className="meta">Aucun privilège validé (catalogue actif + partenaire accepté).</p>
              ) : null}
            </div>

            {selectedCatalogIds.map((catalogId) => {
              const item = catalog.find((c) => c.localId === catalogId);
              if (!item) return null;
              const options = item.offeringPartners ?? [];
              const selectedIdx = offeringIndexByCatalog[catalogId] ?? 0;
              return (
                <div key={catalogId} className="field">
                  <label>Partenaire — {item.title}</label>
                  <select
                    value={String(selectedIdx)}
                    onChange={(e) =>
                      setOfferingIndexByCatalog((p) => ({
                        ...p,
                        [catalogId]: parseInt(e.target.value, 10),
                      }))
                    }
                  >
                    {options.map((opt, idx) => (
                      <option key={offeringIdentityKey(opt)} value={idx}>
                        {opt.displayName} · {formatOfferingScope(opt.contentType, opt.contentTitle)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}

            <div className="field">
              <label>Cible *</label>
              <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
                {GRANT_ROLE_TARGETS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`btn small ${grantTarget === opt.id ? '' : 'ghost'}`}
                    onClick={() => setGrantTarget(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="meta">
                La cible est exclusive : ex. MEMBRE retire le privilège de Prime / Partenaires pour les
                items sélectionnés.
              </p>
            </div>

            <button type="button" className="btn" disabled={busy} onClick={() => void handleGrantRoles()}>
              {busy ? 'Enregistrement…' : 'Associer à la cible'}
            </button>
          </div>

          <h3>Associations de rôle ({roleAssociations.length})</h3>
          <div className="table-wrap" style={{ marginBottom: 24 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Privilège</th>
                  <th>Partenaire</th>
                  <th>Cible</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {roleAssociations.map((row) => (
                  <tr key={`grant-${row.role}:${row.catalogId}`}>
                    <td>{row.title}</td>
                    <td className="meta">{row.partnerLabel}</td>
                    <td>{row.label}</td>
                    <td>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Retirer « ${row.title} » de ${row.label} ?`)) return;
                          setBusy(true);
                          void removeRoleAssociation({
                            countryCode,
                            role: row.role,
                            catalogId: row.catalogId,
                            adminId: profile?.id,
                          }).then((r) => {
                            setBusy(false);
                            if (!r.ok) setMsg(r.error ?? 'Erreur');
                            else void loadAll();
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
          </div>

          <h3>Octrois individuels récents ({grants.length})</h3>
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
                      <span className={`badge ${g.status === 'used' ? 'ok' : 'warn'}`}>{g.status}</span>
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
                              else void loadAll();
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
          </div>
        </>
      ) : null}

      {editItem ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setEditItem(null)}>
          <div className="card modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Éditer le catalogue</h3>
            <div className="field">
              <label>Titre</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>
            <div className="field">
              <label>Description</label>
              <textarea rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <div className="edit-actions">
              <button type="button" className="btn ghost" onClick={() => setEditItem(null)}>
                Annuler
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void handleSaveEdit()}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function isTheLoopName(name: string): boolean {
  return name.trim().toUpperCase().includes('THE LOOP');
}
