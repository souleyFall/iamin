import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/session';
import { useTheme } from '../lib/theme';

export function Me() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();

  return (
    <>
      <header className="topbar">
        <h1 className="title" style={{ padding: '4px 4px 0' }}>
          Moi
        </h1>
      </header>
      <div className="page">
        <div className="panel">
          <p>
            <b style={{ fontSize: 18 }}>{user?.username}</b>
          </p>
          <p className="muted">Pseudo Plato : {user?.platoUsername}</p>
          {user?.role === 'PLATFORM_OWNER' && <span className="tag tag-live">PROPRIÉTAIRE</span>}
          {user?.role === 'GROUP_CREATOR' && <span className="tag tag-live">SUPER ADMIN</span>}
        </div>
        {user?.role === 'PLATFORM_OWNER' && (
          <Link className="btn btn-accent" to="/super-admins">
            Inviter un super admin
          </Link>
        )}
        <div className="field">
          <span className="section-title" style={{ fontSize: 20 }}>
            Thème
          </span>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={theme === 'dark'}
              onClick={() => theme !== 'dark' && toggleTheme()}
            >
              Sombre
            </button>
            <button
              type="button"
              aria-pressed={theme === 'light'}
              onClick={() => theme !== 'light' && toggleTheme()}
            >
              Clair
            </button>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => void logout().then(() => navigate('/connexion', { replace: true }))}
        >
          Se déconnecter
        </button>
        <p className="notice-standalone">i-am-in est un outil indépendant, non affilié à Plato.</p>
      </div>
    </>
  );
}
