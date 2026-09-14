import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { fetchPaymentIntents, fetchUsersActivity, getApiUrl, reconcilePayment, type PaymentIntent, type PaymentSummary } from './lib/api';
import { supabase } from './lib/supabase';

type Tab = 'payments' | 'users';

interface AdminProfile {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
}

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  userRole: string;
  isActive: boolean;
  lastSeenAt: string | null;
  lastSignInAt: string | null;
}

const PAGE = 20;

function formatWhen(iso: string | null): string {
  if (!iso) return 'Jamais';
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function statusBadge(status: string): string {
  if (status === 'paid') return 'ok';
  if (status === 'failed' || status === 'cancelled') return 'err';
  return 'warn';
}

export function App() {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tab, setTab] = useState<Tab>('payments');

  const [payments, setPayments] = useState<PaymentIntent[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [payPage, setPayPage] = useState(0);
  const [payTotal, setPayTotal] = useState(0);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [userError, setUserError] = useState<string | null>(null);
  const [userPage, setUserPage] = useState(0);
  const [userTotal, setUserTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const { data: row, error } = await supabase
      .from('users')
      .select('id, email, user_role, first_name, last_name, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !row || !row.is_active || !['admin', 'super_admin'].includes(row.user_role ?? '')) {
      await supabase.auth.signOut();
      setProfile(null);
      setAuthError('Compte administrateur requis.');
      setLoading(false);
      return;
    }

    setProfile({
      id: row.id,
      email: row.email ?? user.email ?? '',
      role: row.user_role,
      firstName: row.first_name,
      lastName: row.last_name,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void bootstrap();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void bootstrap();
    });
    return () => sub.subscription.unsubscribe();
  }, [bootstrap]);

  const loadPayments = useCallback(async () => {
    const res = await fetchPaymentIntents({ limit: PAGE, offset: payPage * PAGE });
    setPayError(res.error ?? null);
    setPayments(res.intents);
    setSummary(res.summary ?? null);
    setPayTotal(res.total ?? res.intents.length);
  }, [payPage]);

  const loadUsers = useCallback(async () => {
    setUserError(null);
    let query = supabase
      .from('users')
      .select('id, email, first_name, last_name, user_role, is_active, last_seen_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(userPage * PAGE, userPage * PAGE + PAGE - 1);

    const q = searchApplied.trim();
    if (q) {
      query = query.or(`email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      setUserError(error.message);
      setUsers([]);
      return;
    }

    const ids = (data ?? []).map((r) => r.id);
    const activity = await fetchUsersActivity(ids);
    setUserTotal(count ?? 0);
    setUsers(
      (data ?? []).map((r) => ({
        id: r.id,
        email: r.email ?? '—',
        fullName: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Sans nom',
        userRole: r.user_role ?? 'member',
        isActive: r.is_active ?? true,
        lastSeenAt: (r as { last_seen_at?: string | null }).last_seen_at ?? null,
        lastSignInAt: activity[r.id]?.lastSignInAt ?? null,
      })),
    );
  }, [searchApplied, userPage]);

  useEffect(() => {
    if (!profile) return;
    if (tab === 'payments') void loadPayments();
    if (tab === 'users') void loadUsers();
  }, [profile, tab, loadPayments, loadUsers]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setAuthError(error.message);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  if (loading) {
    return (
      <div className="login">
        <p className="muted">Chargement…</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="login">
        <form className="login-card" onSubmit={(e) => void handleLogin(e)}>
          <div className="brand-kicker">THE LOOP</div>
          <h1>Admin</h1>
          <p>Console web — paiements & utilisateurs. API : {getApiUrl() || 'non configurée'}</p>
          <div className="field">
            <label>E-mail</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required autoComplete="username" />
          </div>
          <div className="field">
            <label>Mot de passe</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required autoComplete="current-password" />
          </div>
          <button className="btn" type="submit">Connexion</button>
          {authError ? <p className="error">{authError}</p> : null}
        </form>
      </div>
    );
  }

  const payPages = Math.max(1, Math.ceil(payTotal / PAGE));
  const userPages = Math.max(1, Math.ceil(userTotal / PAGE));

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-kicker">THE LOOP · Control Tower</span>
          <h1 className="brand-title">Administration</h1>
          <span className="muted">
            {profile.email} · {profile.role}
          </span>
        </div>
        <button className="btn ghost" type="button" onClick={() => void handleLogout()}>
          Déconnexion
        </button>
      </header>

      <nav className="tabs">
        <button type="button" className={`tab ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}>
          Paiements PASS
        </button>
        <button type="button" className={`tab ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
          Utilisateurs
        </button>
      </nav>

      {tab === 'payments' ? (
        <section>
          {summary ? (
            <div className="kpi-row">
              <div className="kpi"><strong>{summary.paid}</strong><span>Payés</span></div>
              <div className="kpi"><strong>{summary.pending}</strong><span>En cours</span></div>
              <div className="kpi"><strong>{summary.failed}</strong><span>Échoués</span></div>
              <div className="kpi"><strong>{summary.paidVolumeGnf.toLocaleString('fr-FR')}</strong><span>GNF</span></div>
            </div>
          ) : null}
          {payError ? <p className="error">{payError}</p> : null}
          {payments.map((p) => (
            <article key={p.id} className="card">
              <div className="row">
                <div>
                  <h3>{p.userName || p.userEmail || 'Utilisateur'}</h3>
                  <p className="meta">
                    {p.billingPeriod} · {p.amountGnf.toLocaleString('fr-FR')} GNF · {formatWhen(p.createdAt)}
                    <br />
                    {p.userEmail} · Tx {p.djomyTransactionId ?? '—'}
                    <br />
                    Fulfillment {p.fulfillmentStatus} · Djomy {p.djomyStatus ?? '—'}
                  </p>
                </div>
                <div style={{ textAlign: 'right', display: 'grid', gap: 8, justifyItems: 'end' }}>
                  <span className={`badge ${statusBadge(p.status)}`}>{p.status}</span>
                  <button
                    type="button"
                    className="btn small ghost"
                    onClick={() => {
                      void reconcilePayment(p.id).then((r) => {
                        if (!r.ok) alert(r.error ?? 'Erreur');
                        else void loadPayments();
                      });
                    }}
                  >
                    Resync
                  </button>
                </div>
              </div>
            </article>
          ))}
          {payTotal > PAGE ? (
            <div className="pager">
              <button type="button" className="btn ghost" disabled={payPage <= 0} onClick={() => setPayPage((x) => x - 1)}>
                Précédent
              </button>
              <span className="muted">Page {payPage + 1}/{payPages}</span>
              <button type="button" className="btn ghost" disabled={payPage + 1 >= payPages} onClick={() => setPayPage((x) => x + 1)}>
                Suivant
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <section>
          <div className="toolbar">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher e-mail ou nom…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setUserPage(0);
                  setSearchApplied(search.trim());
                }
              }}
            />
            <button
              type="button"
              className="btn small"
              onClick={() => {
                setUserPage(0);
                setSearchApplied(search.trim());
              }}
            >
              Rechercher
            </button>
          </div>
          {userError ? <p className="error">{userError}</p> : null}
          {users.map((u) => {
            const activity = u.lastSeenAt && u.lastSignInAt
              ? new Date(u.lastSeenAt) >= new Date(u.lastSignInAt) ? u.lastSeenAt : u.lastSignInAt
              : u.lastSeenAt ?? u.lastSignInAt;
            return (
              <article key={u.id} className="card">
                <div className="row">
                  <div>
                    <h3>{u.fullName}</h3>
                    <p className="meta">
                      {u.email}
                      <br />
                      Dernière activité : {formatWhen(activity)}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`badge ${u.isActive ? 'ok' : 'err'}`}>{u.userRole}{u.isActive ? '' : ' · suspendu'}</span>
                  </div>
                </div>
              </article>
            );
          })}
          {userTotal > PAGE ? (
            <div className="pager">
              <button type="button" className="btn ghost" disabled={userPage <= 0} onClick={() => setUserPage((x) => x - 1)}>
                Précédent
              </button>
              <span className="muted">Page {userPage + 1}/{userPages} · {userTotal}</span>
              <button type="button" className="btn ghost" disabled={userPage + 1 >= userPages} onClick={() => setUserPage((x) => x + 1)}>
                Suivant
              </button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
