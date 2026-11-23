import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/session';
import { ErrorNote } from '../components/ErrorNote';

/**
 * Page du lien d'invitation (`/invitation/<jeton>`). Sans compte : on en crée un. Connecté : on
 * utilise l'invitation avec le compte actuel (rejoindre un autre groupe, ou devenir super admin).
 * Le lien ne dit pas à l'avance ce qu'il donne : le serveur ne révèle rien sur un jeton.
 */
export function AcceptInvitation() {
  const { token = '' } = useParams();
  const { user, accept, refresh } = useAuth();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [platoUsername, setPlatoUsername] = useState('');
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      void navigate('/', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Invitation impossible.'));
    } finally {
      setBusy(false);
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(() =>
      accept({ token, username: username.trim(), password, platoUsername: platoUsername.trim() }),
    );
  };

  const join = () =>
    run(async () => {
      await api('POST', '/invitations/join', { token });
      await client.invalidateQueries({ queryKey: ['groups'] });
      await refresh();
    });

  const fieldError = error instanceof ApiError ? error.fields : {};

  if (user === undefined) {
    return (
      <p className="page muted" role="status">
        Chargement…
      </p>
    );
  }

  return (
    <main className="login">
      <div className="logo">i-am-in</div>
      {user ? (
        <section className="panel">
          <h1 className="section-title">Invitation</h1>
          <p>
            Tu es connecté en tant que <b>{user.username}</b>. Utiliser cette invitation avec ce
            compte ?
          </p>
          <ErrorNote error={error} />
          <button
            className="key key-wide"
            type="button"
            disabled={busy}
            onClick={() => void join()}
          >
            Utiliser l’invitation
          </button>
          <Link className="btn" to="/">
            Retour
          </Link>
        </section>
      ) : (
        <form className="panel" onSubmit={submit}>
          <h1 className="section-title">Créer ton compte</h1>
          <p className="hint">
            Tu as reçu une invitation. Choisis un identifiant et un mot de passe (12 caractères au
            moins).
          </p>
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
            {fieldError.username && <p className="error">{fieldError.username}</p>}
          </div>
          <div className="field">
            <label htmlFor="plato">Pseudo Plato</label>
            <input
              id="plato"
              className="input"
              value={platoUsername}
              onChange={(e) => setPlatoUsername(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            <p className="hint">Il sert à vérifier ton identité si tu perds ton mot de passe.</p>
            {fieldError.platoUsername && <p className="error">{fieldError.platoUsername}</p>}
          </div>
          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={12}
              required
            />
            {fieldError.password && <p className="error">{fieldError.password}</p>}
          </div>
          <ErrorNote error={Object.keys(fieldError).length === 0 ? error : null} />
          <button className="key key-wide" type="submit" disabled={busy}>
            Créer mon compte
          </button>
          <p className="hint">
            Tu as déjà un compte ? <Link to="/connexion">Connecte-toi</Link>, puis rouvre ce lien.
          </p>
        </form>
      )}
      <p className="notice-standalone">i-am-in est un outil indépendant, non affilié à Plato.</p>
    </main>
  );
}
