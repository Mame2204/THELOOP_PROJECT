import { useCallback, useEffect, useState } from 'react';
import {
  createBenefitType,
  deleteBenefitType,
  listBenefitTypes,
  updateBenefitType,
  type BenefitTypeDefinition,
} from '../lib/benefit-types';

export function BenefitTypesPage() {
  const [items, setItems] = useState<BenefitTypeDefinition[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setItems(await listBenefitTypes(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Types de privilège</h2>
          <p className="meta">Modèles nommés pour le catalogue (sync `app_settings.benefit_types`).</p>
        </div>
      </header>
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="card" style={{ maxWidth: 560, marginBottom: 16 }}>
        <h3>Nouveau type</h3>
        <div className="field">
          <label>Libellé</label>
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="Ex. Cocktail offert" />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea rows={2} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
        </div>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void createBenefitType({ label: newLabel, description: newDesc })
              .then(() => {
                setNewLabel('');
                setNewDesc('');
                setMsg('Type créé.');
                return load();
              })
              .catch((e) => setMsg(e instanceof Error ? e.message : 'Erreur'))
              .finally(() => setBusy(false));
          }}
        >
          Ajouter
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Actif</th>
              <th>Type</th>
              <th>Mécanique</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={t.isActive}
                    disabled={busy}
                    onChange={(e) => {
                      setBusy(true);
                      void updateBenefitType(t.id, { isActive: e.target.checked })
                        .then(() => load())
                        .finally(() => setBusy(false));
                    }}
                  />
                </td>
                <td>
                  <strong>{t.label}</strong>
                  <div className="meta">{t.description || '—'}</div>
                </td>
                <td className="meta">{t.mechanic}{t.isBuiltIn ? ' · intégré' : ''}</td>
                <td>
                  {!t.isBuiltIn ? (
                    <button
                      type="button"
                      className="btn small ghost"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`Supprimer « ${t.label} » ?`)) return;
                        setBusy(true);
                        void deleteBenefitType(t.id).then(() => load()).finally(() => setBusy(false));
                      }}
                    >
                      Supprimer
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
