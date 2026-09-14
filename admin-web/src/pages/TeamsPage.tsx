import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminCountry } from '../context/AdminCountryContext';
import { formatWhen } from '../lib/format';
import { listAdminUsersLite, type AdminUserLite } from '../lib/settings';
import { supabase } from '../lib/supabase';

interface StaffOverrideRow {
  userId: string;
  enabled: boolean;
  updatedAt: string | null;
}

export function TeamsPage() {
  const { countryLabel } = useAdminCountry();
  const [admins, setAdmins] = useState<AdminUserLite[]>([]);
  const [overrides, setOverrides] = useState<StaffOverrideRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setAdmins(await listAdminUsersLite());
    const { data, error } = await supabase
      .from('staff_benefit_overrides')
      .select('user_id, enabled, updated_at')
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) {
      setMsg(error.message);
      setOverrides([]);
      return;
    }
    setOverrides(
      (data ?? []).map((r) => ({
        userId: String(r.user_id),
        enabled: r.enabled !== false,
        updatedAt: r.updated_at ? String(r.updated_at) : null,
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = new Map(admins.map((a) => [a.id, a]));

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Pack équipe</p>
          <h2>TEAMS</h2>
          <p className="meta">
            Overrides privilèges staff — {countryLabel}. Configuration avancée du pack encore sur
            mobile ; catalogue via <Link to="/privileges">Privilèges</Link>.
          </p>
        </div>
      </header>
      {msg ? <p className="error-text">{msg}</p> : null}

      <div className="kpi-grid">
        <div className="card kpi-card">
          <div className="meta">Admins</div>
          <strong>{admins.length}</strong>
        </div>
        <div className="card kpi-card">
          <div className="meta">Overrides</div>
          <strong>{overrides.length}</strong>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Admin</th>
              <th>Override</th>
              <th>Mis à jour</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((o) => {
              const admin = byId.get(o.userId);
              return (
                <tr key={o.userId}>
                  <td>
                    <strong>{admin?.name ?? o.userId.slice(0, 8)}</strong>
                    <div className="meta">{admin?.email ?? o.userId}</div>
                  </td>
                  <td>
                    <span className={`badge ${o.enabled ? 'ok' : 'warn'}`}>
                      {o.enabled ? 'Actif' : 'Désactivé'}
                    </span>
                  </td>
                  <td>{formatWhen(o.updatedAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {overrides.length === 0 ? (
          <p className="muted" style={{ padding: 16 }}>
            Aucun override TEAMS en base.
          </p>
        ) : null}
      </div>
    </section>
  );
}
