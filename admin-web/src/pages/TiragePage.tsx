import { useCallback, useEffect, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import { useAuth } from '../context/AuthContext';
import { formatWhen } from '../lib/format';
import {
  ALL_DRAW_ELIGIBLE_ROLES,
  allDrawRolesSelected,
  filterDrawEligibleCatalog,
  grantBenefitsToUsers,
  isCatalogEligibleForDraw,
  getRoleBenefitEntitlements,
  listBenefitCatalog,
  type BenefitCatalogRow,
  type DrawEligibleRole,
} from '../lib/privileges';
import { supabase } from '../lib/supabase';

type DrawRole = DrawEligibleRole;

interface DrawRow {
  id: string;
  catalogTitle: string;
  winnerCount: number;
  countryCode: string;
  drawnAt: string;
  roles: string[];
  winners: { displayName?: string | null; userId?: string }[];
}

const ROLE_OPTIONS: { id: DrawRole; label: string }[] = [
  { id: 'member', label: 'Membres' },
  { id: 'prime', label: 'Loop Prime' },
  { id: 'partner', label: 'Partenaires' },
  { id: 'admin', label: 'Admins délégués' },
];

/** Pool tirage : admins délégués uniquement (pas super_admin). */
function rolesToDbValues(roles: DrawRole[]): string[] {
  return roles.flatMap((r) => {
    if (r === 'member') return ['member', 'USER_FREE'];
    if (r === 'prime') return ['prime', 'USER_PRIME'];
    if (r === 'partner') return ['partner', 'PARTNER', 'tool_partner'];
    return ['admin'];
  });
}

function shufflePick<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

export function TiragePage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const { profile } = useAuth();
  const [rows, setRows] = useState<DrawRow[]>([]);
  const [catalog, setCatalog] = useState<BenefitCatalogRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [catalogId, setCatalogId] = useState('');
  const [winnerCount, setWinnerCount] = useState(3);
  const [roles, setRoles] = useState<DrawRole[]>(['member', 'prime']);
  const [poolSize, setPoolSize] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const cat = await listBenefitCatalog(countryCode);
    const active = cat.items.filter((i) => i.isActive);
    const eligible = await filterDrawEligibleCatalog(active, countryCode, roles);
    setCatalog(eligible);
    if (catalogId && !eligible.some((i) => i.localId === catalogId)) {
      setCatalogId(eligible[0]?.localId ?? '');
    } else if (!catalogId && eligible[0]) {
      setCatalogId(eligible[0].localId);
    }

    let q = supabase
      .from('admin_benefit_draws')
      .select(
        'id, catalog_title, winner_count, country_code, drawn_at, roles, winners',
      )
      .order('drawn_at', { ascending: false })
      .limit(50);
    if (countryCode) q = q.eq('country_code', countryCode);
    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    setRows(
      (data ?? []).map((r) => ({
        id: String(r.id),
        catalogTitle: String(r.catalog_title ?? 'Privilège'),
        winnerCount: Number(r.winner_count ?? 0),
        countryCode: String(r.country_code ?? ''),
        drawnAt: String(r.drawn_at ?? ''),
        roles: Array.isArray(r.roles) ? r.roles.map(String) : [],
        winners: Array.isArray(r.winners) ? (r.winners as DrawRow['winners']) : [],
      })),
    );
  }, [countryCode, catalogId, roles]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!roles.length) {
      setPoolSize(0);
      return;
    }
    void (async () => {
      const roleDb = rolesToDbValues(roles);
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('country_code', countryCode)
        .eq('is_active', true)
        .in('user_role', roleDb);
      setPoolSize(count ?? 0);
    })();
  }, [roles, countryCode]);

  function toggleRole(r: DrawRole) {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  function toggleAllRoles() {
    setRoles((prev) => (allDrawRolesSelected(prev) ? [] : [...ALL_DRAW_ELIGIBLE_ROLES]));
  }

  async function runDraw() {
    if (!catalogId || !roles.length || winnerCount < 1) {
      setMsg('Choisissez un catalogue, des rôles et un nombre de gagnants.');
      return;
    }
    const item = catalog.find((c) => c.localId === catalogId);
    if (!item) {
      setMsg('Catalogue introuvable.');
      return;
    }
    const entitlements = await getRoleBenefitEntitlements(countryCode);
    if (!isCatalogEligibleForDraw(item.localId, item.benefitPurpose, roles, entitlements)) {
      setMsg(
        'Ce privilège est déjà octroyé à tout le rôle cible. Utilisez Octroyer ou une campagne limitée / code promo.',
      );
      return;
    }
    setBusy(true);
    setMsg(null);
    const roleDb = rolesToDbValues(roles);
    const { data: users, error: uErr } = await supabase
      .from('users')
      .select('id, first_name, last_name, phone_number, user_role')
      .eq('country_code', countryCode)
      .eq('is_active', true)
      .in('user_role', roleDb)
      .limit(400);
    if (uErr) {
      setBusy(false);
      setMsg(uErr.message);
      return;
    }
    const pool = users ?? [];
    if (!pool.length) {
      setBusy(false);
      setMsg('Aucun candidat éligible pour ce pays / ces rôles.');
      return;
    }
    const picked = shufflePick(pool, winnerCount);
    const grant = await grantBenefitsToUsers({
      catalogLocalId: item.localId,
      title: item.title,
      description: item.description,
      partnerName: item.partnerNames[0] ?? 'THE LOOP',
      userIds: picked.map((u) => String(u.id)),
      countryCode,
      validityDays: 30,
      customNote: `Tirage au sort THE LOOP — ${item.title}`,
    });
    if (!grant.ok) {
      setBusy(false);
      setMsg(grant.error ?? 'Échec octroi.');
      return;
    }
    const drawId = crypto.randomUUID();
    const winners = picked.map((u) => ({
      userId: String(u.id),
      displayName:
        `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() ||
        u.phone_number ||
        String(u.id).slice(0, 8),
      phone: u.phone_number,
    }));
    const { error: dErr } = await supabase.from('admin_benefit_draws').insert({
      id: drawId,
      roles,
      winner_count: winners.length,
      catalog_id: item.localId,
      catalog_title: item.title,
      partner_key: 'loop',
      partner_name: item.partnerNames[0] ?? 'THE LOOP',
      validity_days: 30,
      validity_starts_on_activation: true,
      country_code: countryCode,
      draw_city: null,
      custom_note: `Tirage — ${item.title}`,
      drawn_by: profile?.id ?? null,
      drawn_at: new Date().toISOString(),
      winners,
    });
    setBusy(false);
    if (dErr) {
      setMsg(`Octroyé (${grant.granted}) mais historique : ${dErr.message}`);
    } else {
      setMsg(`Tirage OK — ${grant.granted} gagnant(s) octroyés.`);
    }
    void load();
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Loterie privilèges</p>
          <h2>Tirage</h2>
          <p className="meta">Lancer un tirage et consulter l’historique — {countryLabel}.</p>
        </div>
        <button type="button" className="btn ghost small" onClick={() => void load()}>
          Actualiser
        </button>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="split-pane">
        <div className="card">
          <h3>Nouveau tirage</h3>
          <p className="meta" style={{ marginBottom: 12 }}>
            Campagnes limitées : N gagnants parmi un pool (ex. 3 dîners / 800 membres, 10 codes promo Instagram, 5
            places VIP, avantages partenaires ou admins). Choisissez un ou plusieurs rôles, ou « Tous ». Super admin exclu du pool.
          </p>
          <p className="meta" style={{ marginBottom: 12 }}>
            Privilège disponible pour le tirage = actif dans le catalogue, validé par un partenaire Pro, et pas déjà
            donné à tout le rôle sélectionné via Octroyer (sauf codes promo).
          </p>
          <div className="field">
            <label>Rôles du pool de tirage</label>
            <div className="toolbar" style={{ margin: 0 }}>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={allDrawRolesSelected(roles)}
                  onChange={toggleAllRoles}
                />
                Tous
              </label>
              {ROLE_OPTIONS.map((r) => (
                <label key={r.id} className="check-inline">
                  <input
                    type="checkbox"
                    checked={roles.includes(r.id)}
                    onChange={() => toggleRole(r.id)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
            <p className="meta">Candidats estimés : {poolSize ?? '…'}</p>
          </div>
          <div className="field">
            <label>Privilège à tirer</label>
            <select value={catalogId} onChange={(e) => setCatalogId(e.target.value)}>
              {catalog.length === 0 ? (
                <option value="">Aucun privilège disponible pour ces rôles</option>
              ) : (
                catalog.map((c) => (
                  <option key={c.localId} value={c.localId}>
                    {c.title}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="field">
            <label>Nombre de gagnants</label>
            <input
              type="number"
              min={1}
              max={50}
              value={winnerCount}
              onChange={(e) => setWinnerCount(Number(e.target.value) || 1)}
            />
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy || !catalogId}
            onClick={() => void runDraw()}
          >
            Lancer le tirage
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Catalogue</th>
                <th>Rôles</th>
                <th>Gagnants</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatWhen(r.drawnAt)}</td>
                  <td>
                    <strong>{r.catalogTitle}</strong>
                  </td>
                  <td className="meta">{r.roles.join(', ') || '—'}</td>
                  <td>
                    <strong>{r.winnerCount}</strong>
                    <div className="meta">
                      {r.winners
                        .slice(0, 3)
                        .map((w) => w.displayName || w.userId?.slice(0, 8) || '?')
                        .join(' · ') || '—'}
                      {r.winners.length > 3 ? '…' : ''}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !error ? (
            <p className="muted" style={{ padding: 16 }}>
              Aucun tirage enregistré pour ce pays.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
