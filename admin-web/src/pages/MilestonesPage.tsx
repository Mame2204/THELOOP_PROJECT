import { useCallback, useEffect, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import { formatWhen } from '../lib/format';
import { supabase } from '../lib/supabase';

type MetricType = 'validations' | 'unique_members';
type RewardType = 'featured_week' | 'push_once';

interface RuleRow {
  id: string;
  name: string;
  description: string | null;
  metricType: MetricType;
  threshold: number;
  rewardType: RewardType;
  durationDays: number;
  validityDays: number;
  pushTitle: string | null;
  pushMessage: string | null;
  periodMonths: number;
  isActive: boolean;
  archived: boolean;
  updatedAt: string | null;
}

interface RuleDraft {
  id?: string;
  name: string;
  description: string;
  metricType: MetricType;
  threshold: number;
  rewardType: RewardType;
  durationDays: number;
  validityDays: number;
  pushTitle: string;
  pushMessage: string;
  periodMonths: number;
  isActive: boolean;
}

const PERIOD_OPTIONS = [
  { value: 1, label: '1 mois' },
  { value: 3, label: '3 mois' },
  { value: 6, label: '6 mois' },
  { value: 12, label: '12 mois' },
];

function emptyDraft(): RuleDraft {
  return {
    name: '',
    description: '',
    metricType: 'validations',
    threshold: 20,
    rewardType: 'featured_week',
    durationDays: 7,
    validityDays: 90,
    pushTitle: 'Palier atteint',
    pushMessage: 'Félicitations — récompense partenaire disponible.',
    periodMonths: 1,
    isActive: true,
  };
}

function rowToDraft(row: RuleRow): RuleDraft {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    metricType: row.metricType,
    threshold: row.threshold,
    rewardType: row.rewardType,
    durationDays: row.durationDays,
    validityDays: row.validityDays,
    pushTitle: row.pushTitle ?? 'Palier atteint',
    pushMessage: row.pushMessage ?? 'Félicitations — récompense partenaire disponible.',
    periodMonths: row.periodMonths,
    isActive: row.isActive,
  };
}

export function MilestonesPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft());
  const [editing, setEditing] = useState<RuleDraft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    let q = supabase
      .from('partner_milestone_rules')
      .select(
        'id, name, description, metric_type, threshold, reward_type, duration_days, validity_days, push_title, push_message, period_months, is_active, archived, country_code, updated_at, sort_order',
      )
      .order('sort_order', { ascending: true })
      .limit(200);
    if (countryCode) q = q.eq('country_code', countryCode);
    const { data, error: err } = await q;
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    setRows(
      (data ?? [])
        .map((r) => ({
          id: String(r.id),
          name: String(r.name ?? ''),
          description: r.description ? String(r.description) : null,
          metricType: String(r.metric_type ?? 'validations') as MetricType,
          threshold: Number(r.threshold ?? 0),
          rewardType: String(r.reward_type ?? 'featured_week') as RewardType,
          durationDays: Number(r.duration_days ?? 7),
          validityDays: Number(r.validity_days ?? 90),
          pushTitle: r.push_title ? String(r.push_title) : null,
          pushMessage: r.push_message ? String(r.push_message) : null,
          periodMonths: Number(r.period_months ?? 1),
          isActive: r.is_active !== false,
          archived: r.archived === true,
          updatedAt: r.updated_at ? String(r.updated_at) : null,
        }))
        .filter((r) => (showArchived ? true : !r.archived)),
    );
  }, [countryCode, showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(id: string, isActive: boolean) {
    const { error: err } = await supabase
      .from('partner_milestone_rules')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) {
      setMsg(err.message);
      return;
    }
    setMsg(isActive ? 'Palier activé.' : 'Palier désactivé.');
    void load();
  }

  async function archiveRule(id: string, name: string) {
    if (!window.confirm(`Archiver « ${name} » ? Aucune donnée ne sera supprimée.`)) return;
    const { error: err } = await supabase
      .from('partner_milestone_rules')
      .update({ archived: true, is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (err) {
      setMsg(err.message);
      return;
    }
    setMsg('Palier archivé.');
    if (editing?.id === id) setEditing(null);
    void load();
  }

  async function saveRule(input: RuleDraft, isEdit: boolean) {
    if (!input.name.trim() || input.threshold < 1) {
      setMsg('Nom et seuil requis.');
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    const payload = {
      name: input.name.trim(),
      description: input.description.trim() || null,
      metric_type: input.metricType,
      threshold: input.threshold,
      reward_type: input.rewardType,
      duration_days: input.durationDays,
      validity_days: input.validityDays,
      push_title: input.pushTitle.trim() || 'Palier atteint',
      push_message: input.pushMessage.trim() || 'Félicitations — récompense partenaire disponible.',
      period_months: input.periodMonths,
      is_active: input.isActive,
      updated_at: now,
    };

    if (isEdit && input.id) {
      const { error: err } = await supabase
        .from('partner_milestone_rules')
        .update(payload)
        .eq('id', input.id);
      setBusy(false);
      if (err) {
        setMsg(err.message);
        return;
      }
      setEditing(null);
      setMsg('Palier mis à jour.');
    } else {
      const { error: err } = await supabase.from('partner_milestone_rules').insert({
        id: crypto.randomUUID(),
        ...payload,
        country_code: countryCode,
        archived: false,
        sort_order: rows.length,
        created_at: now,
      });
      setBusy(false);
      if (err) {
        setMsg(err.message);
        return;
      }
      setDraft(emptyDraft());
      setMsg('Palier créé.');
    }
    void load();
  }

  function renderForm(input: RuleDraft, isEdit: boolean, onChange: (next: RuleDraft) => void, onCancel: () => void) {
    return (
      <>
        <div className="field">
          <label>Nom</label>
          <input value={input.name} onChange={(e) => onChange({ ...input, name: e.target.value })} />
        </div>
        <div className="field">
          <label>Description (partenaires)</label>
          <textarea
            rows={2}
            value={input.description}
            onChange={(e) => onChange({ ...input, description: e.target.value })}
          />
        </div>
        <div className="field">
          <label>Métrique</label>
          <select
            value={input.metricType}
            onChange={(e) => onChange({ ...input, metricType: e.target.value as MetricType })}
          >
            <option value="validations">Validations</option>
            <option value="unique_members">Membres uniques</option>
          </select>
        </div>
        <div className="field">
          <label>Seuil</label>
          <input
            type="number"
            min={1}
            value={input.threshold}
            onChange={(e) => onChange({ ...input, threshold: Number(e.target.value) || 1 })}
          />
        </div>
        <div className="field">
          <label>Période</label>
          <select
            value={input.periodMonths}
            onChange={(e) => onChange({ ...input, periodMonths: Number(e.target.value) || 1 })}
          >
            {PERIOD_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Récompense</label>
          <select
            value={input.rewardType}
            onChange={(e) => onChange({ ...input, rewardType: e.target.value as RewardType })}
          >
            <option value="featured_week">À la une (semaine)</option>
            <option value="push_once">Push unique</option>
          </select>
        </div>
        {input.rewardType === 'featured_week' ? (
          <div className="field">
            <label>Durée à la une (jours)</label>
            <input
              type="number"
              min={1}
              value={input.durationDays}
              onChange={(e) => onChange({ ...input, durationDays: Number(e.target.value) || 7 })}
            />
          </div>
        ) : (
          <>
            <div className="field">
              <label>Titre push</label>
              <input value={input.pushTitle} onChange={(e) => onChange({ ...input, pushTitle: e.target.value })} />
            </div>
            <div className="field">
              <label>Message push</label>
              <textarea
                rows={2}
                value={input.pushMessage}
                onChange={(e) => onChange({ ...input, pushMessage: e.target.value })}
              />
            </div>
          </>
        )}
        <div className="field">
          <label>Délai activation (jours)</label>
          <input
            type="number"
            min={1}
            value={input.validityDays}
            onChange={(e) => onChange({ ...input, validityDays: Number(e.target.value) || 90 })}
          />
        </div>
        <label className="check-inline">
          <input
            type="checkbox"
            checked={input.isActive}
            onChange={(e) => onChange({ ...input, isActive: e.target.checked })}
          />
          Palier actif
        </label>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void saveRule(input, isEdit)}
          >
            {isEdit ? 'Enregistrer' : 'Créer'}
          </button>
          {isEdit ? (
            <button type="button" className="btn ghost" onClick={onCancel}>
              Annuler
            </button>
          ) : null}
        </div>
      </>
    );
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Paliers partenaires</h2>
          <p className="meta">Récompenses milestones — {countryLabel}.</p>
        </div>
        <div className="toolbar" style={{ margin: 0 }}>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Archives
          </label>
          <button type="button" className="btn ghost small" onClick={() => void load()}>
            Actualiser
          </button>
        </div>
      </header>
      {error ? <p className="error-text">{error}</p> : null}
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <p className="meta" style={{ margin: 0 }}>
          <strong>Éditer</strong> : modifier seuil, période ou récompense d’un palier existant (bouton dans le
          tableau). <strong>Archiver</strong> : désactive le palier et le retire de la liste partenaires — l’historique
          des octrois est conservé (cochez « Archives » pour les revoir).
        </p>
      </div>

      <div className="split-pane">
        <div className="card">
          <h3>{editing ? 'Modifier le palier' : 'Nouveau palier'}</h3>
          {editing
            ? renderForm(editing, true, setEditing, () => setEditing(null))
            : renderForm(draft, false, setDraft, () => undefined)}
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Palier</th>
                <th>Seuil</th>
                <th>Récompense</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    <div className="meta">{r.metricType}</div>
                  </td>
                  <td>
                    <strong>{r.threshold}</strong>
                    <div className="meta">{r.periodMonths} mois</div>
                  </td>
                  <td className="meta">{r.rewardType}</td>
                  <td>
                    <span className={`badge ${r.isActive && !r.archived ? 'ok' : 'warn'}`}>
                      {r.archived ? 'archivé' : r.isActive ? 'actif' : 'off'}
                    </span>
                    <div className="meta">{formatWhen(r.updatedAt)}</div>
                  </td>
                  <td>
                    <div className="toolbar" style={{ margin: 0, justifyContent: 'flex-end' }}>
                      {!r.archived ? (
                        <>
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => setEditing(rowToDraft(r))}
                          >
                            Éditer
                          </button>
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => void toggleActive(r.id, !r.isActive)}
                          >
                            {r.isActive ? 'Désactiver' : 'Activer'}
                          </button>
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => void archiveRule(r.id, r.name)}
                          >
                            Archiver
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && !error ? (
            <p className="muted" style={{ padding: 16 }}>
              Aucun palier.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
