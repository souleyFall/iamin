import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/session';
import { GroupProvider } from '../groups/current';
import { useI18n } from '../lib/i18n';
import type { MessageKey } from '../lib/i18n/messages';
import { Icon, type IconName } from './Icon';

interface Tab {
  to: string;
  label: MessageKey;
  icon: IconName;
}

/** Les trois entrées du téléphone (barre du bas) : aussi celles du haut de la barre latérale. */
const TABS: Tab[] = [
  { to: '/', label: 'nav.tournaments', icon: 'trophy' },
  { to: '/groupe', label: 'nav.group', icon: 'users' },
  { to: '/moi', label: 'nav.me', icon: 'user' },
];

/** Entrées en plus sur ordinateur seulement : la barre du bas du téléphone n'a pas la place. */
const OWNER_TABS: Tab[] = [
  { to: '/super-admins', label: 'nav.superAdmins', icon: 'userPlus' },
  { to: '/retours', label: 'nav.feedback', icon: 'inbox' },
];
const ACCOUNT_TABS: Tab[] = [{ to: '/securite', label: 'nav.security', icon: 'shield' }];

function NavItem({ tab, desktopOnly = false }: { tab: Tab; desktopOnly?: boolean }) {
  const { t } = useI18n();
  return (
    <NavLink to={tab.to} end={tab.to === '/'} className={desktopOnly ? 'nav-extra' : undefined}>
      <Icon name={tab.icon} size={24} />
      {t(tab.label)}
    </NavLink>
  );
}

/**
 * Tout l'espace admin : réservé aux comptes connectés. Téléphone : navigation en barre du bas.
 * Ordinateur (≥ 960 px) : barre latérale à gauche, contenu large à droite (voir app.css).
 */
export function Layout() {
  const { user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  if (user === undefined)
    return (
      <p className="page muted" role="status">
        {t('common.loading')}
      </p>
    );
  if (user === null)
    return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  // Le propriétaire ne peut rien faire avant d'avoir activé la double authentification (l'API le refuse aussi).
  if (user.role === 'PLATFORM_OWNER' && !user.mfaEnabled && location.pathname !== '/securite') {
    return <Navigate to="/securite" replace />;
  }
  const isOwner = user.role === 'PLATFORM_OWNER';
  return (
    <GroupProvider>
      <div className="shell shell-app">
        <main className="shell-main">
          <Outlet />
        </main>
        <nav className="nav" aria-label={t('nav.label')}>
          <div className="nav-brand logo" aria-hidden="true">
            i-am-in
          </div>
          {TABS.map((tab) => (
            <NavItem key={tab.to} tab={tab} />
          ))}
          {isOwner && (
            <>
              <p className="nav-section nav-extra">{t('nav.platform')}</p>
              {OWNER_TABS.map((tab) => (
                <NavItem key={tab.to} tab={tab} desktopOnly />
              ))}
            </>
          )}
          <p className="nav-section nav-extra">{t('nav.account')}</p>
          {ACCOUNT_TABS.map((tab) => (
            <NavItem key={tab.to} tab={tab} desktopOnly />
          ))}
          <div className="nav-user nav-extra">
            <span className="avatar" aria-hidden="true">
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="nav-user-text">
              <b>{user.username}</b>
              <span className="muted">
                {isOwner
                  ? t('role.owner')
                  : user.role === 'GROUP_CREATOR'
                    ? t('role.creator')
                    : t('role.admin')}
              </span>
            </span>
          </div>
        </nav>
      </div>
    </GroupProvider>
  );
}
