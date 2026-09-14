import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import { useAuth } from '../context/AuthContext';
import { formatWhen } from '../lib/format';
import { listBenefitCatalog, type BenefitCatalogRow } from '../lib/privileges';
import { listAdminUsersLite, type AdminUserLite } from '../lib/settings';
import {
  getStaffTeamPack,
  listStaffOverrides,
  saveStaffTeamPack,
  type RoleBenefitEntitlementEntry,
} from '../lib/teams';

export function TeamsPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const { profile } = useAuth();
  const [admins, setAdmins] = useState<AdminUserLite[]>([]);
  const [catalog, setCatalog] = useState<BenefitCatalogRow[]>([]);
  const [pack, setPack] = useState<RoleBenefitEntitlementEntry[]>([]);
  const [overrides, setOverrides] = useState<
    Array<{ userId: string; enabled: boolean; updatedAt: string | null }>
  >([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const [a, c, p, o] = await Promise.all([
      listAdminUsersLite(),
      listBenefitCatalog(countryCode),
      getStaffTeamPack(countryCode),
      listStaffOverrides(),
    ]);
    setAdmins(a);
    setCatalog(c.items.filter((i) => i.isActive));
    setPack(p);
    setOverrides(o);
    if (c.error) setMsg(c.error);
  }, [countryCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const packIds = useMemo(() => new Set(pack.map((e) => e.catalogId)), [pack]);
  const byId = useMemo(() => new Map(admins.map((a) => [a.id, a])), [admins]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.partnerNames.some((n) => n.toLowerCase().includes(q)),
    );
  }, [catalog, search]);

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

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Pack équipe</p>
          <h2>TEAMS</h2>
          <p className="meta">
            Pack privilèges des admins délégués — {countryLabel}. Sauvegarde sync
            `staff_team_pack_by_country`.
          </p>
        </div>
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
      </header>
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="meta">Dans le pack</div>
          <strong>{pack.length}</strong>
        </div>
        <div className="card kpi-card">
          <div className="meta">Catalogue actif</div>
          <strong>{catalog.length}</strong>
        </div>
        <div className="card kpi-card">
          <div className="meta">Overrides</div>
          <strong>{overrides.length}</strong>
        </div>
      </div>

      <div className="split-pane">
        <div>
          <div className="toolbar">
            <input
              placeholder="Rechercher un privilège…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
                        checked={packIds.has(c.localId)}
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
        </div>

        <div className="card">
          <h3>Overrides individuels</h3>
          {overrides.length === 0 ? (
            <p className="muted">Aucun override en base.</p>
          ) : (
            <ul className="meta" style={{ lineHeight: 1.7, paddingLeft: 16 }}>
              {overrides.map((o) => {
                const admin = byId.get(o.userId);
                return (
                  <li key={o.userId}>
                    <strong>{admin?.name ?? o.userId.slice(0, 8)}</strong> —{' '}
                    {o.enabled ? 'actif' : 'off'} · {formatWhen(o.updatedAt)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
