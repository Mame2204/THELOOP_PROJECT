import { useCallback, useEffect, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import { useAuth } from '../context/AuthContext';
import { formatWhen } from '../lib/format';
import {
  listPushCampaigns,
  sendPushCampaign,
  type NotificationAudience,
  type PushCampaign,
} from '../lib/notifications';

const AUDIENCES: { id: NotificationAudience; label: string }[] = [
  { id: 'all', label: 'Tous' },
  { id: 'members', label: 'Membres' },
  { id: 'prime', label: 'Prime' },
  { id: 'prime_members', label: 'Prime + membres' },
  { id: 'partner', label: 'Partenaires' },
  { id: 'admin', label: 'Admins' },
  { id: 'individual', label: 'Individuel (tél.)' },
];

export function NotificationsPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const { profile } = useAuth();
  const [rows, setRows] = useState<PushCampaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<NotificationAudience>('all');
  const [targetPhone, setTargetPhone] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const load = useCallback(async () => {
    try {
      setError(null);
      setRows(await listPushCampaigns(countryCode));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setRows([]);
    }
  }, [countryCode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSend() {
    setBusy(true);
    setMsg(null);
    const res = await sendPushCampaign({
      title,
      message,
      audience,
      countryCode,
      targetPhone,
      scheduledAt: scheduledAt || null,
      createdBy: profile?.id ?? null,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error ?? 'Échec');
      return;
    }
    setTitle('');
    setMessage('');
    setTargetPhone('');
    setScheduledAt('');
    setMsg(
      scheduledAt
        ? 'Campagne planifiée.'
        : `Envoyé — ${res.recipientCount ?? 0} destinataire(s).`,
    );
    void load();
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Notifications</h2>
          <p className="meta">
            Envoi immédiat ou planifié (RPC `admin_distribute_notifications`) — {countryLabel}.
          </p>
        </div>
        <button type="button" className="btn ghost small" onClick={() => void load()}>
          Actualiser
        </button>
      </header>
      {error ? <p className="error-text">{error}</p> : null}
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="split-pane">
        <div className="card">
          <h3>Envoyer</h3>
          <div className="field">
            <label>Titre</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Message</label>
            <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div className="field">
            <label>Audience</label>
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as NotificationAudience)}
            >
              {AUDIENCES.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          {audience === 'individual' ? (
            <div className="field">
              <label>Téléphone</label>
              <input value={targetPhone} onChange={(e) => setTargetPhone(e.target.value)} />
            </div>
          ) : null}
          <div className="field">
            <label>Planifier (optionnel)</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <button type="button" className="btn" disabled={busy} onClick={() => void handleSend()}>
            {scheduledAt ? 'Planifier' : 'Envoyer maintenant'}
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Campagne</th>
                <th>Audience</th>
                <th>Statut</th>
                <th>Dates</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.title}</strong>
                    <div className="meta">{r.message.slice(0, 80)}</div>
                  </td>
                  <td className="meta">{r.audience}</td>
                  <td>
                    <span className={`badge ${r.status === 'sent' ? 'ok' : 'warn'}`}>
                      {r.status}
                    </span>
                    <div className="meta">{r.recipientCount} dest.</div>
                  </td>
                  <td className="meta">
                    Créée {formatWhen(r.createdAt)}
                    {r.scheduledAt ? <div>Planif. {formatWhen(r.scheduledAt)}</div> : null}
                    {r.sentAt ? <div>Envoyée {formatWhen(r.sentAt)}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !error ? (
            <p className="muted" style={{ padding: 16 }}>
              Aucune campagne.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
