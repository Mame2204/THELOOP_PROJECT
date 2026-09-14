import { useCallback, useEffect, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import { useAuth } from '../context/AuthContext';
import { formatWhen } from '../lib/format';
import { supabase } from '../lib/supabase';

const AUDIENCES = [
  { id: 'all', label: 'Tous' },
  { id: 'members', label: 'Membres' },
  { id: 'prime', label: 'Prime' },
  { id: 'prime_members', label: 'Prime + membres' },
  { id: 'partner', label: 'Partenaires' },
  { id: 'admin', label: 'Admins' },
  { id: 'individual', label: 'Individuel (tél.)' },
] as const;

interface CampaignRow {
  id: string;
  title: string;
  message: string;
  audience: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  createdAt: string | null;
}

export function NotificationsPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const { profile } = useAuth();
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [audience, setAudience] = useState<string>('all');
  const [targetPhone, setTargetPhone] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  const load = useCallback(async () => {
    setError(null);
    let q = supabase
      .from('admin_push_campaigns')
      .select(
        'id, title, message, audience, status, scheduled_at, sent_at, recipient_count, created_at, country_code',
      )
      .order('created_at', { ascending: false })
      .limit(80);
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
        title: String(r.title ?? ''),
        message: String(r.message ?? ''),
        audience: String(r.audience ?? ''),
        status: String(r.status ?? ''),
        scheduledAt: r.scheduled_at ? String(r.scheduled_at) : null,
        sentAt: r.sent_at ? String(r.sent_at) : null,
        recipientCount: Number(r.recipient_count ?? 0),
        createdAt: r.created_at ? String(r.created_at) : null,
      })),
    );
  }, [countryCode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCampaign() {
    if (!title.trim() || !message.trim()) {
      setMsg('Titre et message requis.');
      return;
    }
    if (audience === 'individual' && !targetPhone.trim()) {
      setMsg('Téléphone requis pour un envoi individuel.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const row = {
      id,
      title: title.trim(),
      message: message.trim(),
      audience,
      target_phone: audience === 'individual' ? targetPhone.trim() : null,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      sent_at: null,
      status: scheduledAt ? 'scheduled' : 'draft',
      recipient_count: 0,
      created_by: profile?.id ?? null,
      created_at: now,
      updated_at: now,
      country_code: countryCode,
    };
    const { error: err } = await supabase.from('admin_push_campaigns').upsert(row);
    setBusy(false);
    if (err) {
      setMsg(err.message);
      return;
    }
    setTitle('');
    setMessage('');
    setTargetPhone('');
    setScheduledAt('');
    setMsg(
      scheduledAt
        ? 'Campagne planifiée. L’envoi est traité par les jobs Control Tower.'
        : 'Brouillon créé. Finalisez l’envoi depuis l’app si besoin.',
    );
    void load();
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Notifications</h2>
          <p className="meta">Campagnes push — {countryLabel}.</p>
        </div>
        <button type="button" className="btn ghost small" onClick={() => void load()}>
          Actualiser
        </button>
      </header>
      {error ? <p className="error-text">{error}</p> : null}
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="split-pane">
        <div className="card">
          <h3>Nouvelle campagne</h3>
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
            <select value={audience} onChange={(e) => setAudience(e.target.value)}>
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
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void createCampaign()}
          >
            Enregistrer
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
