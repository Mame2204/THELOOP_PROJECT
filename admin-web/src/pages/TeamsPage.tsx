import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../context/PermissionsContext';
import { listTeamsAssignableCatalog, type BenefitCatalogRow } from '../lib/privileges';
import { isSuperAdminUser } from '../lib/permissions';
import {
  getStaffBenefitOverrides,
  isBenefitEffectiveForAdmin,
  isTeamBenefitEnabledForUser,
  setAdminStaffBenefitEnabled,
  setTeamBenefitEnabledForUser,
  type StaffBenefitOverrides,
} from '../lib/staff-benefit-overrides';
import {
  getStaffTeamPack,
  listDelegatedAdmins,
  saveStaffTeamPack,
  type RoleBenefitEntitlementEntry,
} from '../lib/teams';

type Tab = 'team' | 'delegate' | 'founder';

export function TeamsPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const { profile } = useAuth();
  const { canSub } = usePermissions();
  const isFounder = isSuperAdminUser(profile?.role);

  const canTeam = canSub('staff_benefits', 'staff_benefits_team');
  const canDelegate = isFounder && canSub('staff_benefits', 'staff_benefits_admin');

  const [tab, setTab] = useState<Tab>(isFounder ? 'founder' : 'team');
  const [catalog, setCatalog] = useState<BenefitCatalogRow[]>([]);
  const [pack, setPack] = useState<RoleBenefitEntitlementEntry[]>([]);
  const [delegatedAdmins, setDelegatedAdmins] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [selectedDelegateId, setSelectedDelegateId] = useState('');
  const [delegateOverrides, setDelegateOverrides] = useState<StaffBenefitOverrides | null>(null);
  const [founderOverrides, setFounderOverrides] = useState<StaffBenefitOverrides | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const teamCatalogIds = useMemo(() => new Set(pack.map((e) => e.catalogId)), [pack]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.partnerNames.some((n) => n.toLowerCase().includes(q)),
    );
  }, [catalog, search]);

  const load = useCallback(async () => {
    const [c, p, admins] = await Promise.all([
      listTeamsAssignableCatalog(countryCode),
      getStaffTeamPack(countryCode),
      listDelegatedAdmins(countryCode),
    ]);
    setCatalog(c.items);
    setPack(p);
    setDelegatedAdmins(admins);
    if (c.error) setMsg(c.error);

    if (isFounder && profile?.id) {
      setFounderOverrides(await getStaffBenefitOverrides(profile.id));
    }
    if (admins.length && !selectedDelegateId) {
      setSelectedDelegateId(admins[0].id);
    }
  }, [countryCode, isFounder, profile?.id, selectedDelegateId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedDelegateId) {
      setDelegateOverrides(null);
      return;
    }
    void getStaffBenefitOverrides(selectedDelegateId).then(setDelegateOverrides);
  }, [selectedDelegateId]);

  function toggleCatalog(item: BenefitCatalogRow) {
    setPack((prev) => {
      if (prev.some((e) => e.catalogId === item.localId)) {
        return prev.filter((e) => e.catalogId !== item.localId);
      }
      return [
        ...prev,
        {
          catalogId: item.localId,
          partnerId: 'loop',
          partnerDisplayName: item.partnerNames[0] ?? 'THE LOOP',
        },
      ];
    });
  }

  async function handleDelegateToggle(catalogId: string, enabled: boolean) {
    if (!profile?.id || !selectedDelegateId || !delegateOverrides) return;
    const item = catalog.find((c) => c.localId === catalogId);
    setBusy(true);
    try {
      const saved = await setAdminStaffBenefitEnabled(
        selectedDelegateId,
        catalogId,
        enabled,
        teamCatalogIds,
        item
          ? { catalogId: item.localId, partnerDisplayName: item.partnerNames[0] ?? 'THE LOOP' }
          : undefined,
        profile.id,
      );
      setDelegateOverrides(saved);
      setMsg('Override enregistré.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function handleFounderToggle(catalogId: string, enabled: boolean) {
    if (!profile?.id) return;
    setBusy(true);
    try {
      const saved = await setTeamBenefitEnabledForUser(profile.id, catalogId, enabled, true, profile.id);
      setFounderOverrides(saved);
      setMsg('Privilège super admin mis à jour.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [];
  if (isFounder) tabs.push({ id: 'founder', label: 'Super admin' });
  if (canDelegate) tabs.push({ id: 'delegate', label: 'Par admin', badge: delegatedAdmins.length || undefined });
  if (canTeam) tabs.push({ id: 'team', label: 'Pack Admin', badge: pack.length });

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Pack équipe</p>
          <h2>TEAMS</h2>
          <p className="meta">
            Privilèges admins — {countryLabel}. Sync Supabase `staff_team_pack_by_country` et
            `staff_benefit_overrides`.
          </p>
        </div>
        {tab === 'team' && canTeam ? (
          <button
            type="button"
            className="btn"
            style={{ width: 'auto' }}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void saveStaffTeamPack(countryCode, pack, profile?.id).then((r) => {
                setBusy(false);
                setMsg(r.ok ? 'Pack TEAMS enregistré.' : r.error ?? 'Erreur');
                if (r.ok) void load();
              });
            }}
          >
            Enregistrer le pack
          </button>
        ) : null}
      </header>

      {msg ? <p className="muted">{msg}</p> : null}

      <div className="tabs" style={{ marginBottom: 12 }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.badge != null ? ` (${t.badge})` : ''}
          </button>
        ))}
      </div>

      <div className="toolbar">
        <input
          placeholder="Rechercher un privilège…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {tab === 'founder' && isFounder && founderOverrides ? (
        <>
          <p className="meta" style={{ marginBottom: 12 }}>
            Vos privilèges personnels (super admin). Indépendants du pack Admin.
          </p>
          <CatalogToggleTable
            rows={filtered}
            isChecked={(id) => isTeamBenefitEnabledForUser(founderOverrides, id, true)}
            onToggle={(id, next) => void handleFounderToggle(id, next)}
            disabled={busy}
          />
        </>
      ) : null}

      {tab === 'delegate' && canDelegate ? (
        <>
          <p className="meta" style={{ marginBottom: 12 }}>
            Ajustements individuels par admin délégué (retirer du pack ou ajouter hors pack).
          </p>
          {delegatedAdmins.length === 0 ? (
            <p className="muted">Aucun admin délégué pour {countryLabel}.</p>
          ) : (
            <>
              <div className="field" style={{ maxWidth: 360 }}>
                <label>Admin délégué</label>
                <select
                  value={selectedDelegateId}
                  onChange={(e) => setSelectedDelegateId(e.target.value)}
                >
                  {delegatedAdmins.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.email}
                    </option>
                  ))}
                </select>
              </div>
              {delegateOverrides ? (
                <CatalogToggleTable
                  rows={filtered}
                  isChecked={(id) => isBenefitEffectiveForAdmin(delegateOverrides, id, teamCatalogIds)}
                  onToggle={(id, next) => void handleDelegateToggle(id, next)}
                  disabled={busy}
                  showPackHint
                  inPack={(id) => teamCatalogIds.has(id)}
                />
              ) : null}
            </>
          )}
        </>
      ) : null}

      {tab === 'team' && canTeam ? (
        <>
          <p className="meta" style={{ marginBottom: 12 }}>
            Pack pour les admins délégués de {countryLabel} (rôle admin, hors super admin). Seuls les
            privilèges validés et liés à un event, spot ou outil sont proposés (aligné app mobile).
          </p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pack</th>
                  <th>Privilège</th>
                  <th>Partenaires</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.localId}>
                    <td>
                      <input
                        type="checkbox"
                        checked={teamCatalogIds.has(c.localId)}
                        onChange={() => toggleCatalog(c)}
                      />
                    </td>
                    <td>
                      <strong>{c.title}</strong>
                    </td>
                    <td className="meta">{c.partnerNames.join(', ') || '—'}</td>
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

function CatalogToggleTable({
  rows,
  isChecked,
  onToggle,
  disabled,
  showPackHint,
  inPack,
}: {
  rows: BenefitCatalogRow[];
  isChecked: (catalogId: string) => boolean;
  onToggle: (catalogId: string, enabled: boolean) => void;
  disabled?: boolean;
  showPackHint?: boolean;
  inPack?: (catalogId: string) => boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Actif</th>
            <th>Privilège</th>
            <th>Partenaires</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.localId}>
              <td>
                <input
                  type="checkbox"
                  checked={isChecked(c.localId)}
                  disabled={disabled}
                  onChange={(e) => onToggle(c.localId, e.target.checked)}
                />
              </td>
              <td>
                <strong>{c.title}</strong>
                {showPackHint && inPack?.(c.localId) ? (
                  <span className="meta"> · pack</span>
                ) : null}
              </td>
              <td className="meta">{c.partnerNames.join(', ') || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
