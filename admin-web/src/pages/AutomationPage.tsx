import { useCallback, useEffect, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import { formatWhen } from '../lib/format';
import { supabase } from '../lib/supabase';

interface JobRow {
  id: string;
  name: string;
  jobType: string;
  status: string;
  schedule: string;
  city: string | null;
  lastRunAt: string | null;
  lastRunCount: number;
  lastRunSummary: string | null;
  updatedAt: string | null;
}

export function AutomationPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const [rows, setRows] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    let q = supabase
      .from('admin_automation_jobs')
      .select(
        'id, name, job_type, status, schedule, country_code, city, last_run_at, last_run_count, last_run_summary, updated_at',
      )
      .order('updated_at', { ascending: false })
      .limit(100);
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
        name: String(r.name ?? ''),
        jobType: String(r.job_type ?? ''),
        status: String(r.status ?? ''),
        schedule: String(r.schedule ?? ''),
        city: r.city ? String(r.city) : null,
        lastRunAt: r.last_run_at ? String(r.last_run_at) : null,
        lastRunCount: Number(r.last_run_count ?? 0),
        lastRunSummary: r.last_run_summary ? String(r.last_run_summary) : null,
        updatedAt: r.updated_at ? String(r.updated_at) : null,
      })),
    );
  }, [countryCode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    setMsg(null);
    const { error: err } = await supabase
      .from('admin_automation_jobs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) {
      setMsg(err.message);
      return;
    }
    setMsg(`Statut → ${status}`);
    void load();
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Automatisations</h2>
          <p className="meta">
            Jobs planifiés (bienvenue, anniversaire, push…) — {countryLabel}. Création avancée
            encore disponible sur mobile.
          </p>
        </div>
        <button type="button" className="btn ghost small" onClick={() => void load()}>
          Actualiser
        </button>
      </header>
      {error ? <p className="error-text">{error}</p> : null}
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Job</th>
              <th>Type</th>
              <th>Planning</th>
              <th>Dernière exécution</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <div className="meta">{r.city || countryCode}</div>
                </td>
                <td className="meta">{r.jobType}</td>
                <td>
                  <span className={`badge ${r.status === 'active' ? 'ok' : 'warn'}`}>
                    {r.status}
                  </span>
                  <div className="meta">{r.schedule}</div>
                </td>
                <td className="meta">
                  {formatWhen(r.lastRunAt)}
                  {r.lastRunCount ? <div>{r.lastRunCount} envois</div> : null}
                  {r.lastRunSummary ? <div>{r.lastRunSummary.slice(0, 60)}</div> : null}
                </td>
                <td>
                  <div className="toolbar" style={{ margin: 0 }}>
                    {r.status !== 'active' ? (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => void setStatus(r.id, 'active')}
                      >
                        Activer
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => void setStatus(r.id, 'inactive')}
                      >
                        Pause
                      </button>
                    )}
                    {r.status !== 'archived' ? (
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => void setStatus(r.id, 'archived')}
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
        {rows.length === 0 && !error ? (
          <p className="muted" style={{ padding: 16 }}>
            Aucun job pour ce pays.
          </p>
        ) : null}
      </div>
    </section>
  );
}
