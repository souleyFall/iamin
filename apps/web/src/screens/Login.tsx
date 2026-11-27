import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/session';
import { PrivacyLink } from '../components/PrivacyLink';
import { useI18n } from '../lib/i18n';

export function Login() {
  const { user, login, loginWithCode } = useAuth();
  const { t } = useI18n();
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
        setError(e instanceof ApiError ? e.message : t('login.failed'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <div className="logo">i-am-in</div>
      <form className="panel" onSubmit={(e) => void submit(e)}>
        <h1 className="section-title">{t('login.title')}</h1>
        {challenge === null ? (
          <>
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
            </div>
            <div className="field">
              <label htmlFor="password">{t('login.password')}</label>
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
              <label htmlFor="code">{t('login.code')}</label>
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
              <p className="hint">{t('login.codeHint')}</p>
            </div>
            <button type="button" className="btn" onClick={() => restart(null)}>
              {t('login.restart')}
            </button>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="key key-wide" type="submit" disabled={busy}>
          {challenge === null ? t('login.submit') : t('login.validate')}
        </button>
      </form>
      <p className="notice-standalone">
        {t('common.disclaimer')} <Link to="/avis">{t('fb.title')}</Link> · <PrivacyLink />
      </p>
    </main>
  );
}
