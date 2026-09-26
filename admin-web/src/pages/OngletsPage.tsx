import { useCallback, useEffect, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import {
  loadAppSections,
  saveAppSections,
  type AppSectionsConfig,
} from '../lib/accueil';

export function OngletsPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const [sections, setSections] = useState<AppSectionsConfig | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setSections(await loadAppSections(countryCode));
  }, [countryCode]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!sections) return <p className="muted">Chargement…</p>;

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Navigation app</p>
          <h2>Onglets</h2>
          <p className="meta">Visibilité Agenda / Spots / Outils et espace pro — {countryLabel}.</p>
        </div>
      </header>
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="split-pane form-list-stack">
        <div className="card">
          <h3>Onglets membres</h3>
          {(
            [
              ['agenda', 'Agenda'],
              ['spots', 'Spots'],
              ['outils', 'Outils'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="check-inline" style={{ display: 'flex', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={sections[key].tabVisible}
                onChange={(e) =>
                  setSections({
                    ...sections,
                    [key]: { ...sections[key], tabVisible: e.target.checked },
                  })
                }
              />
              Afficher {label}
            </label>
          ))}
        </div>

        <div className="card">
          <h3>Espace partenaire</h3>
          <label className="check-inline" style={{ display: 'flex', marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={sections.partnerPro.spaceVisible}
              onChange={(e) =>
                setSections({
                  ...sections,
                  partnerPro: { ...sections.partnerPro, spaceVisible: e.target.checked },
                })
              }
            />
            Espace Pro visible
          </label>
          {(
            [
              ['content', 'Mon contenu'],
              ['benefits', 'Privilèges'],
              ['featured', 'À la une'],
              ['rewards', 'Récompenses'],
              ['stats', 'Performances'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="check-inline" style={{ display: 'flex', marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={sections.partnerPro[key]}
                onChange={(e) =>
                  setSections({
                    ...sections,
                    partnerPro: { ...sections.partnerPro, [key]: e.target.checked },
                  })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn"
        style={{ width: 'auto', marginTop: 8 }}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void saveAppSections(countryCode, sections).then((r) => {
            setBusy(false);
            setMsg(r.ok ? 'Onglets enregistrés.' : r.error ?? 'Erreur');
          });
        }}
      >
        Enregistrer
      </button>
    </section>
  );
}
