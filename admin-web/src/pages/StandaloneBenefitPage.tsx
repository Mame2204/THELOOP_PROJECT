import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminCountry } from '../context/AdminCountryContext';
import {
  createBenefitCatalogItem,
  deleteBenefitCatalogItem,
  isStandaloneTheLoopBenefit,
  listBenefitCatalog,
  updateBenefitCatalogItem,
  type BenefitCatalogRow,
} from '../lib/privileges';

function standaloneItems(items: BenefitCatalogRow[], showArchived: boolean): BenefitCatalogRow[] {
  return items.filter((i) => isStandaloneTheLoopBenefit(i) && (showArchived || i.isActive));
}

export function StandaloneBenefitPage() {
  const { countryCode, countryLabel } = useAdminCountry();
  const [catalog, setCatalog] = useState<BenefitCatalogRow[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPromoCode, setIsPromoCode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => standaloneItems(catalog, showArchived), [catalog, showArchived]);

  const load = useCallback(async () => {
    const res = await listBenefitCatalog(countryCode);
    setCatalog(res.items);
  }, [countryCode]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setDescription('');
    setIsPromoCode(false);
  }

  function fillEdit(row: BenefitCatalogRow) {
    setEditingId(row.localId);
    setTitle(row.title);
    setDescription(row.description);
    setIsPromoCode(row.benefitPurpose === 'promo_code');
    setMsg(null);
  }

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Paramètres</p>
          <h2>Privilèges standalone</h2>
          <p className="meta">
            Modèles THE LOOP sans lieu partenaire — utilisables pour octroi, tirage ou association depuis{' '}
            <strong>Privilèges</strong>. Pays : {countryLabel}.
          </p>
        </div>
      </header>
      {msg ? <p className="muted">{msg}</p> : null}

      <div className="card" style={{ maxWidth: 560, marginBottom: 16 }}>
        <h3>{editingId ? 'Modifier le privilège' : 'Nouveau privilège'}</h3>
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
            Un code promo reste tirable même s’il a déjà été octroyé à tout un rôle. Le code se saisit au moment du
            tirage.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              const trimmedTitle = title.trim();
              if (!trimmedTitle) {
                setMsg('Titre requis.');
                return;
              }
              setBusy(true);
              if (editingId) {
                const current = catalog.find((c) => c.localId === editingId);
                if (!current) {
                  setBusy(false);
                  setMsg('Privilège introuvable.');
                  return;
                }
                void updateBenefitCatalogItem(
                  editingId,
                  {
                    title: trimmedTitle,
                    description: description.trim(),
                    benefitPurpose: isPromoCode ? 'promo_code' : 'standard',
                  },
                  current,
                ).then((r) => {
                  setBusy(false);
                  if (!r.ok) {
                    setMsg(r.error ?? 'Mise à jour impossible');
                    return;
                  }
                  setMsg('Privilège mis à jour.');
                  resetForm();
                  void load();
                });
                return;
              }
              void createBenefitCatalogItem({
                title: trimmedTitle,
                description: description.trim(),
                countryCode,
                partnerName: 'THE LOOP',
                benefitPurpose: isPromoCode ? 'promo_code' : 'standard',
              }).then((r) => {
                setBusy(false);
                if (!r.ok) {
                  setMsg(r.error ?? 'Erreur');
                  return;
                }
                resetForm();
                setMsg('Privilège créé.');
                void load();
              });
            }}
          >
            {editingId ? 'Enregistrer' : 'Créer'}
          </button>
          {editingId ? (
            <button type="button" className="btn ghost" disabled={busy} onClick={() => resetForm()}>
              Annuler
            </button>
          ) : null}
        </div>
      </div>

      <label className="check-inline" style={{ display: 'flex', marginBottom: 12 }}>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Afficher les privilèges archivés
      </label>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Statut</th>
              <th>Privilège</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.localId}>
                <td>{i.isActive ? 'Actif' : 'Archivé'}</td>
                <td>
                  <strong>{i.title}</strong>
                  <div className="meta">{i.description || '—'}</div>
                </td>
                <td className="meta">{i.benefitPurpose === 'promo_code' ? 'Code promo' : 'Standard'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button type="button" className="btn small ghost" disabled={busy} onClick={() => fillEdit(i)}>
                    Modifier
                  </button>{' '}
                  {i.isActive ? (
                    <button
                      type="button"
                      className="btn small ghost"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`Archiver « ${i.title} » ? Il ne sera plus proposé à l’octroi.`)) return;
                        setBusy(true);
                        void updateBenefitCatalogItem(i.localId, { isActive: false }, i).then((r) => {
                          setBusy(false);
                          if (!r.ok) setMsg(r.error ?? 'Archivage impossible');
                          else {
                            setMsg('Privilège archivé.');
                            if (editingId === i.localId) resetForm();
                            void load();
                          }
                        });
                      }}
                    >
                      Archiver
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn small ghost"
                      disabled={busy}
                      onClick={() => {
                        setBusy(true);
                        void updateBenefitCatalogItem(i.localId, { isActive: true }, i).then((r) => {
                          setBusy(false);
                          if (!r.ok) setMsg(r.error ?? 'Réactivation impossible');
                          else {
                            setMsg('Privilège réactivé.');
                            void load();
                          }
                        });
                      }}
                    >
                      Réactiver
                    </button>
                  )}{' '}
                  <button
                    type="button"
                    className="btn small ghost"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `Supprimer définitivement « ${i.title} » ? Irréversible si aucun octroi en cours.`,
                        )
                      ) {
                        return;
                      }
                      setBusy(true);
                      void deleteBenefitCatalogItem(i.localId).then((r) => {
                        setBusy(false);
                        if (!r.ok) setMsg(r.error ?? 'Suppression impossible');
                        else {
                          setMsg('Privilège supprimé.');
                          if (editingId === i.localId) resetForm();
                          void load();
                        }
                      });
                    }}
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 ? (
          <p className="muted" style={{ padding: 16 }}>
            Aucun privilège standalone{showArchived ? '' : ' actif'}.
          </p>
        ) : null}
      </div>
    </section>
  );
}
