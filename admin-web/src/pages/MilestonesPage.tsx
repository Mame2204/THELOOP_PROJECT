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
  const [draftName, setDraftName] = useState('');
  const [draftThreshold, setDraftThreshold] = useState(20);
  const [draftMetric, setDraftMetric] = useState('validations');
  const [draftReward, setDraftReward] = useState('featured_week');
  const [busy, setBusy] = useState(false);

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

  async function createRule() {
    if (!draftName.trim() || draftThreshold < 1) {
      setMsg('Nom et seuil requis.');
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    const { error: err } = await supabase.from('partner_milestone_rules').insert({
      id: crypto.randomUUID(),
      name: draftName.trim(),
      description: null,
      metric_type: draftMetric,
      threshold: draftThreshold,
      reward_type: draftReward,
      duration_days: 7,
      validity_days: 30,
      push_title: 'Palier atteint',
      push_message: 'Félicitations — récompense partenaire disponible.',
      country_code: countryCode,
      is_active: true,
      archived: false,
      period_months: 1,
      sort_order: rows.length,
      created_at: now,
      updated_at: now,
    });
    setBusy(false);
    if (err) {
      setMsg(err.message);
      return;
    }
    setDraftName('');
    setMsg('Palier créé.');
    void load();
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Paliers partenaires</h2>
          <p className="meta">Récompenses milestones — {countryLabel}.</p>
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

      <div className="split-pane">
        <div className="card">
          <h3>Nouveau palier</h3>
          <div className="field">
            <label>Nom</label>
            <input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
          </div>
          <div className="field">
            <label>Métrique</label>
            <select value={draftMetric} onChange={(e) => setDraftMetric(e.target.value)}>
              <option value="validations">Validations</option>
              <option value="unique_members">Membres uniques</option>
            </select>
          </div>
          <div className="field">
            <label>Seuil</label>
            <input
              type="number"
              min={1}
              value={draftThreshold}
              onChange={(e) => setDraftThreshold(Number(e.target.value) || 1)}
            />
          </div>
          <div className="field">
            <label>Récompense</label>
            <select value={draftReward} onChange={(e) => setDraftReward(e.target.value)}>
              <option value="featured_week">À la une (semaine)</option>
              <option value="push_once">Push unique</option>
            </select>
          </div>
          <button type="button" className="btn" disabled={busy} onClick={() => void createRule()}>
            Créer
          </button>
        </div>

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
      </div>
    </section>
  );
}
