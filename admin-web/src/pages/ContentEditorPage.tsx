import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAdminCountry } from '../context/AdminCountryContext';
import { usePermissions } from '../context/PermissionsContext';
import {
  CONTENT_STATUS_LABELS,
  CONTENT_STATUSES,
  KIND_LABELS,
  type CatalogKind,
} from '../lib/content';
import {
  createEvent,
  createSpot,
  createTool,
  emptyEventForm,
  emptySpotForm,
  emptyToolForm,
  kindSubPermission,
  loadEventForEdit,
  loadSpotForEdit,
  loadToolForEdit,
  toLocalDatetime,
  updateEvent,
  updateSpot,
  updateTool,
  type EventEditorForm,
  type SpotEditorForm,
  type ToolEditorForm,
} from '../lib/content-editor';

function parseKind(raw: string | undefined): CatalogKind | null {
  if (raw === 'event' || raw === 'spot' || raw === 'tool') return raw;
  return null;
}

function tabForKind(kind: CatalogKind): string {
  if (kind === 'event') return 'events';
  if (kind === 'spot') return 'spots';
  return 'tools';
}

export function ContentEditorPage() {
  const { kind: kindParam, id } = useParams<{ kind: string; id?: string }>();
  const kind = parseKind(kindParam);
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { countryCode, countryLabel } = useAdminCountry();
  const { canSub } = usePermissions();

  const canKind = kind ? canSub('content', kindSubPermission(kind)) : false;

  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [eventForm, setEventForm] = useState<EventEditorForm>(() => emptyEventForm(countryCode));
  const [spotForm, setSpotForm] = useState<SpotEditorForm>(() => emptySpotForm(countryCode));
  const [toolForm, setToolForm] = useState<ToolEditorForm>(() => emptyToolForm(countryCode));

  const load = useCallback(async () => {
    if (!kind || !id) return;
    setLoading(true);
    setError(null);
    let loaded = false;
    if (kind === 'event') {
      const data = await loadEventForEdit(id);
      if (data) {
        setEventForm(data);
        loaded = true;
      }
    } else if (kind === 'spot') {
      const data = await loadSpotForEdit(id);
      if (data) {
        setSpotForm(data);
        loaded = true;
      }
    } else {
      const data = await loadToolForEdit(id);
      if (data) {
        setToolForm(data);
        loaded = true;
      }
    }
    if (!loaded) setError('Contenu introuvable.');
    setLoading(false);
  }, [kind, id]);

  useEffect(() => {
    if (isEdit) void load();
  }, [isEdit, load]);

  useEffect(() => {
    if (!isEdit && kind) {
      setEventForm(emptyEventForm(countryCode));
      setSpotForm(emptySpotForm(countryCode));
      setToolForm(emptyToolForm(countryCode));
    }
  }, [countryCode, isEdit, kind]);

  if (!kind) return <Navigate to="/contenu" replace />;
  if (!canKind) return <Navigate to="/contenu" replace />;

  async function handleSave() {
    setBusy(true);
    setMsg(null);
    setError(null);

    let res;
    if (kind === 'event') {
      if (!eventForm.title.trim()) {
        setError('Titre requis.');
        setBusy(false);
        return;
      }
      res = isEdit && id ? await updateEvent(id, eventForm) : await createEvent(eventForm);
    } else if (kind === 'spot') {
      if (!spotForm.name.trim()) {
        setError('Nom requis.');
        setBusy(false);
        return;
      }
      res = isEdit && id ? await updateSpot(id, spotForm) : await createSpot(spotForm);
    } else {
      if (!toolForm.name.trim()) {
        setError('Nom requis.');
        setBusy(false);
        return;
      }
      res = isEdit && id ? await updateTool(id, toolForm) : await createTool(toolForm);
    }

    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Enregistrement impossible.');
      return;
    }

    setMsg(isEdit ? 'Modifications enregistrées.' : 'Contenu créé.');
    if (!isEdit && res.id) {
      navigate(`/contenu/editer/${kind}/${res.id}`, { replace: true });
      return;
    }
    void load();
  }

  const statusSelect = (
    value: EventEditorForm['contentStatus'],
    onChange: (v: EventEditorForm['contentStatus']) => void,
  ) => (
    <div className="field">
      <label>Statut</label>
      <select value={value} onChange={(e) => onChange(e.target.value as EventEditorForm['contentStatus'])}>
        {CONTENT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {CONTENT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Catalogue</p>
          <h2>
            {isEdit ? 'Modifier' : 'Créer'} — {KIND_LABELS[kind]}
          </h2>
          <p className="meta">
            Pays : {countryLabel}.{' '}
            <Link to={`/contenu?tab=${tabForKind(kind)}`}>Retour au catalogue</Link>
          </p>
        </div>
        <div className="edit-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void handleSave()}>
            {busy ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </header>

      {loading ? <p className="muted">Chargement…</p> : null}
      {msg ? <p className="muted">{msg}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      {!loading ? (
        <div className="card" style={{ maxWidth: 640 }}>
          {kind === 'event' ? (
            <>
              <div className="field">
                <label>Titre</label>
                <input
                  value={eventForm.title}
                  onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Description</label>
                <textarea
                  rows={4}
                  value={eventForm.description}
                  onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Catégorie (slug)</label>
                <input
                  value={eventForm.category}
                  onChange={(e) => setEventForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Début</label>
                <input
                  type="datetime-local"
                  value={toLocalDatetime(eventForm.startsAt)}
                  onChange={(e) =>
                    setEventForm((f) => ({
                      ...f,
                      startsAt: e.target.value ? new Date(e.target.value).toISOString() : f.startsAt,
                    }))
                  }
                />
              </div>
              <div className="field">
                <label>Fin (optionnel)</label>
                <input
                  type="datetime-local"
                  value={toLocalDatetime(eventForm.endsAt)}
                  onChange={(e) =>
                    setEventForm((f) => ({
                      ...f,
                      endsAt: e.target.value ? new Date(e.target.value).toISOString() : '',
                    }))
                  }
                />
              </div>
              <div className="field">
                <label>Lieu</label>
                <input
                  value={eventForm.venueName}
                  onChange={(e) => setEventForm((f) => ({ ...f, venueName: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Image de couverture (URL)</label>
                <input
                  value={eventForm.coverImageUrl}
                  onChange={(e) => setEventForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Site web</label>
                <input
                  value={eventForm.websiteUrl}
                  onChange={(e) => setEventForm((f) => ({ ...f, websiteUrl: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Prix entrée (GNF)</label>
                <input
                  value={eventForm.entryPrice}
                  disabled={eventForm.isInvitationOnly}
                  onChange={(e) => setEventForm((f) => ({ ...f, entryPrice: e.target.value }))}
                />
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={eventForm.isInvitationOnly}
                  onChange={(e) =>
                    setEventForm((f) => ({ ...f, isInvitationOnly: e.target.checked, entryPrice: '' }))
                  }
                />
                Sur invitation uniquement
              </label>
              {statusSelect(eventForm.contentStatus, (v) =>
                setEventForm((f) => ({ ...f, contentStatus: v })),
              )}
            </>
          ) : null}

          {kind === 'spot' ? (
            <>
              <div className="field">
                <label>Nom</label>
                <input
                  value={spotForm.name}
                  onChange={(e) => setSpotForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Description</label>
                <textarea
                  rows={4}
                  value={spotForm.description}
                  onChange={(e) => setSpotForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              {!isEdit ? (
                <div className="field">
                  <label>Adresse</label>
                  <input
                    value={spotForm.address}
                    onChange={(e) => setSpotForm((f) => ({ ...f, address: e.target.value }))}
                  />
                </div>
              ) : null}
              <div className="field">
                <label>Catégorie (slug)</label>
                <input
                  value={spotForm.subCategory}
                  onChange={(e) => setSpotForm((f) => ({ ...f, subCategory: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Téléphone</label>
                <input
                  value={spotForm.phone}
                  onChange={(e) => setSpotForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Site web</label>
                <input
                  value={spotForm.website}
                  onChange={(e) => setSpotForm((f) => ({ ...f, website: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Image (URL)</label>
                <input
                  value={spotForm.coverImageUrl}
                  onChange={(e) => setSpotForm((f) => ({ ...f, coverImageUrl: e.target.value }))}
                />
              </div>
              {statusSelect(spotForm.contentStatus, (v) =>
                setSpotForm((f) => ({ ...f, contentStatus: v })),
              )}
            </>
          ) : null}

          {kind === 'tool' ? (
            <>
              <div className="field">
                <label>Nom</label>
                <input
                  value={toolForm.name}
                  onChange={(e) => setToolForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Description</label>
                <textarea
                  rows={4}
                  value={toolForm.description}
                  onChange={(e) => setToolForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Catégorie (slug)</label>
                <input
                  value={toolForm.toolCategory}
                  onChange={(e) => setToolForm((f) => ({ ...f, toolCategory: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Développeur</label>
                <input
                  value={toolForm.developer}
                  onChange={(e) => setToolForm((f) => ({ ...f, developer: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Téléphone</label>
                <input
                  value={toolForm.phone}
                  onChange={(e) => setToolForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Site web</label>
                <input
                  value={toolForm.website}
                  onChange={(e) => setToolForm((f) => ({ ...f, website: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Logo (URL)</label>
                <input
                  value={toolForm.logoUrl}
                  onChange={(e) => setToolForm((f) => ({ ...f, logoUrl: e.target.value }))}
                />
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={toolForm.isVerified}
                  onChange={(e) => setToolForm((f) => ({ ...f, isVerified: e.target.checked }))}
                />
                Vérifié
              </label>
              {statusSelect(toolForm.contentStatus, (v) =>
                setToolForm((f) => ({ ...f, contentStatus: v })),
              )}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
