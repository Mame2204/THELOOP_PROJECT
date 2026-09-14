import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { LoopLogo } from '../components/LoopLogo';
import { useAuth } from '../context/AuthContext';
import { getApiUrl } from '../lib/api';

export function LoginPage() {
  const { loading, profile, authError, login, clearError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (!loading && profile) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    await login(email, password);
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={(e) => void handleSubmit(e)}>
        <div className="login-brand">
          <LoopLogo variant="dark" size={40} />
          <div>
            <p className="brand-kicker">THE LOOP</p>
            <strong style={{ fontSize: 14 }}>Control Tower</strong>
          </div>
        </div>
        <h1>Administration</h1>
        <p className="meta">Console web — API : {getApiUrl() || 'non configurée'}</p>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            autoComplete="username"
          />
        </div>
        <div className="field">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        <button className="btn" type="submit" disabled={loading}>
          Connexion
        </button>
        {authError ? <p className="error">{authError}</p> : null}
      </form>
    </div>
  );
}
