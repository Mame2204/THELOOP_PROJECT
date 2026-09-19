import { useCallback, useEffect, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import {
  createBenefitCatalogItem,
  listBenefitCatalog,
  type BenefitCatalogRow,
} from '../lib/privileges';

export function StandaloneBenefitPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const [items, setItems] = useState<BenefitCatalogRow[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isPromoCode, setIsPromoCode] = useState(false);

  const load = useCallback(async () => {
    const res = await listBenefitCatalog(countryCode);
    setItems(
      res.items.filter(
        (i) => i.isActive && (i.partnerNames.length === 0 || i.partnerNames.some((n) => n.toUpperCase().includes('THE LOOP'))),
      ),
    );
  }, [countryCode]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Privilèges standalone</h2>
          <p className="meta">Privilèges THE LOOP sans partenaire — {countryLabel}.</p>
        </div>
      </header>
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="card" style={{ maxWidth: 560, marginBottom: 16 }}>
        <h3>Nouveau privilège</h3>
        <div className="field">
          <label>Titre</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field">
          <label className="check-inline">
            <input
              type="checkbox"
              checked={isPromoCode}
              onChange={(e) => setIsPromoCode(e.target.checked)}
            />
            Code promo
          </label>
          <p className="meta">
            Un code promo reste tirable même s’il a déjà été octroyé à tout un rôle. Le code lui-même se saisit au
            moment du tirage.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void createBenefitCatalogItem({
              title,
              description,
              countryCode,
              partnerName: 'THE LOOP',
              benefitPurpose: isPromoCode ? 'promo_code' : 'standard',
            }).then((r) => {
              setBusy(false);
              if (!r.ok) {
                setMsg(r.error ?? 'Erreur');
                return;
              }
              setTitle('');
              setDescription('');
              setIsPromoCode(false);
              setMsg('Privilège créé.');
              void load();
            });
          }}
        >
          Créer
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Privilège</th>
              <th>Partenaires</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.localId}>
                <td>
                  <strong>{i.title}</strong>
                  <div className="meta">{i.description || '—'}</div>
                </td>
                <td className="meta">{i.partnerNames.join(', ') || 'THE LOOP'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? <p className="muted" style={{ padding: 16 }}>Aucun privilège standalone.</p> : null}
      </div>
    </section>
  );
}
