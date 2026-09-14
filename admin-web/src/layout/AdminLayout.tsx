import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAdminCountry } from '../context/AdminCountryContext';
import { usePermissions } from '../context/PermissionsContext';
import { getCountryLabel } from '../lib/countries';
import { Sidebar } from './Sidebar';

export function AdminLayout() {
  const { loading, profile, logout } = useAuth();
  const { ready: permsReady } = usePermissions();
  const { countryCode, enabledCountries, setCountryCode, ready: countryReady } =
    useAdminCountry();

  if (loading || !permsReady || !countryReady) {
    return (
      <div className="login">
        <p className="muted">Chargement de la console…</p>
      </div>
    );
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="admin-frame">
      <Sidebar />
      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="brand-kicker">THE LOOP · Control Tower</p>
            <h1 className="admin-page-title">Administration</h1>
            <p className="muted">
              {profile.email} · {profile.role}
            </p>
          </div>
          <div className="admin-topbar-actions">
            <label className="country-select">
              <span>Pays</span>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                aria-label="Filtrer par pays"
              >
                {enabledCountries.map((code) => (
                  <option key={code} value={code}>
                    {getCountryLabel(code)}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn ghost" type="button" onClick={() => void logout()}>
              Déconnexion
            </button>
          </div>
        </header>
        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
