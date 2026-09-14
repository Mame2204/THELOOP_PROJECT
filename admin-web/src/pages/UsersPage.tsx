import { useCallback, useEffect, useState } from 'react';
import { fetchUsersActivity } from '../lib/api';
import { supabase } from '../lib/supabase';
import { formatWhen } from '../lib/format';
import { useAdminCountry } from '../context/AdminCountryContext';

const PAGE = 20;

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  userRole: string;
  isActive: boolean;
  countryCode: string | null;
  lastSeenAt: string | null;
  lastSignInAt: string | null;
}

export function UsersPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [filterCountry, setFilterCountry] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    let query = supabase
      .from('users')
      .select(
        'id, email, first_name, last_name, user_role, is_active, last_seen_at, country_code',
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);

    if (filterCountry) {
      query = query.eq('country_code', countryCode);
    }

    const q = searchApplied.trim();
    if (q) {
      query = query.or(
        `email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`,
      );
    }

    const { data, error: qErr, count } = await query;
    if (qErr) {
      setError(qErr.message);
      setUsers([]);
      return;
    }

    const ids = (data ?? []).map((r) => r.id);
    const activity = await fetchUsersActivity(ids);
    setTotal(count ?? 0);
    setUsers(
      (data ?? []).map((r) => ({
        id: r.id,
        email: r.email ?? '—',
        fullName: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Sans nom',
        userRole: r.user_role ?? 'member',
        isActive: r.is_active ?? true,
        countryCode: (r as { country_code?: string | null }).country_code ?? null,
        lastSeenAt: (r as { last_seen_at?: string | null }).last_seen_at ?? null,
        lastSignInAt: activity[r.id]?.lastSignInAt ?? null,
      })),
    );
  }, [countryCode, filterCountry, page, searchApplied]);

  useEffect(() => {
    void load();
  }, [load]);

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Membres</p>
          <h2>Utilisateurs</h2>
          <p className="meta">
            Liste et activité — édition complète (rôles, waitlist) à venir.
          </p>
        </div>
      </header>

      <div className="toolbar">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher e-mail ou nom…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              setPage(0);
              setSearchApplied(search.trim());
            }
          }}
        />
        <button
          type="button"
          className="btn small"
          onClick={() => {
            setPage(0);
            setSearchApplied(search.trim());
          }}
        >
          Rechercher
        </button>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={filterCountry}
            onChange={(e) => {
              setPage(0);
              setFilterCountry(e.target.checked);
            }}
          />
          Filtrer {countryLabel}
        </label>
      </div>

      {error ? <p className="error">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>E-mail</th>
              <th>Rôle</th>
              <th>Pays</th>
              <th>Activité</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const activity =
                u.lastSeenAt && u.lastSignInAt
                  ? new Date(u.lastSeenAt) >= new Date(u.lastSignInAt)
                    ? u.lastSeenAt
                    : u.lastSignInAt
                  : (u.lastSeenAt ?? u.lastSignInAt);
              return (
                <tr key={u.id}>
                  <td>
                    <strong>{u.fullName}</strong>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <span className={`badge ${u.isActive ? 'ok' : 'err'}`}>
                      {u.userRole}
                      {u.isActive ? '' : ' · suspendu'}
                    </span>
                  </td>
                  <td>{u.countryCode ?? '—'}</td>
                  <td>{formatWhen(activity)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && !error ? (
          <p className="muted" style={{ padding: 16 }}>
            Aucun utilisateur.
          </p>
        ) : null}
      </div>

      {total > PAGE ? (
        <div className="pager">
          <button
            type="button"
            className="btn ghost"
            disabled={page <= 0}
            onClick={() => setPage((x) => x - 1)}
          >
            Précédent
          </button>
          <span className="muted">
            Page {page + 1}/{pages} · {total}
          </span>
          <button
            type="button"
            className="btn ghost"
            disabled={page + 1 >= pages}
            onClick={() => setPage((x) => x + 1)}
          >
            Suivant
          </button>
        </div>
      ) : null}
    </section>
  );
}
