import { useCallback, useEffect, useState } from 'react';
import { OpeningHoursPresetBuilder } from '../components/OpeningHoursPresetBuilder';
import type { HoursMode } from '../lib/opening-hours';
import {
  createEmptyPreset,
  defaultOpeningHoursSettings,
  getOpeningHoursSettings,
  saveOpeningHoursSettings,
  type OpeningHoursSettings,
} from '../lib/opening-hours-settings-store';

const MODE_ORDER: HoursMode[] = ['always_open', 'by_appointment', 'weekly'];

const MODE_LABELS: Record<HoursMode, string> = {
  always_open: 'Toujours ouvert',
  by_appointment: 'Sur RDV',
  weekly: 'Plages horaires',
};

export function OpeningHoursPage() {
  const [settings, setSettings] = useState<OpeningHoursSettings>(defaultOpeningHoursSettings());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      setSettings(await getOpeningHoursSettings());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Impossible de charger les horaires.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function updateMode(mode: HoursMode, patch: Partial<OpeningHoursSettings['modes'][HoursMode]>) {
    setSettings((prev) => ({
      ...prev,
      modes: { ...prev.modes, [mode]: { ...prev.modes[mode], ...patch } },
    }));
  }

  function updatePreset(id: string, patch: Partial<OpeningHoursSettings['presets'][number]>) {
    setSettings((prev) => ({
      ...prev,
      presets: prev.presets.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  }

  function addPreset() {
    setSettings((prev) => ({
      ...prev,
      presets: [...prev.presets, createEmptyPreset(prev)],
    }));
  }

  function removePreset(id: string) {
    setSettings((prev) => ({
      ...prev,
      presets: prev.presets.filter((p) => p.id !== id),
    }));
  }

  async function handleSave() {
    setBusy(true);
    setMsg(null);
    try {
      await saveOpeningHoursSettings(settings);
      setMsg('Modes et raccourcis enregistrés — disponibles dans le formulaire spot (partenaire et admin).');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Impossible d\'enregistrer.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Horaires spots</h2>
          <p className="meta">
            Créez les modes et raccourcis affichés dans le champ Horaires du formulaire spot.
          </p>
        </div>
      </header>
      {msg ? <p className="muted">{msg}</p> : null}

      {loading ? (
        <p className="muted">Chargement…</p>
      ) : (
        <div className="card-stack" style={{ maxWidth: 720 }}>
          <div>
            <h3>Modes d&apos;ouverture</h3>
            <p className="meta">
              Ces boutons apparaissent en haut du champ Horaires (ex. Toujours ouvert, Sur RDV, Plages horaires).
            </p>
            {MODE_ORDER.map((mode) => (
              <div key={mode} className="card hours-mode-card">
                <div className="row-between">
                  <strong>{MODE_LABELS[mode]}</strong>
                  <label className="hours-toggle">
                    <input
                      type="checkbox"
                      checked={settings.modes[mode].enabled}
                      onChange={(e) => updateMode(mode, { enabled: e.target.checked })}
                    />
                    {settings.modes[mode].enabled ? 'Activé' : 'Désactivé'}
                  </label>
                </div>
                <div className="field">
                  <label>Texte enregistré / affiché</label>
                  <input
                    value={settings.modes[mode].label}
                    onChange={(e) => updateMode(mode, { label: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </div>

          <div>
            <h3>Raccourcis horaires</h3>
            <p className="meta">
              Chaque raccourci devient un bouton dans le formulaire spot. Le partenaire clique dessus pour appliquer
              jours et heures.
            </p>
            {settings.presets.map((preset) => (
              <OpeningHoursPresetBuilder
                key={preset.id}
                preset={preset}
                settings={settings}
                canDelete={settings.presets.length > 1}
                onChange={(patch) => updatePreset(preset.id, patch)}
                onDelete={() => removePreset(preset.id)}
              />
            ))}
            <button type="button" className="btn ghost hours-add-preset" onClick={addPreset}>
              + Ajouter un raccourci
            </button>
          </div>

          <div className="card">
            <h3>Heures par défaut</h3>
            <p className="meta">Utilisées pour les nouveaux raccourcis et l&apos;édition manuelle dans le formulaire.</p>
            <div className="hours-time-row">
              <div className="field">
                <label>Ouverture</label>
                <input
                  value={settings.defaultOpenTime}
                  onChange={(e) => setSettings((p) => ({ ...p, defaultOpenTime: e.target.value }))}
                  placeholder="12:00"
                />
              </div>
              <div className="field">
                <label>Fermeture</label>
                <input
                  value={settings.defaultCloseTime}
                  onChange={(e) => setSettings((p) => ({ ...p, defaultCloseTime: e.target.value }))}
                  placeholder="23:00"
                />
              </div>
            </div>
            <div className="hours-time-row">
              <div className="field">
                <label>Ouverture dimanche (legacy)</label>
                <input
                  value={settings.defaultSunOpenTime}
                  onChange={(e) => setSettings((p) => ({ ...p, defaultSunOpenTime: e.target.value }))}
                  placeholder="12:00"
                />
              </div>
              <div className="field">
                <label>Fermeture dimanche (legacy)</label>
                <input
                  value={settings.defaultSunCloseTime}
                  onChange={(e) => setSettings((p) => ({ ...p, defaultSunCloseTime: e.target.value }))}
                  placeholder="20:00"
                />
              </div>
            </div>
          </div>

          <button type="button" className="btn" disabled={busy} onClick={() => void handleSave()}>
            {busy ? 'Enregistrement…' : 'Enregistrer les paramètres'}
          </button>
        </div>
      )}
    </section>
  );
}
