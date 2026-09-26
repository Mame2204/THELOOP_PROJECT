import { useCallback, useEffect, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import { DEFAULT_SPOT_STAR_TIERS, type SpotStarTier } from '../lib/spot-star-tiers';
import { supabase } from '../lib/supabase';

interface StarSettings {
  id: string | null;
  clickWeight: number;
  favoriteWeight: number;
  ratingWeight: number;
  tiers: SpotStarTier[];
}

interface StarRow {
  id: string;
  name: string;
  stars: number;
  clicks: number;
}

const DEFAULTS: StarSettings = {
  id: null,
  clickWeight: 1,
  favoriteWeight: 5,
  ratingWeight: 10,
  tiers: DEFAULT_SPOT_STAR_TIERS,
};

type Tab = 'spot' | 'tool' | 'walk';

const TAB_LABELS: Record<Tab, string> = {
  spot: 'Spots',
  tool: 'Outils',
  walk: 'Parcours',
};

async function loadTiersForSettings(settingsId: string): Promise<SpotStarTier[]> {
  const { data: tiers } = await supabase
    .from('spot_star_tiers')
    .select('min_score, max_score, star_count, sort_order')
    .eq('settings_id', settingsId)
    .order('sort_order', { ascending: true })
    .limit(15);
  if (!tiers?.length) return DEFAULT_SPOT_STAR_TIERS.map((t) => ({ ...t }));
  return tiers.map((t) => ({
    minScore: Number(t.min_score ?? 0),
    maxScore: t.max_score == null ? null : Number(t.max_score),
    starCount: Number(t.star_count ?? 1),
  }));
}

export function SpotStarsPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const [tab, setTab] = useState<Tab>('spot');
  const [settings, setSettings] = useState<StarSettings>(DEFAULTS);
  const [top, setTop] = useState<StarRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    const { data: row } = await supabase
      .from('spot_star_settings')
      .select('id, click_weight, favorite_weight, rating_weight, country_code')
      .eq('country_code', countryCode)
      .maybeSingle();
    if (row) {
      const tiers = await loadTiersForSettings(String(row.id));
      setSettings({
        id: String(row.id),
        clickWeight: Number(row.click_weight ?? 1),
        favoriteWeight: Number(row.favorite_weight ?? 5),
        ratingWeight: Number(row.rating_weight ?? 10),
        tiers,
      });
      return;
    }
    const { data: global } = await supabase
      .from('spot_star_settings')
      .select('id, click_weight, favorite_weight, rating_weight')
      .is('country_code', null)
      .maybeSingle();
    if (global) {
      const tiers = await loadTiersForSettings(String(global.id));
      setSettings({
        id: String(global.id),
        clickWeight: Number(global.click_weight ?? 1),
        favoriteWeight: Number(global.favorite_weight ?? 5),
        ratingWeight: Number(global.rating_weight ?? 10),
        tiers,
      });
    } else {
      setSettings({ ...DEFAULTS, tiers: DEFAULT_SPOT_STAR_TIERS.map((t) => ({ ...t })) });
    }
  }, [countryCode]);

  const loadTop = useCallback(async () => {
    if (tab === 'spot') {
      const { data: spots } = await supabase
        .from('establishments')
        .select('id, name, star_count, click_count, country_code')
        .eq('country_code', countryCode)
        .order('star_count', { ascending: false })
        .limit(30);
      setTop(
        (spots ?? []).map((s) => ({
          id: String(s.id),
          name: String(s.name ?? ''),
          stars: Number(s.star_count ?? 0),
          clicks: Number(s.click_count ?? 0),
        })),
      );
      return;
    }
    if (tab === 'tool') {
      const { data: tools } = await supabase
        .from('tools')
        .select('id, name, star_count, click_count, country_code')
        .eq('country_code', countryCode)
        .order('star_count', { ascending: false })
        .limit(30);
      setTop(
        (tools ?? []).map((t) => ({
          id: String(t.id),
          name: String(t.name ?? ''),
          stars: Number(t.star_count ?? 0),
          clicks: Number(t.click_count ?? 0),
        })),
      );
      return;
    }
    const { data: walks } = await supabase
      .from('loop_walks')
      .select('id, title, star_count, click_count, country_code')
      .eq('country_code', countryCode)
      .order('star_count', { ascending: false })
      .limit(30);
    setTop(
      (walks ?? []).map((w) => ({
        id: String(w.id),
        name: String(w.title ?? ''),
        stars: Number(w.star_count ?? 0),
        clicks: Number(w.click_count ?? 0),
      })),
    );
  }, [countryCode, tab]);

  const load = useCallback(async () => {
    await loadSettings();
    await loadTop();
  }, [loadSettings, loadTop]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateTier(index: number, field: keyof SpotStarTier, value: string) {
    setSettings((prev) => {
      const tiers = [...prev.tiers];
      const tier = { ...tiers[index] };
      if (field === 'starCount') tier.starCount = Math.min(5, Math.max(1, Number(value) || 1));
      else if (field === 'minScore') tier.minScore = Math.max(0, Number(value) || 0);
      else if (field === 'maxScore') tier.maxScore = value.trim() === '' ? null : Math.max(0, Number(value) || 0);
      tiers[index] = tier;
      return { ...prev, tiers };
    });
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const payload = {
      country_code: countryCode,
      click_weight: settings.clickWeight,
      favorite_weight: settings.favoriteWeight,
      rating_weight: settings.ratingWeight,
      updated_at: new Date().toISOString(),
    };
    let settingsId = settings.id;
    let error;
    if (settingsId) {
      ({ error } = await supabase.from('spot_star_settings').update(payload).eq('id', settingsId));
    } else {
      const { data, error: insErr } = await supabase
        .from('spot_star_settings')
        .insert(payload)
        .select('id')
        .maybeSingle();
      error = insErr;
      settingsId = data?.id ? String(data.id) : null;
    }
    if (error || !settingsId) {
      setBusy(false);
      setMsg(error?.message ?? 'Enregistrement impossible.');
      return;
    }

    const { error: delErr } = await supabase.from('spot_star_tiers').delete().eq('settings_id', settingsId);
    if (delErr) {
      setBusy(false);
      setMsg(delErr.message);
      return;
    }
    const { error: tierErr } = await supabase.from('spot_star_tiers').insert(
      settings.tiers.map((tier, index) => ({
        settings_id: settingsId,
        min_score: tier.minScore,
        max_score: tier.maxScore,
        star_count: tier.starCount,
        sort_order: index + 1,
      })),
    );
    setBusy(false);
    if (tierErr) {
      setMsg(tierErr.message);
      return;
    }
    setMsg('Réglages étoiles enregistrés (poids + paliers).');
    void load();
  }

  async function setStars(id: string, stars: number) {
    const table = tab === 'spot' ? 'establishments' : tab === 'tool' ? 'tools' : 'loop_walks';
    const { error } = await supabase
      .from(table)
      .update({
        star_count: Math.max(0, Math.min(5, stars)),
        stars_source: 'admin',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    setMsg(error ? error.message : 'Étoiles mises à jour.');
    if (!error) void loadTop();
  }

  const cw = settings.clickWeight;
  const fw = settings.favoriteWeight;
  const rw = settings.ratingWeight;

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Étoiles contenu</h2>
          <p className="meta">Spots, outils et parcours — {countryLabel}.</p>
        </div>
      </header>
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="chip-row" style={{ marginBottom: 16 }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`target-chip${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="split-pane form-list-stack">
        <div className="card">
          <div className="stars-settings-grid">
            <div>
              <h3>Formule de calcul</h3>
              <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                score = (clics × {cw}) + (favoris × {fw}) + (moyenne notes × {rw})
              </p>
              <div className="field">
                <label>Poids clics</label>
                <input
                  type="number"
                  value={settings.clickWeight}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, clickWeight: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="field">
                <label>Poids favoris</label>
                <input
                  type="number"
                  value={settings.favoriteWeight}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, favoriteWeight: Number(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="field">
                <label>Poids notes (moyenne /5)</label>
                <input
                  type="number"
                  value={settings.ratingWeight}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, ratingWeight: Number(e.target.value) || 0 }))
                  }
                />
              </div>
            </div>

            <div>
              <h3>Paliers score → étoiles</h3>
              <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                Score min → max = nombre d&apos;étoiles affichées (vide = sans limite).
              </p>
              {settings.tiers.map((tier, index) => (
                <div key={index} className="stars-tier-row">
                  <input
                    type="number"
                    aria-label="Score min"
                    value={tier.minScore}
                    onChange={(e) => updateTier(index, 'minScore', e.target.value)}
                  />
                  <span className="muted">→</span>
                  <input
                    type="number"
                    aria-label="Score max"
                    placeholder="∞"
                    value={tier.maxScore == null ? '' : tier.maxScore}
                    onChange={(e) => updateTier(index, 'maxScore', e.target.value)}
                  />
                  <span className="muted">=</span>
                  <input
                    type="number"
                    aria-label="Nombre d'étoiles"
                    min={1}
                    max={5}
                    value={tier.starCount}
                    onChange={(e) => updateTier(index, 'starCount', e.target.value)}
                  />
                  <span>★</span>
                </div>
              ))}
            </div>
          </div>

          <button type="button" className="btn" disabled={busy} onClick={() => void save()}>
            Enregistrer
          </button>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{TAB_LABELS[tab]}</th>
                <th>Étoiles</th>
                <th>Clics</th>
                <th>Forcer</th>
              </tr>
            </thead>
            <tbody>
              {top.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>{row.stars}</td>
                  <td>{row.clicks}</td>
                  <td>
                    <select
                      value={row.stars}
                      onChange={(e) => void setStars(row.id, Number(e.target.value))}
                    >
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>
                          {n}★
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {top.length === 0 ? (
            <p className="muted" style={{ padding: 16 }}>
              Aucun contenu.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
