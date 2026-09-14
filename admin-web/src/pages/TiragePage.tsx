import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminCountry } from '../context/AdminCountryContext';
import { formatWhen } from '../lib/format';
import { supabase } from '../lib/supabase';

interface DrawRow {
  id: string;
  catalogTitle: string;
  winnerCount: number;
  countryCode: string;
  drawnAt: string;
  roles: string[];
  winners: { displayName?: string | null; userId?: string }[];
}

export function TiragePage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const [rows, setRows] = useState<DrawRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
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
  }, [countryCode]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Loterie privilèges</p>
          <h2>Tirage</h2>
          <p className="meta">
            Historique des tirages — {countryLabel}. Lancer un nouveau tirage reste sur mobile ;
            catalogue : <Link to="/privileges">Privilèges</Link>.
          </p>
        </div>
        <button type="button" className="btn ghost small" onClick={() => void load()}>
          Actualiser
        </button>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

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
    </section>
  );
}
