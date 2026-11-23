import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/session';
import { LanguagePicker } from '../components/LanguagePicker';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../lib/theme';

export function Me() {
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();

  return (
    <>
      <header className="topbar">
        <h1 className="title" style={{ padding: '4px 4px 0' }}>
          {t('me.title')}
        </h1>
      </header>
      <div className="page">
        <div className="panel">
          <p>
            <b style={{ fontSize: 18 }}>{user?.username}</b>
          </p>
          <p className="muted">{t('me.plato', { name: user?.platoUsername ?? '' })}</p>
          {user?.role === 'PLATFORM_OWNER' && (
            <span className="tag tag-live">{t('role.ownerTag')}</span>
          )}
          {user?.role === 'GROUP_CREATOR' && (
            <span className="tag tag-live">{t('role.creatorTag')}</span>
          )}
        </div>
        {user?.role === 'PLATFORM_OWNER' && (
          <>
            <Link className="btn btn-accent" to="/super-admins">
              {t('me.inviteSuperAdmin')}
            </Link>
            <Link className="btn" to="/retours">
              {t('me.feedbackInbox')}
            </Link>
          </>
        )}
        <Link className="btn" to="/securite">
          {t('me.security')}
          {user?.mfaEnabled ? '' : t('me.securityMfa')}
        </Link>
        <Link className="btn" to="/avis">
          {t('me.giveFeedback')}
        </Link>
        <LanguagePicker />
        <div className="field">
          <span className="section-title" style={{ fontSize: 20 }}>
            {t('me.theme')}
          </span>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={theme === 'dark'}
              onClick={() => theme !== 'dark' && toggleTheme()}
            >
              {t('me.themeDark')}
            </button>
            <button
              type="button"
              aria-pressed={theme === 'light'}
              onClick={() => theme !== 'light' && toggleTheme()}
            >
              {t('me.themeLight')}
            </button>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => void logout().then(() => navigate('/connexion', { replace: true }))}
        >
          {t('common.logout')}
        </button>
        <p className="notice-standalone">{t('common.disclaimer')}</p>
      </div>
    </>
  );
}
