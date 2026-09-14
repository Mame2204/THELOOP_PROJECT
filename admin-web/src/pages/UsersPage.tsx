import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAdminCountry } from '../context/AdminCountryContext';
import { isSuperAdminUser } from '../lib/permissions';
import { COUNTRY_OPTIONS } from '../lib/countries';
import { formatWhen } from '../lib/format';
import {
  archiveUser,
  createUserInvite,
  deleteUserIfOrphan,
  inviteFromWaitlist,
  listAdminUsers,
  listWaitlist,
  rejectWaitlist,
  roleLabel,
  rolesEditableBy,
  sendPasswordReset,
  setUserActive,
  updateAdminUser,
  type AdminUserRow,
  type UserRoleDb,
  type WaitlistEntry,
  type WaitlistStatus,
} from '../lib/users';

type Tab = 'list' | 'waitlist' | 'invite';
const PAGE = 20;

function emptyForm(countryCode: string) {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phoneNumber: '',
    city: '',
    countryCode,
    birthDate: '',
    userRole: 'member' as UserRoleDb,
    isActive: true,
    partnerCanManageEvents: true,
    partnerCanManageSpots: true,
    partnerCanManageTools: true,
  };
}

export function UsersPage() {
  const { profile } = useAuth();
  const { countryCode, countryLabel } = useAdminCountry();
  const isSuper = isSuperAdminUser(profile?.role);
  const allowedRoles = rolesEditableBy(profile?.role ?? 'admin');

  const [tab, setTab] = useState<Tab>('list');
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [filterCountry, setFilterCountry] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'suspended'>('all');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [form, setForm] = useState(emptyForm(countryCode));
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [wlStatus, setWlStatus] = useState<WaitlistStatus | 'all'>('pending');
  const [wlError, setWlError] = useState<string | null>(null);

  const [inviteForm, setInviteForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    phone: '',
    city: '',
    userRole: 'member' as UserRoleDb,
  });
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setError(null);
    const res = await listAdminUsers({
      page,
      pageSize: PAGE,
      search: searchApplied,
      countryCode,
      filterCountry,
      role: roleFilter || null,
      activeOnly: activeFilter === 'all' ? null : activeFilter === 'active',
    });
    if (res.error) setError(res.error);
    setUsers(res.users);
    setTotal(res.total);
  }, [activeFilter, countryCode, filterCountry, page, roleFilter, searchApplied]);

  const loadWaitlist = useCallback(async () => {
    setWlError(null);
    const res = await listWaitlist(wlStatus);
    if (res.error) setWlError(res.error);
    setWaitlist(res.entries);
  }, [wlStatus]);

  useEffect(() => {
    if (tab === 'list') void loadUsers();
  }, [tab, loadUsers]);

  useEffect(() => {
    if (tab === 'waitlist') void loadWaitlist();
  }, [tab, loadWaitlist]);

  useEffect(() => {
    if (!selected) return;
    setForm({
      firstName: selected.firstName ?? '',
      lastName: selected.lastName ?? '',
      email: selected.email,
      phoneNumber: selected.phoneNumber ?? '',
      city: selected.city ?? '',
      countryCode: selected.countryCode ?? countryCode,
      birthDate: selected.birthDate?.slice(0, 10) ?? '',
      userRole: selected.userRole,
      isActive: selected.isActive,
      partnerCanManageEvents: selected.partnerCanManageEvents,
      partnerCanManageSpots: selected.partnerCanManageSpots,
      partnerCanManageTools: selected.partnerCanManageTools,
    });
    setFormMsg(null);
  }, [selected, countryCode]);

  const pages = Math.max(1, Math.ceil(total / PAGE));
  const editingSelf = selected?.id === profile?.id;

  const activityOf = useMemo(
    () => (u: AdminUserRow) => {
      if (u.lastSeenAt && u.lastSignInAt) {
        return new Date(u.lastSeenAt) >= new Date(u.lastSignInAt)
          ? u.lastSeenAt
          : u.lastSignInAt;
      }
      return u.lastSeenAt ?? u.lastSignInAt;
    },
    [],
  );

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!selected || !profile) return;
    if (editingSelf && form.userRole !== selected.userRole) {
      setFormMsg('Vous ne pouvez pas modifier votre propre rôle.');
      return;
    }
    if (form.userRole === 'partner') {
      const any =
        form.partnerCanManageEvents ||
        form.partnerCanManageSpots ||
        form.partnerCanManageTools;
      if (!any) {
        setFormMsg('Un partenaire doit avoir au moins un module (events/spots/outils).');
        return;
      }
    }
    setBusy(true);
    setFormMsg(null);
    const res = await updateAdminUser(selected.id, form, { syncEmail: true });
    setBusy(false);
    if (!res.ok) {
      setFormMsg(res.error ?? 'Enregistrement impossible.');
      return;
    }
    setFormMsg(res.emailWarning ? `Sauvé. Attention : ${res.emailWarning}` : 'Enregistré.');
    void loadUsers();
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setInviteMsg(null);
    const res = await createUserInvite({
      ...inviteForm,
      countryCode,
      createdByAdminId: profile.id,
    });
    setBusy(false);
    if (!res.ok) {
      setInviteMsg(res.error ?? 'Invitation impossible.');
      return;
    }
    setInviteMsg('Invitation envoyée.');
    setInviteForm({
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      city: '',
      userRole: 'member',
    });
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Membres</p>
          <h2>Utilisateurs</h2>
          <p className="meta">Liste, édition, invitations et waitlist — pays : {countryLabel}</p>
        </div>
      </header>

      <nav className="tabs">
        <button type="button" className={`tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
          Liste
        </button>
        <button
          type="button"
          className={`tab ${tab === 'waitlist' ? 'active' : ''}`}
          onClick={() => setTab('waitlist')}
        >
          Waitlist
        </button>
        <button
          type="button"
          className={`tab ${tab === 'invite' ? 'active' : ''}`}
          onClick={() => setTab('invite')}
        >
          Inviter
        </button>
      </nav>

      {tab === 'list' ? (
        <>
          <div className="toolbar">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="E-mail, nom, téléphone…"
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
            <select
              value={roleFilter}
              onChange={(e) => {
                setPage(0);
                setRoleFilter(e.target.value);
              }}
            >
              <option value="">Tous rôles</option>
              {allowedRoles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            <select
              value={activeFilter}
              onChange={(e) => {
                setPage(0);
                setActiveFilter(e.target.value as typeof activeFilter);
              }}
            >
              <option value="all">Tous statuts</option>
              <option value="active">Actifs</option>
              <option value="suspended">Suspendus</option>
            </select>
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

          <div className="split-pane">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Rôle</th>
                    <th>Pays</th>
                    <th>Activité</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr
                      key={u.id}
                      className={selected?.id === u.id ? 'row-selected' : undefined}
                      onClick={() => setSelected(u)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <strong>
                          {`${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || 'Sans nom'}
                        </strong>
                        <div className="meta">{u.email}</div>
                      </td>
                      <td>
                        <span className={`badge ${u.isActive ? 'ok' : 'err'}`}>
                          {roleLabel(u.userRole)}
                          {u.isActive ? '' : ' · off'}
                        </span>
                      </td>
                      <td>{u.countryCode ?? '—'}</td>
                      <td>{formatWhen(activityOf(u))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && !error ? (
                <p className="muted" style={{ padding: 16 }}>
                  Aucun utilisateur.
                </p>
              ) : null}
            </div>

            {selected ? (
              <form className="edit-panel card" onSubmit={(e) => void handleSave(e)}>
                <h3>Édition</h3>
                <div className="field">
                  <label>Prénom</label>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    required
                  />
                </div>
                <div className="field">
                  <label>Nom</label>
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    required
                  />
                </div>
                <div className="field">
                  <label>E-mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    required
                  />
                </div>
                <div className="field">
                  <label>Téléphone</label>
                  <input
                    value={form.phoneNumber}
                    onChange={(e) => setForm((f) => ({ ...f, phoneNumber: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Ville</label>
                  <input
                    value={form.city}
                    onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Pays</label>
                  <select
                    value={form.countryCode}
                    onChange={(e) => setForm((f) => ({ ...f, countryCode: e.target.value }))}
                  >
                    {COUNTRY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Naissance</label>
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Rôle</label>
                  <select
                    value={form.userRole}
                    disabled={editingSelf}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, userRole: e.target.value as UserRoleDb }))
                    }
                  >
                    {allowedRoles.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="check-inline" style={{ marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    disabled={editingSelf}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                  />
                  Compte actif
                </label>
                {form.userRole === 'partner' ? (
                  <div className="partner-scopes">
                    <label className="check-inline">
                      <input
                        type="checkbox"
                        checked={form.partnerCanManageEvents}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, partnerCanManageEvents: e.target.checked }))
                        }
                      />
                      Events
                    </label>
                    <label className="check-inline">
                      <input
                        type="checkbox"
                        checked={form.partnerCanManageSpots}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, partnerCanManageSpots: e.target.checked }))
                        }
                      />
                      Spots
                    </label>
                    <label className="check-inline">
                      <input
                        type="checkbox"
                        checked={form.partnerCanManageTools}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, partnerCanManageTools: e.target.checked }))
                        }
                      />
                      Outils
                    </label>
                  </div>
                ) : null}

                <div className="edit-actions">
                  <button className="btn" type="submit" disabled={busy}>
                    Enregistrer
                  </button>
                  <button
                    className="btn ghost small"
                    type="button"
                    disabled={busy || editingSelf}
                    onClick={() => {
                      void setUserActive(selected.id, !selected.isActive).then((r) => {
                        if (!r.ok) setFormMsg(r.error ?? 'Erreur');
                        else {
                          setSelected(null);
                          void loadUsers();
                        }
                      });
                    }}
                  >
                    {selected.isActive ? 'Suspendre' : 'Réactiver'}
                  </button>
                  <button
                    className="btn ghost small"
                    type="button"
                    disabled={busy || !selected.email}
                    onClick={() => {
                      void sendPasswordReset(selected.email).then((r) => {
                        setFormMsg(r.ok ? 'E-mail de reset envoyé.' : r.error ?? 'Erreur');
                      });
                    }}
                  >
                    Reset MDP
                  </button>
                  {isSuper ? (
                    <>
                      <button
                        className="btn ghost small"
                        type="button"
                        disabled={busy || editingSelf}
                        onClick={() => {
                          if (!window.confirm('Archiver ce compte ?')) return;
                          void archiveUser(selected.id).then((r) => {
                            if (!r.ok) setFormMsg(r.error ?? 'Erreur');
                            else {
                              setSelected(null);
                              void loadUsers();
                            }
                          });
                        }}
                      >
                        Archiver
                      </button>
                      <button
                        className="btn ghost small"
                        type="button"
                        disabled={busy || editingSelf}
                        onClick={() => {
                          if (!window.confirm('Supprimer définitivement si orphelin ?')) return;
                          void deleteUserIfOrphan(selected.id).then((r) => {
                            if (!r.ok) setFormMsg(r.error ?? 'Erreur');
                            else if (!r.orphan) setFormMsg('Non orphelin — utilisez Archiver.');
                            else {
                              setSelected(null);
                              void loadUsers();
                            }
                          });
                        }}
                      >
                        Supprimer
                      </button>
                    </>
                  ) : null}
                </div>
                {formMsg ? <p className={formMsg.startsWith('Sauvé') || formMsg === 'Enregistré.' || formMsg.includes('envoyé') ? 'muted' : 'error'}>{formMsg}</p> : null}
              </form>
            ) : (
              <div className="card edit-panel">
                <p className="meta">Sélectionnez un utilisateur pour l’éditer.</p>
              </div>
            )}
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
        </>
      ) : null}

      {tab === 'waitlist' ? (
        <>
          <div className="toolbar">
            <select
              value={wlStatus}
              onChange={(e) => setWlStatus(e.target.value as WaitlistStatus | 'all')}
            >
              <option value="pending">En attente</option>
              <option value="invited">Invités</option>
              <option value="rejected">Refusés</option>
              <option value="all">Tous</option>
            </select>
            <button type="button" className="btn small ghost" onClick={() => void loadWaitlist()}>
              Actualiser
            </button>
          </div>
          {wlError ? <p className="error">{wlError}</p> : null}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>Pays</th>
                  <th>Statut</th>
                  <th>Créé</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <strong>{w.fullName || '—'}</strong>
                      <div className="meta">{w.email}</div>
                      <div className="meta">{w.phone ?? ''}</div>
                    </td>
                    <td>{w.countryCode}</td>
                    <td>
                      <span className="badge warn">{w.status}</span>
                    </td>
                    <td>{formatWhen(w.createdAt)}</td>
                    <td>
                      <div className="edit-actions">
                        {(w.status === 'pending' || w.status === 'invited') && profile ? (
                          <button
                            type="button"
                            className="btn small"
                            disabled={busy}
                            onClick={() => {
                              setBusy(true);
                              void inviteFromWaitlist(w, profile.id, 'member').then((r) => {
                                setBusy(false);
                                if (!r.ok) window.alert(r.error ?? 'Erreur');
                                else void loadWaitlist();
                              });
                            }}
                          >
                            {w.status === 'invited' ? 'Renvoyer' : 'Inviter'}
                          </button>
                        ) : null}
                        {w.status === 'pending' ? (
                          <button
                            type="button"
                            className="btn small ghost"
                            disabled={busy}
                            onClick={() => {
                              void rejectWaitlist(w.id).then((r) => {
                                if (!r.ok) window.alert(r.error ?? 'Erreur');
                                else void loadWaitlist();
                              });
                            }}
                          >
                            Refuser
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {waitlist.length === 0 && !wlError ? (
              <p className="muted" style={{ padding: 16 }}>
                Aucune entrée.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === 'invite' ? (
        <form className="card" style={{ maxWidth: 480 }} onSubmit={(e) => void handleInvite(e)}>
          <h3>Inviter un membre</h3>
          <p className="meta">Pays d’invitation : {countryLabel}</p>
          <div className="field">
            <label>E-mail</label>
            <input
              type="email"
              required
              value={inviteForm.email}
              onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Prénom</label>
            <input
              value={inviteForm.firstName}
              onChange={(e) => setInviteForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Nom</label>
            <input
              value={inviteForm.lastName}
              onChange={(e) => setInviteForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Téléphone</label>
            <input
              value={inviteForm.phone}
              onChange={(e) => setInviteForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Ville</label>
            <input
              value={inviteForm.city}
              onChange={(e) => setInviteForm((f) => ({ ...f, city: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Rôle</label>
            <select
              value={inviteForm.userRole}
              onChange={(e) =>
                setInviteForm((f) => ({ ...f, userRole: e.target.value as UserRoleDb }))
              }
            >
              {allowedRoles
                .filter((r) => r !== 'super_admin')
                .map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
            </select>
          </div>
          <button className="btn" type="submit" disabled={busy}>
            Envoyer l’invitation
          </button>
          {inviteMsg ? (
            <p className={inviteMsg.includes('envoyée') ? 'muted' : 'error'}>{inviteMsg}</p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
