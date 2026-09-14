import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface HoursSettings {
  defaultOpenTime: string;
  defaultCloseTime: string;
  defaultSunOpenTime: string;
  defaultSunCloseTime: string;
  presets: Array<{ id: string; label: string }>;
}

const DEFAULTS: HoursSettings = {
  defaultOpenTime: '12:00',
  defaultCloseTime: '23:00',
  defaultSunOpenTime: '12:00',
  defaultSunCloseTime: '20:00',
  presets: [
    { id: 'tue_sun', label: 'Mar–Dim' },
    { id: 'sat_only', label: 'Samedi seul' },
    { id: 'tue_sat_sun_split', label: 'Mar–Sam + Dim' },
  ],
};

const SETTINGS_KEY = 'opening_hours_config';

export function OpeningHoursPage() {
  const [settings, setSettings] = useState<HoursSettings>(DEFAULTS);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();
    if (data?.value && typeof data.value === 'object') {
      const v = data.value as Partial<HoursSettings>;
      setSettings({
        defaultOpenTime: v.defaultOpenTime ?? DEFAULTS.defaultOpenTime,
        defaultCloseTime: v.defaultCloseTime ?? DEFAULTS.defaultCloseTime,
        defaultSunOpenTime: v.defaultSunOpenTime ?? DEFAULTS.defaultSunOpenTime,
        defaultSunCloseTime: v.defaultSunCloseTime ?? DEFAULTS.defaultSunCloseTime,
        presets: Array.isArray(v.presets) && v.presets.length ? v.presets : DEFAULTS.presets,
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setBusy(true);
    const { data } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();
    const prev =
      data?.value && typeof data.value === 'object' ? (data.value as Record<string, unknown>) : {};
    const { error } = await supabase.from('app_settings').upsert({
      key: SETTINGS_KEY,
      value: { ...prev, ...settings, updatedAt: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    setMsg(error ? error.message : 'Horaires enregistrés.');
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Horaires spots</h2>
          <p className="meta">Heures par défaut et raccourcis pour les fiches spots.</p>
        </div>
      </header>
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="card" style={{ maxWidth: 520 }}>
        <div className="field">
          <label>Ouverture (défaut)</label>
          <input
            type="time"
            value={settings.defaultOpenTime}
            onChange={(e) => setSettings((s) => ({ ...s, defaultOpenTime: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Fermeture (défaut)</label>
          <input
            type="time"
            value={settings.defaultCloseTime}
            onChange={(e) => setSettings((s) => ({ ...s, defaultCloseTime: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Ouverture dimanche</label>
          <input
            type="time"
            value={settings.defaultSunOpenTime}
            onChange={(e) => setSettings((s) => ({ ...s, defaultSunOpenTime: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Fermeture dimanche</label>
          <input
            type="time"
            value={settings.defaultSunCloseTime}
            onChange={(e) => setSettings((s) => ({ ...s, defaultSunCloseTime: e.target.value }))}
          />
        </div>
        <h3>Raccourcis</h3>
        <ul className="meta" style={{ lineHeight: 1.7 }}>
          {settings.presets.map((p) => (
            <li key={p.id}>
              <strong>{p.label}</strong> <span className="meta">({p.id})</span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn" disabled={busy} onClick={() => void save()}>
          Enregistrer
        </button>
      </div>
    </section>
  );
}
