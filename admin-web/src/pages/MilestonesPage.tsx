import { useCallback, useEffect, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import { formatWhen } from '../lib/format';
import { supabase } from '../lib/supabase';

interface RuleRow {
  id: string;
  name: string;
  metricType: string;
  threshold: number;
  rewardType: string;
  periodMonths: number;
  isActive: boolean;
  archived: boolean;
  updatedAt: string | null;
}

export function MilestonesPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    let q = supabase
      .from('partner_milestone_rules')
      .select(
        'id, name, metric_type, threshold, reward_type, period_months, is_active, archived, country_code, updated_at, sort_order',
      )
      .order('sort_order', { ascending: true })
      .limit(200);
    if (countryCode) q = q.eq('country_code', countryCode);
    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    setRows(
      (data ?? [])
        .map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ''),
          metricType: String(r.metric_type ?? ''),
          threshold: Number(r.threshold ?? 0),
          rewardType: String(r.reward_type ?? ''),
          periodMonths: Number(r.period_months ?? 1),
          isActive: r.is_active !== false,
          archived: r.archived === true,
          updatedAt: r.updated_at ? String(r.updated_at) : null,
        }))
        .filter((r) => (showArchived ? true : !r.archived)),
    );
  }, [countryCode, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(id: string, isActive: boolean) {
    const { error: err } = await supabase
      .from('partner_milestone_rules')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) {
      setMsg(err.message);
      return;
    }
    setMsg(isActive ? 'Palier activé.' : 'Palier désactivé.');
    void load();
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Paliers partenaires</h2>
          <p className="meta">
            Récompenses milestones — {countryLabel}. Création détaillée encore sur mobile.
          </p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Archives
          </label>
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Actualiser
          </button>
        </div>
      </header>
      {error ? <p className="error-text">{error}</p> : null}
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Palier</th>
              <th>Seuil</th>
              <th>Récompense</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <div className="meta">{r.metricType}</div>
                </td>
                <td>
                  <strong>{r.threshold}</strong>
                  <div className="meta">{r.periodMonths} mois</div>
                </td>
                <td className="meta">{r.rewardType}</td>
                <td>
                  <span className={`badge ${r.isActive && !r.archived ? 'ok' : 'warn'}`}>
                    {r.archived ? 'archivé' : r.isActive ? 'actif' : 'off'}
                  </span>
                  <div className="meta">{formatWhen(r.updatedAt)}</div>
                </td>
                <td>
                  {!r.archived ? (
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => void toggleActive(r.id, !r.isActive)}
                    >
                      {r.isActive ? 'Désactiver' : 'Activer'}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !error ? (
          <p className="muted" style={{ padding: 16 }}>
            Aucun palier.
          </p>
        ) : null}
      </div>
    </section>
  );
}
