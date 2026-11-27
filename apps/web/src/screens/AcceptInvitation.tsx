import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/session';
import { ErrorNote } from '../components/ErrorNote';
import { PrivacyLink } from '../components/PrivacyLink';
import { useI18n } from '../lib/i18n';

/**
 * Page du lien d'invitation (`/invitation/<jeton>`). Sans compte : on en crée un. Connecté : on
 * utilise l'invitation avec le compte actuel (rejoindre un autre groupe, ou devenir super admin).
 * Le lien ne dit pas à l'avance ce qu'il donne : le serveur ne révèle rien sur un jeton.
 */
export function AcceptInvitation() {
  const { token = '' } = useParams();
  const { user, accept, refresh } = useAuth();
  const { t } = useI18n();
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
      setError(e instanceof Error ? e : new Error(t('invite.failed')));
    } finally {
      setBusy(false);
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(() =>
      accept({ token, username: username.trim(), password, platoUsername: pseudo.trim() }),
    );
  };

  const join = () =>
    run(async () => {
      await api('POST', '/invitations/join', { token });
      await client.invalidateQueries({ queryKey: ['groups'] });
      await refresh();
    });

  // Le lien peut imposer un pseudo Plato : on le demande au serveur (POST, le jeton reste hors de
  // l'adresse) pour pré-remplir et verrouiller le champ. Un lien invalide est signalé tout de suite.
  const preview = useQuery({
    queryKey: ['invitation-preview', token],
    queryFn: () => api<{ platoUsername: string | null }>('POST', '/invitations/preview', { token }),
    retry: false,
    staleTime: Infinity,
  });
  const lockedPseudo = preview.data?.platoUsername ?? null;
  const pseudo = lockedPseudo ?? platoUsername;

  const fieldError = error instanceof ApiError ? error.fields : {};

  if (user === undefined) {
    return (
      <p className="page muted" role="status">
        {t('common.loading')}
      </p>
    );
  }

  return (
    <main className="login">
      <div className="logo">i-am-in</div>
      {user ? (
        <section className="panel">
          <h1 className="section-title">{t('invite.title')}</h1>
          <p>{t('invite.loggedIn', { name: user.username })}</p>
          <ErrorNote error={error} />
          <button
            className="key key-wide"
            type="button"
            disabled={busy}
            onClick={() => void join()}
          >
            {t('invite.use')}
          </button>
          <Link className="btn" to="/">
            {t('common.back')}
          </Link>
        </section>
      ) : (
        <form className="panel" onSubmit={submit}>
          <h1 className="section-title">{t('invite.createTitle')}</h1>
          <p className="hint">{t('invite.createHint')}</p>
          <div className="field">
            <label htmlFor="username">{t('login.username')}</label>
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
            <label htmlFor="plato">{t('invite.plato')}</label>
            <input
              id="plato"
              className="input"
              value={pseudo}
              onChange={(e) => setPlatoUsername(e.target.value)}
              readOnly={lockedPseudo !== null}
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            <p className="hint">
              {lockedPseudo !== null ? t('invite.platoLocked') : t('invite.platoFree')}
            </p>
            {fieldError.platoUsername && <p className="error">{fieldError.platoUsername}</p>}
          </div>
          <div className="field">
            <label htmlFor="password">{t('login.password')}</label>
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
          <ErrorNote
            error={Object.keys(fieldError).length === 0 ? (error ?? preview.error) : null}
          />
          <button className="key key-wide" type="submit" disabled={busy}>
            {t('invite.create')}
          </button>
          <p className="hint">
            {t('invite.hasAccount')}
            <Link to="/connexion">{t('invite.signInLink')}</Link>
            {t('invite.reopen')}
          </p>
        </form>
      )}
      <p className="notice-standalone">
        {t('common.disclaimer')} <PrivacyLink />
      </p>
    </main>
  );
}
