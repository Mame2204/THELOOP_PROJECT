import { useCallback, useEffect, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import { useAuth } from '../context/AuthContext';
import { formatWhen } from '../lib/format';
import {
  audienceLabel,
  AUDIENCE_LABELS,
  campaignStatusLabel,
  cancelPushCampaign,
  deletePushCampaign,
  isPushCampaignDeletable,
  isPushCampaignEditable,
  listPushCampaigns,
  sendPushCampaign,
  updatePushCampaign,
  type NotificationAudience,
  type PushCampaign,
} from '../lib/notifications';
import { listCategories, type CategoryRow } from '../lib/settings';

const AUDIENCES: NotificationAudience[] = [
  'all',
  'prime_members',
  'members',
  'prime',
  'partner',
  'admin',
  'favorites',
  'birthday',
  'individual',
];

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function favoriteSummary(c: PushCampaign): string | null {
  const parts: string[] = [];
  if (c.favoriteEventCategories.length) parts.push(`${c.favoriteEventCategories.length} év.`);
  if (c.favoriteSpotCategories.length) parts.push(`${c.favoriteSpotCategories.length} spot(s)`);
  if (c.favoriteToolCategories.length) parts.push(`${c.favoriteToolCategories.length} outil(s)`);
  return parts.length ? parts.join(' · ') : null;
}

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
  const [sendNow, setSendNow] = useState(true);
  const [scheduledAt, setScheduledAt] = useState('');
  const [favoriteEventCategories, setFavoriteEventCategories] = useState<string[]>([]);
  const [favoriteSpotCategories, setFavoriteSpotCategories] = useState<string[]>([]);
  const [favoriteToolCategories, setFavoriteToolCategories] = useState<string[]>([]);
  const [eventCats, setEventCats] = useState<CategoryRow[]>([]);
  const [spotCats, setSpotCats] = useState<CategoryRow[]>([]);
  const [toolCats, setToolCats] = useState<CategoryRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setRows(await listPushCampaigns(countryCode));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setRows([]);
    }
  }, [countryCode]);

  const loadCategories = useCallback(async () => {
    const [events, spots, tools] = await Promise.all([
      listCategories('event'),
      listCategories('spot'),
      listCategories('tool'),
    ]);
    setEventCats(events.items.filter((c) => c.isActive));
    setSpotCats(spots.items.filter((c) => c.isActive));
    setToolCats(tools.items.filter((c) => c.isActive));
  }, []);

  useEffect(() => {
    void load();
    void loadCategories();
  }, [load, loadCategories]);

  function toggleChip(list: string[], slug: string, setter: (v: string[]) => void) {
    setter(list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug]);
  }

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setMessage('');
    setAudience('all');
    setTargetPhone('');
    setSendNow(true);
    setScheduledAt('');
    setFavoriteEventCategories([]);
    setFavoriteSpotCategories([]);
    setFavoriteToolCategories([]);
  }

  function startEdit(campaign: PushCampaign) {
    setEditingId(campaign.id);
    setTitle(campaign.title);
    setMessage(campaign.message);
    setAudience(campaign.audience as NotificationAudience);
    setTargetPhone(campaign.targetPhone ?? '');
    setFavoriteEventCategories(campaign.favoriteEventCategories);
    setFavoriteSpotCategories(campaign.favoriteSpotCategories);
    setFavoriteToolCategories(campaign.favoriteToolCategories);
    const isScheduled = campaign.status === 'scheduled' && Boolean(campaign.scheduledAt);
    setSendNow(!isScheduled);
    setScheduledAt(isScheduled ? toDatetimeLocalValue(campaign.scheduledAt) : '');
    setMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleSend() {
    if (!title.trim() || !message.trim()) {
      setMsg('Titre et message obligatoires.');
      return;
    }
    if (audience === 'individual' && !targetPhone.trim()) {
      setMsg('E-mail(s) requis pour un envoi individuel (séparateur ;).');
      return;
    }
    if (
      audience === 'favorites' &&
      !favoriteEventCategories.length &&
      !favoriteSpotCategories.length &&
      !favoriteToolCategories.length
    ) {
      setMsg('Sélectionnez au moins une catégorie favori.');
      return;
    }
    if (!sendNow && !scheduledAt.trim()) {
      setMsg('Indiquez la date et l\'heure d\'envoi.');
      return;
    }
    if (!sendNow) {
      const when = new Date(scheduledAt);
      if (Number.isNaN(when.getTime())) {
        setMsg('Date ou heure invalide.');
        return;
      }
      if (when.getTime() <= Date.now()) {
        setMsg('La date et l\'heure doivent être dans le futur.');
        return;
      }
    }

    setBusy(true);
    setMsg(null);
    const wasEditing = Boolean(editingId);
    try {
      const payload = {
        title,
        message,
        audience,
        countryCode,
        targetPhone: audience === 'individual' ? targetPhone : null,
        favoriteEventCategories: audience === 'favorites' ? favoriteEventCategories : [],
        favoriteSpotCategories: audience === 'favorites' ? favoriteSpotCategories : [],
        favoriteToolCategories: audience === 'favorites' ? favoriteToolCategories : [],
        scheduledAt: sendNow ? null : new Date(scheduledAt).toISOString(),
        sendNow,
      };

      const res = editingId
        ? await updatePushCampaign(editingId, payload)
        : await sendPushCampaign({
            ...payload,
            scheduleOnly: !sendNow,
            createdBy: profile?.id ?? null,
          });

      if (!res.ok) {
        setMsg(res.error ?? 'Échec');
        return;
      }
      resetForm();
      setMsg(
        wasEditing
          ? sendNow
            ? `Campagne modifiée et envoyée — ${res.recipientCount ?? 0} destinataire(s).`
            : 'Campagne modifiée et replanifiée.'
          : sendNow
            ? `Envoyé — ${res.recipientCount ?? 0} destinataire(s).`
            : 'Campagne planifiée.',
      );
      void load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Erreur inattendue.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(id: string) {
    if (!window.confirm('Annuler cette campagne ?')) return;
    setMsg(null);
    if (editingId === id) resetForm();
    const res = await cancelPushCampaign(id);
    if (!res.ok) {
      setMsg(res.error ?? 'Annulation impossible.');
      return;
    }
    setMsg('Campagne annulée.');
    void load();
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Supprimer définitivement cette campagne ?')) return;
    setMsg(null);
    if (editingId === id) resetForm();
    const res = await deletePushCampaign(id);
    if (!res.ok) {
      setMsg(res.error ?? 'Suppression impossible.');
      return;
    }
    setMsg('Campagne supprimée.');
    void load();
  }

  function renderCategoryChips(
    items: CategoryRow[],
    selected: string[],
    setter: (v: string[]) => void,
  ) {
    return (
      <div className="chip-row">
        {items.map((cat) => {
          const active = selected.includes(cat.slug);
          const label = cat.emoji ? `${cat.emoji} ${cat.label}` : cat.label;
          return (
            <button
              key={cat.slug}
              type="button"
              className={`target-chip${active ? ' active' : ''}`}
              onClick={() => toggleChip(selected, cat.slug, setter)}
            >
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Notifications</h2>
          <p className="meta">
            Push immédiat ou planifié — rôles, anniversaires, favoris multi-catégories — {countryLabel}.
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
          <h3>{editingId ? 'Modifier la campagne' : 'Envoyer'}</h3>
          {editingId ? (
            <p className="meta" style={{ marginBottom: 12 }}>
              Modification d&apos;une campagne non envoyée.{' '}
              <button type="button" className="btn ghost small" onClick={resetForm}>
                Annuler la modification
              </button>
            </p>
          ) : null}

          <div className="field">
            <label>Destinataires</label>
            <div className="chip-row">
              {AUDIENCES.map((a) => (
                <button
                  key={a}
                  type="button"
                  className={`target-chip${audience === a ? ' active' : ''}`}
                  onClick={() => setAudience(a)}
                >
                  {AUDIENCE_LABELS[a]}
                </button>
              ))}
            </div>
          </div>

          {audience === 'individual' ? (
            <div className="field">
              <label>E-mails (séparateur ;)</label>
              <input
                type="text"
                value={targetPhone}
                onChange={(e) => setTargetPhone(e.target.value)}
                placeholder="membre@theloop.gn; prime@theloop.gn"
                autoComplete="off"
              />
              <p className="meta">
                Un ou plusieurs e-mails de comptes actifs (pays admin). Les numéros restent acceptés en secours.
              </p>
            </div>
          ) : null}

          {audience === 'birthday' ? (
            <p className="meta">
              Comptes dont l&apos;anniversaire est ce mois-ci (date de naissance renseignée).
            </p>
          ) : null}

          {audience === 'favorites' ? (
            <>
              <div className="field">
                <label>Catégories événements</label>
                {renderCategoryChips(eventCats, favoriteEventCategories, setFavoriteEventCategories)}
              </div>
              <div className="field">
                <label>Catégories spots</label>
                {renderCategoryChips(spotCats, favoriteSpotCategories, setFavoriteSpotCategories)}
              </div>
              <div className="field">
                <label>Catégories outils</label>
                {renderCategoryChips(toolCats, favoriteToolCategories, setFavoriteToolCategories)}
              </div>
              <p className="meta">
                Membres ayant en favori au moins un contenu d&apos;une catégorie sélectionnée.
                Admins et partenaires exclus.
              </p>
            </>
          ) : null}

          <div className="field">
            <label>Titre</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label>Message</label>
            <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>

          <div className="field">
            <label>Mode d&apos;envoi</label>
            <div className="chip-row">
              <button
                type="button"
                className={`target-chip${sendNow ? ' active' : ''}`}
                onClick={() => setSendNow(true)}
              >
                Immédiat
              </button>
              <button
                type="button"
                className={`target-chip${!sendNow ? ' active' : ''}`}
                onClick={() => setSendNow(false)}
              >
                Planifié
              </button>
            </div>
          </div>

          {!sendNow ? (
            <div className="field">
              <label>Date &amp; heure d&apos;envoi</label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          ) : null}

          <button type="button" className="btn" disabled={busy} onClick={() => void handleSend()}>
            {busy
              ? 'Enregistrement…'
              : editingId
                ? sendNow
                  ? 'Enregistrer et envoyer'
                  : 'Enregistrer la planification'
                : sendNow
                  ? 'Envoyer maintenant'
                  : 'Planifier'}
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
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const fav = favoriteSummary(r);
                const badgeClass =
                  r.status === 'sent'
                    ? 'ok'
                    : r.status === 'failed' || r.status === 'cancelled'
                      ? 'err'
                      : 'warn';
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.title}</strong>
                      <div className="meta">{r.message.slice(0, 100)}</div>
                      {fav ? <div className="meta">Favoris : {fav}</div> : null}
                    </td>
                    <td className="meta">{audienceLabel(r.audience)}</td>
                    <td>
                      <span className={`badge ${badgeClass}`}>{campaignStatusLabel(r.status)}</span>
                      <div className="meta">{r.recipientCount} dest.</div>
                    </td>
                    <td className="meta">
                      Créée {formatWhen(r.createdAt)}
                      {r.scheduledAt ? <div>Planif. {formatWhen(r.scheduledAt)}</div> : null}
                      {r.sentAt ? <div>Envoyée {formatWhen(r.sentAt)}</div> : null}
                    </td>
                    <td>
                      {isPushCampaignEditable(r.status) || isPushCampaignDeletable(r.status) ? (
                        <div className="edit-actions" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                          {isPushCampaignEditable(r.status) ? (
                            <>
                              <button
                                type="button"
                                className="btn ghost small"
                                onClick={() => startEdit(r)}
                              >
                                Modifier
                              </button>
                              <button
                                type="button"
                                className="btn ghost small danger"
                                onClick={() => void handleCancel(r.id)}
                              >
                                Annuler
                              </button>
                            </>
                          ) : null}
                          {isPushCampaignDeletable(r.status) ? (
                            <button
                              type="button"
                              className="btn ghost small danger"
                              onClick={() => void handleDelete(r.id)}
                            >
                              Supprimer
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
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
