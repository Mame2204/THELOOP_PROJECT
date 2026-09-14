import { Link } from 'react-router-dom';
import { useAdminCountry } from '../context/AdminCountryContext';

export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { countryLabel } = useAdminCountry();

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Module</p>
          <h2>{title}</h2>
          <p className="meta">{description}</p>
        </div>
        <span className="badge warn">Pays : {countryLabel}</span>
      </header>
      <div className="card">
        <h3>Bientôt disponible sur le web</h3>
        <p className="meta">
          Ce module existe déjà dans l’admin mobile. Il sera porté ici dans les prochaines
          étapes (Users / PASS / Demandes / Contenu en priorité).
        </p>
        <p className="meta" style={{ marginTop: 12 }}>
          En attendant :{' '}
          <Link to="/users">Utilisateurs</Link> · <Link to="/payments">Paiements</Link> ·{' '}
          <Link to="/pass">PASS</Link>
        </p>
      </div>
    </section>
  );
}
