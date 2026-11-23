import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/session';

export function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      const from = (location.state as { from?: string } | null)?.from;
      void navigate(from ?? '/', { replace: true });
    } catch (e) {
      // L'API répond pareil pour « compte inconnu » et « mauvais mot de passe » : on ne distingue pas.
      setError(e instanceof ApiError ? e.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="logo">i-am-in</div>
      <form className="panel" onSubmit={(e) => void submit(e)}>
        <h1 className="section-title">Connexion admin</h1>
        <div className="field">
          <label htmlFor="username">Identifiant</label>
          <input
            id="username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="key key-wide" type="submit" disabled={busy}>
          Se connecter
        </button>
      </form>
      <p className="notice-standalone">
        i-am-in est un outil indépendant, non affilié à Plato.{' '}
        <Link to="/avis">Donner mon avis</Link>
      </p>
    </main>
  );
}
