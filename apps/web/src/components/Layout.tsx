import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/session';
import { GroupProvider } from '../groups/current';
import { Icon, type IconName } from './Icon';

interface Tab {
  to: string;
  label: string;
  icon: IconName;
}

/** Les trois entrées du téléphone (barre du bas) : aussi celles du haut de la barre latérale. */
const TABS: Tab[] = [
  { to: '/', label: 'Tournois', icon: 'trophy' },
  { to: '/groupe', label: 'Groupe', icon: 'users' },
  { to: '/moi', label: 'Moi', icon: 'user' },
];

/** Entrées en plus sur ordinateur seulement : la barre du bas du téléphone n'a pas la place. */
const OWNER_TABS: Tab[] = [
  { to: '/super-admins', label: 'Super admins', icon: 'userPlus' },
  { to: '/retours', label: 'Retours', icon: 'inbox' },
];
const ACCOUNT_TABS: Tab[] = [{ to: '/securite', label: 'Sécurité', icon: 'shield' }];

function NavItem({ tab, desktopOnly = false }: { tab: Tab; desktopOnly?: boolean }) {
  return (
    <NavLink to={tab.to} end={tab.to === '/'} className={desktopOnly ? 'nav-extra' : undefined}>
      <Icon name={tab.icon} size={24} />
      {tab.label}
    </NavLink>
  );
}

/**
 * Tout l'espace admin : réservé aux comptes connectés. Téléphone : navigation en barre du bas.
 * Ordinateur (≥ 960 px) : barre latérale à gauche, contenu large à droite (voir app.css).
 */
export function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined)
    return (
      <p className="page muted" role="status">
        Chargement…
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
        <nav className="nav" aria-label="Navigation">
          <div className="nav-brand logo" aria-hidden="true">
            i-am-in
          </div>
          {TABS.map((t) => (
            <NavItem key={t.to} tab={t} />
          ))}
          {isOwner && (
            <>
              <p className="nav-section nav-extra">Plateforme</p>
              {OWNER_TABS.map((t) => (
                <NavItem key={t.to} tab={t} desktopOnly />
              ))}
            </>
          )}
          <p className="nav-section nav-extra">Compte</p>
          {ACCOUNT_TABS.map((t) => (
            <NavItem key={t.to} tab={t} desktopOnly />
          ))}
          <div className="nav-user nav-extra">
            <span className="avatar" aria-hidden="true">
              {user.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="nav-user-text">
              <b>{user.username}</b>
              <span className="muted">
                {isOwner ? 'Propriétaire' : user.role === 'GROUP_CREATOR' ? 'Super admin' : 'Admin'}
              </span>
            </span>
          </div>
        </nav>
      </div>
    </GroupProvider>
  );
}
