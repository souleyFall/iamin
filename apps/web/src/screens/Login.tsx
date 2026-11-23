import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/session';

export function Login() {
  const { user, login, loginWithCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  /** Jeton d'étape : le mot de passe est bon, le code reste à donner. */
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const done = () => {
    const from = (location.state as { from?: string } | null)?.from;
    void navigate(from ?? '/', { replace: true });
  };

  function restart(message: string | null) {
    setChallenge(null);
    setCode('');
    setPassword('');
    setError(message);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (challenge === null) {
        const step = await login(username.trim(), password);
        if (step) setChallenge(step.challenge);
        else done();
      } else {
        await loginWithCode(challenge, code.trim());
        done();
      }
    } catch (e) {
      if (challenge !== null && e instanceof ApiError && e.status === 401) {
        // Code faux : on reste sur l'étape tant que le jeton est valable, sinon on repart de zéro.
        if (/expir/i.test(e.message)) restart(e.message);
        else {
          setCode('');
          setError(e.message);
        }
      } else {
        // L'API répond pareil pour « compte inconnu » et « mauvais mot de passe » : on ne distingue pas.
        setError(e instanceof ApiError ? e.message : 'Connexion impossible.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="logo">i-am-in</div>
      <form className="panel" onSubmit={(e) => void submit(e)}>
        <h1 className="section-title">Connexion admin</h1>
        {challenge === null ? (
          <>
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
          </>
        ) : (
          <>
            <div className="field">
              <label htmlFor="code">Code de l’application d’authentification</label>
              <input
                id="code"
                className="input tabular"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputMode="text"
                autoComplete="one-time-code"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                required
              />
              <p className="hint">
                6 chiffres, ou un code de secours (xxxxx-xxxxx) si tu n’as plus ton téléphone.
              </p>
            </div>
            <button type="button" className="btn" onClick={() => restart(null)}>
              Recommencer
            </button>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="key key-wide" type="submit" disabled={busy}>
          {challenge === null ? 'Se connecter' : 'Valider le code'}
        </button>
      </form>
      <p className="notice-standalone">
        i-am-in est un outil indépendant, non affilié à Plato.{' '}
        <Link to="/avis">Donner mon avis</Link>
      </p>
    </main>
  );
}
