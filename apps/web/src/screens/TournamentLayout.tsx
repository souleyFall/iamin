import { Link, NavLink, Navigate, Outlet, useParams } from 'react-router-dom';
import { useAction, useDraw, useGroup, useTournament } from '../api/queries';
import { useAuth } from '../auth/session';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { useCurrentGroup } from '../groups/current';
import { useI18n } from '../lib/i18n';
import type { MessageKey } from '../lib/i18n/messages';
import { FORMAT_KEY, STATUS_CLASS, STATUS_KEY } from '../lib/labels';
import { RelayBar } from './RelayBar';
import type { TournamentCtx } from './tournament-context';

const TABS: { to: string; label: MessageKey }[] = [
  { to: 'inscrits', label: 'tabs.registrations' },
  { to: 'pointage', label: 'tabs.checkIn' },
  { to: 'tirage', label: 'tabs.draw' },
  { to: 'jeu', label: 'tabs.play' },
  { to: 'journal', label: 'tabs.log' },
];

export function TournamentLayout() {
  const { current, loading } = useCurrentGroup();
  const { user } = useAuth();
  const { t } = useI18n();
  // Tant que la liste des groupes n'est pas arrivée, on ne sait pas encore si l'accès est permis.
  if (loading)
    return (
      <p className="page muted" role="status">
        {t('common.loading')}
      </p>
    );
  if (!current || current.myRole === null || !user) return <Navigate to="/" replace />;
  return <Loaded groupId={current.id} user={user} />;
}

function Loaded({
  groupId,
  user,
}: {
  groupId: string;
  user: NonNullable<ReturnType<typeof useAuth>['user']>;
}) {
  const { t } = useI18n();
  const { tournamentId = '' } = useParams();
  const tournament = useTournament(groupId, tournamentId);
  const group = useGroup(groupId);
  const tour = tournament.data;
  const draw = useDraw(groupId, tournamentId, tour?.drawnAt != null);
  const act = useAction(groupId, tournamentId);

  if (tournament.isPending)
    return (
      <p className="page muted" role="status">
        {t('common.loading')}
      </p>
    );
  if (!tour) {
    return (
      <div className="page">
        <ErrorNote error={tournament.error} />
        <Link to="/">{t('tournament.backToList')}</Link>
      </div>
    );
  }

  const isHolder = tour.holder?.id === user.id;
  const ctx: TournamentCtx = {
    groupId,
    groupRole: group.data?.myRole ?? null,
    tournament: tour,
    draw: draw.data,
    me: user,
    isHolder,
    act,
  };

  return (
    <>
      <header className="topbar">
        <Link className="icon-btn flat" to="/" aria-label={t('tournament.backToList')}>
          <Icon name="back" size={24} />
        </Link>
        <div className="topbar-title">
          <h1 className="title">{tour.name}</h1>
          <p className="subtitle">{t(FORMAT_KEY[tour.format])}</p>
        </div>
        <Link className="icon-btn" to="copier" aria-label={t('tournament.copyForChat')}>
          <Icon name="copy" />
        </Link>
        <span className={STATUS_CLASS[tour.status]}>{t(STATUS_KEY[tour.status])}</span>
      </header>
      <RelayBar ctx={ctx} />
      <nav className="tabs" aria-label={t('tabs.label')} style={{ marginTop: 8 }}>
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to}>
            {t(tab.label)}
          </NavLink>
        ))}
      </nav>
      <Outlet context={ctx} />
    </>
  );
}
