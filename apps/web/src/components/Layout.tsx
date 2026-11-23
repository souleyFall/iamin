import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/session';
import { GroupProvider } from '../groups/current';
import { Icon, type IconName } from './Icon';

const TABS: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'Tournois', icon: 'trophy' },
  { to: '/groupe', label: 'Groupe', icon: 'users' },
  { to: '/moi', label: 'Moi', icon: 'user' },
];

/** Tout l'espace admin : réservé aux comptes connectés, avec la navigation du bas. */
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
  return (
    <GroupProvider>
      <div className="shell">
        <main className="shell-main">
          <Outlet />
        </main>
        <nav className="nav" aria-label="Navigation">
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'}>
              <Icon name={t.icon} size={24} />
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </GroupProvider>
  );
}
