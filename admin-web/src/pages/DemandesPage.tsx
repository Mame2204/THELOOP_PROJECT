import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminCountry } from '../context/AdminCountryContext';
import { usePermissions } from '../context/PermissionsContext';
import { formatWhen } from '../lib/format';
import {
  PARTNERSHIP_STATUS_LABELS,
  PARTNERSHIP_STATUSES,
  addPartnershipNote,
  listPartnershipRequests,
  updatePartnershipStatus,
  type PartnershipRequest,
  type PartnershipStatus,
} from '../lib/partnerships';
import {
  approveStagingItem,
  listPendingStaging,
  rejectStagingItem,
  type StagingKind,
  type StagingQueueItem,
} from '../lib/moderation';
import {
  SUGGESTION_STATUS_LABELS,
  SUGGESTION_TYPE_LABELS,
  listCommunitySuggestions,
  nextSuggestionStatus,
  updateSuggestionStatus,
  type CommunitySuggestion,
  type SuggestionStatus,
  type SuggestionType,
} from '../lib/suggestions';

type HubTab = 'partnerships' | 'moderation' | 'ideas';
type ModFilter = 'all' | StagingKind;

function partnershipBadge(status: PartnershipStatus): string {
  if (status === 'approved') return 'ok';
  if (status === 'rejected') return 'err';
  return 'warn';
}

export function DemandesPage() {
  const { profile } = useAuth();
  const { countryCode, countryLabel } = useAdminCountry();
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();

  const canPartnerships = can('partnerships');
  const canModeration = can('moderation');
  const canIdeas = can('suggestions');
  const canModEvents = can('moderation_events') || canModeration;
  const canModSpots = can('moderation_spots') || canModeration;
  const canModTools = can('moderation_tools') || canModeration;

  const defaultTab: HubTab = canPartnerships
    ? 'partnerships'
    : canModeration
      ? 'moderation'
      : 'ideas';

  const tabParam = params.get('tab');
  const tab: HubTab =
    tabParam === 'partnerships' || tabParam === 'moderation' || tabParam === 'ideas'
      ? tabParam
      : defaultTab;

  function setTab(next: HubTab) {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', next);
      return p;
    });
  }

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [partnerships, setPartnerships] = useState<PartnershipRequest[]>([]);
  const [pFilter, setPFilter] = useState<PartnershipStatus | 'all'>('pending');
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [pError, setPError] = useState<string | null>(null);

  const [queue, setQueue] = useState<StagingQueueItem[]>([]);
  const [modFilter, setModFilter] = useState<ModFilter>('all');
  const [selected, setSelected] = useState<StagingQueueItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [modError, setModError] = useState<string | null>(null);

  const [ideas, setIdeas] = useState<CommunitySuggestion[]>([]);
  const [ideaStatus, setIdeaStatus] = useState<SuggestionStatus | 'all'>('pending');
  const [ideaType, setIdeaType] = useState<SuggestionType | 'all'>('all');
  const [ideaError, setIdeaError] = useState<string | null>(null);

  const loadPartnerships = useCallback(async () => {
    setPError(null);
    const res = await listPartnershipRequests(countryCode);
    if (res.error) setPError(res.error);
    setPartnerships(res.items);
  }, [countryCode]);

  const loadModeration = useCallback(async () => {
    setModError(null);
    const res = await listPendingStaging(countryCode);
    if (res.error) setModError(res.error);
    setQueue(res.items);
  }, [countryCode]);

  const loadIdeas = useCallback(async () => {
    setIdeaError(null);
    const res = await listCommunitySuggestions(countryCode);
    if (res.error) setIdeaError(res.error);
    setIdeas(res.items);
  }, [countryCode]);

  useEffect(() => {
    setMsg(null);
    if (tab === 'partnerships' && canPartnerships) void loadPartnerships();
    if (tab === 'moderation' && canModeration) void loadModeration();
    if (tab === 'ideas' && canIdeas) void loadIdeas();
  }, [
    tab,
    canPartnerships,
    canModeration,
    canIdeas,
    loadPartnerships,
    loadModeration,
    loadIdeas,
  ]);

  const filteredPartnerships = useMemo(
    () => partnerships.filter((p) => pFilter === 'all' || p.status === pFilter),
    [partnerships, pFilter],
  );

  const permissionedQueue = useMemo(() => {
    return queue.filter((item) => {
      if (item.kind === 'event' && !canModEvents) return false;
      if (item.kind === 'spot' && !canModSpots) return false;
      if (item.kind === 'tool' && !canModTools) return false;
      return true;
    });
  }, [queue, canModEvents, canModSpots, canModTools]);

  const filteredQueue = useMemo(() => {
    if (modFilter === 'all') return permissionedQueue;
    return permissionedQueue.filter((item) => item.kind === modFilter);
  }, [permissionedQueue, modFilter]);

  const filteredIdeas = useMemo(
    () =>
      ideas.filter(
        (s) =>
          (ideaStatus === 'all' || s.status === ideaStatus) &&
          (ideaType === 'all' || s.suggestionType === ideaType),
      ),
    [ideas, ideaStatus, ideaType],
  );

  async function handleStatus(id: string, status: PartnershipStatus) {
    setBusy(true);
    const res = await updatePartnershipStatus(id, status);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Mise à jour impossible');
      return;
    }
    setMsg('Statut mis à jour.');
    void loadPartnerships();
  }

  async function handleNote(e: FormEvent, partnershipId: string) {
    e.preventDefault();
    const body = noteDraft[partnershipId]?.trim();
    if (!body || !profile) return;
    setBusy(true);
    const name =
      [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email || 'Admin';
    const res = await addPartnershipNote(partnershipId, body, profile.id, name);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Note impossible');
      return;
    }
    setNoteDraft((prev) => ({ ...prev, [partnershipId]: '' }));
    setMsg('Note enregistrée.');
    void loadPartnerships();
  }

  async function handleApprove(item: StagingQueueItem) {
    if (!window.confirm(`Approuver « ${item.title} » ?`)) return;
    setBusy(true);
    const res = await approveStagingItem(item);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Publication impossible');
      return;
    }
    setMsg('Contenu publié.');
    setSelected(null);
    void loadModeration();
  }

  async function handleReject(item: StagingQueueItem) {
    const reason = rejectReason.trim();
    if (!reason) {
      setMsg('Motif de refus obligatoire.');
      return;
    }
    setBusy(true);
    const res = await rejectStagingItem(item, reason);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Refus impossible');
      return;
    }
    setMsg('Soumission refusée.');
    setRejectReason('');
    setSelected(null);
    void loadModeration();
  }

  async function cycleIdea(s: CommunitySuggestion) {
    const next = nextSuggestionStatus(s.status);
    setBusy(true);
    const res = await updateSuggestionStatus(s.id, next);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Mise à jour impossible');
      return;
    }
    setMsg(`Idée → ${SUGGESTION_STATUS_LABELS[next]}`);
    void loadIdeas();
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Control Tower</p>
          <h2>Demandes</h2>
          <p className="meta">
            Partenariats, modération staging et idées — pays : {countryLabel}.
          </p>
        </div>
      </header>

      <nav className="tabs">
        {canPartnerships ? (
          <button
            type="button"
            className={`tab ${tab === 'partnerships' ? 'active' : ''}`}
            onClick={() => setTab('partnerships')}
          >
            Partenariats
          </button>
        ) : null}
        {canModeration ? (
          <button
            type="button"
            className={`tab ${tab === 'moderation' ? 'active' : ''}`}
            onClick={() => setTab('moderation')}
          >
            Modération
          </button>
        ) : null}
        {canIdeas ? (
          <button
            type="button"
            className={`tab ${tab === 'ideas' ? 'active' : ''}`}
            onClick={() => setTab('ideas')}
          >
            Idées
          </button>
        ) : null}
      </nav>

      {msg ? <p className="muted">{msg}</p> : null}

      {tab === 'partnerships' && canPartnerships ? (
        <>
          {pError ? <p className="error-text">{pError}</p> : null}
          <div className="tabs" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`tab ${pFilter === 'all' ? 'active' : ''}`}
              onClick={() => setPFilter('all')}
            >
              Tous
            </button>
            {PARTNERSHIP_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={`tab ${pFilter === s ? 'active' : ''}`}
                onClick={() => setPFilter(s)}
              >
                {PARTNERSHIP_STATUS_LABELS[s]}
              </button>
            ))}
          </div>

          <div className="card-stack">
            {filteredPartnerships.map((p) => (
              <article key={p.id} className="card">
                <div className="row-between">
                  <div>
                    <strong>{p.establishmentName || p.managerName}</strong>
                    <div className="meta">
                      {p.managerName} · {p.email} · {p.phone}
                    </div>
                    <div className="meta">{formatWhen(p.createdAt)}</div>
                  </div>
                  <span className={`badge ${partnershipBadge(p.status)}`}>
                    {PARTNERSHIP_STATUS_LABELS[p.status]}
                  </span>
                </div>
                {p.adminNotes ? <p className="muted" style={{ marginTop: 8 }}>{p.adminNotes}</p> : null}

                <div className="edit-actions" style={{ marginTop: 10 }}>
                  {PARTNERSHIP_STATUSES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`btn small ghost${p.status === s ? '' : ''}`}
                      disabled={busy || p.status === s}
                      onClick={() => void handleStatus(p.id, s)}
                    >
                      {PARTNERSHIP_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>

                {p.notes.length > 0 ? (
                  <ul className="note-list">
                    {p.notes.slice(0, 5).map((n) => (
                      <li key={n.id}>
                        <span className="meta">
                          {n.authorName} · {formatWhen(n.createdAt)}
                        </span>
                        <div>{n.body}</div>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <form className="note-form" onSubmit={(e) => void handleNote(e, p.id)}>
                  <input
                    value={noteDraft[p.id] ?? ''}
                    onChange={(e) =>
                      setNoteDraft((prev) => ({ ...prev, [p.id]: e.target.value }))
                    }
                    placeholder="Ajouter une note…"
                  />
                  <button className="btn small" type="submit" disabled={busy}>
                    Noter
                  </button>
                </form>
              </article>
            ))}
            {filteredPartnerships.length === 0 ? (
              <p className="muted">Aucune demande pour ce filtre.</p>
            ) : null}
          </div>
        </>
      ) : null}

      {tab === 'moderation' && canModeration ? (
        <>
          {modError ? <p className="error-text">{modError}</p> : null}
          <div className="tabs" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`tab ${modFilter === 'all' ? 'active' : ''}`}
              onClick={() => setModFilter('all')}
            >
              Tous ({permissionedQueue.length})
            </button>
            {canModEvents ? (
              <button
                type="button"
                className={`tab ${modFilter === 'event' ? 'active' : ''}`}
                onClick={() => setModFilter('event')}
              >
                Événements
              </button>
            ) : null}
            {canModSpots ? (
              <button
                type="button"
                className={`tab ${modFilter === 'spot' ? 'active' : ''}`}
                onClick={() => setModFilter('spot')}
              >
                Spots
              </button>
            ) : null}
            {canModTools ? (
              <button
                type="button"
                className={`tab ${modFilter === 'tool' ? 'active' : ''}`}
                onClick={() => setModFilter('tool')}
              >
                Outils
              </button>
            ) : null}
          </div>

          <div className="split-pane">
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Titre</th>
                    <th>Partenaire</th>
                    <th>Mis à jour</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.map((item) => (
                    <tr
                      key={`${item.kind}-${item.localId}`}
                      className={selected?.localId === item.localId ? 'row-selected' : ''}
                      onClick={() => {
                        setSelected(item);
                        setRejectReason('');
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <span className="badge warn">
                          {item.kind === 'event'
                            ? 'Événement'
                            : item.kind === 'tool'
                              ? 'Outil'
                              : 'Spot'}
                        </span>
                      </td>
                      <td>
                        <strong>{item.title}</strong>
                        <div className="meta">{item.subtitle}</div>
                      </td>
                      <td>{item.partnerName}</td>
                      <td>{formatWhen(item.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredQueue.length === 0 ? (
                <p className="muted" style={{ padding: 16 }}>
                  File d’attente vide.
                </p>
              ) : null}
            </div>

            {selected ? (
              <div className="card edit-panel">
                <h3>{selected.title}</h3>
                <p className="meta">
                  {selected.partnerName} · {selected.countryCode}
                </p>
                {selected.coverImageUrl ? (
                  <img
                    src={selected.coverImageUrl}
                    alt=""
                    style={{
                      width: '100%',
                      maxHeight: 160,
                      objectFit: 'cover',
                      borderRadius: 10,
                      margin: '10px 0',
                    }}
                  />
                ) : null}
                <p style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>{selected.description}</p>
                <div className="edit-actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void handleApprove(selected)}
                  >
                    Approuver
                  </button>
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label>Motif de refus</label>
                  <textarea
                    rows={3}
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Obligatoire pour refuser…"
                  />
                </div>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={busy}
                  onClick={() => void handleReject(selected)}
                >
                  Refuser
                </button>
              </div>
            ) : (
              <p className="muted">Sélectionnez une soumission.</p>
            )}
          </div>
        </>
      ) : null}

      {tab === 'ideas' && canIdeas ? (
        <>
          {ideaError ? <p className="error-text">{ideaError}</p> : null}
          <div className="toolbar" style={{ marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select
              value={ideaStatus}
              onChange={(e) => setIdeaStatus(e.target.value as SuggestionStatus | 'all')}
            >
              <option value="all">Tous statuts</option>
              {(Object.keys(SUGGESTION_STATUS_LABELS) as SuggestionStatus[]).map((s) => (
                <option key={s} value={s}>
                  {SUGGESTION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <select
              value={ideaType}
              onChange={(e) => setIdeaType(e.target.value as SuggestionType | 'all')}
            >
              <option value="all">Tous types</option>
              {(Object.keys(SUGGESTION_TYPE_LABELS) as SuggestionType[]).map((t) => (
                <option key={t} value={t}>
                  {SUGGESTION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Idée</th>
                  <th>Type</th>
                  <th>Contact</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredIdeas.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.title || s.placeName || 'Sans titre'}</strong>
                      <div className="meta" style={{ maxWidth: 360 }}>
                        {s.description.slice(0, 160)}
                        {s.description.length > 160 ? '…' : ''}
                      </div>
                      <div className="meta">{formatWhen(s.createdAt)}</div>
                    </td>
                    <td>{SUGGESTION_TYPE_LABELS[s.suggestionType]}</td>
                    <td>
                      <div className="meta">
                        {[s.contactName, s.contactEmail, s.contactPhone]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          s.status === 'done' ? 'ok' : s.status === 'dismissed' ? 'err' : 'warn'
                        }`}
                      >
                        {SUGGESTION_STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn small ghost"
                        disabled={busy}
                        onClick={() => void cycleIdea(s)}
                      >
                        Avancer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredIdeas.length === 0 ? (
              <p className="muted" style={{ padding: 16 }}>
                Aucune idée pour ces filtres.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
