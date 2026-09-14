import { Link } from 'react-router-dom';
import { useAdminCountry } from '../context/AdminCountryContext';

export function PassPage() {
  const { countryLabel } = useAdminCountry();

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="brand-kicker">Abonnements</p>
          <h2>Gestion PASS</h2>
          <p className="meta">
            Catalogue, octroi et prix — pays actif : {countryLabel}. Module complet à porter ;
            les paiements Djomy sont déjà disponibles.
          </p>
        </div>
      </header>
      <div className="card">
        <h3>Raccourcis</h3>
        <p className="meta">
          <Link to="/payments">→ Voir les paiements Djomy</Link>
        </p>
        <p className="meta" style={{ marginTop: 8 }}>
          Prochaine livraison : octroi / révocation PASS, tarifs et messages d’activation
          (parité mobile).
        </p>
      </div>
    </section>
  );
}
