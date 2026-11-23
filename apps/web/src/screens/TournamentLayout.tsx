import { Link, NavLink, Navigate, Outlet, useParams } from 'react-router-dom';
import { useAction, useDraw, useGroup, useTournament } from '../api/queries';
import { useAuth } from '../auth/session';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { useCurrentGroup } from '../groups/current';
import { FORMAT_LABEL, STATUS_CLASS, STATUS_LABEL } from '../lib/labels';
import { RelayBar } from './RelayBar';
import type { TournamentCtx } from './tournament-context';

const TABS = [
  { to: 'inscrits', label: 'Inscrits' },
  { to: 'pointage', label: 'Pointage' },
  { to: 'tirage', label: 'Tirage' },
  { to: 'jeu', label: 'En jeu' },
  { to: 'journal', label: 'Journal' },
];

export function TournamentLayout() {
  const { current, loading } = useCurrentGroup();
  const { user } = useAuth();
  // Tant que la liste des groupes n'est pas arrivée, on ne sait pas encore si l'accès est permis.
  if (loading)
    return (
      <p className="page muted" role="status">
        Chargement…
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
  const { tournamentId = '' } = useParams();
  const tournament = useTournament(groupId, tournamentId);
  const group = useGroup(groupId);
  const t = tournament.data;
  const draw = useDraw(groupId, tournamentId, t?.drawnAt != null);
  const act = useAction(groupId, tournamentId);

  if (tournament.isPending)
    return (
      <p className="page muted" role="status">
        Chargement…
      </p>
    );
  if (!t) {
    return (
      <div className="page">
        <ErrorNote error={tournament.error} />
        <Link to="/">Retour aux tournois</Link>
      </div>
    );
  }

  const isHolder = t.holder?.id === user.id;
  const ctx: TournamentCtx = {
    groupId,
    groupRole: group.data?.myRole ?? null,
    tournament: t,
    draw: draw.data,
    me: user,
    isHolder,
    act,
  };

  return (
    <>
      <header className="topbar">
        <Link className="icon-btn flat" to="/" aria-label="Retour aux tournois">
          <Icon name="back" size={24} />
        </Link>
        <div className="topbar-title">
          <h1 className="title">{t.name}</h1>
          <p className="subtitle">{FORMAT_LABEL[t.format]}</p>
        </div>
        <Link className="icon-btn" to="copier" aria-label="Copier pour le chat">
          <Icon name="copy" />
        </Link>
        <span className={STATUS_CLASS[t.status]}>{STATUS_LABEL[t.status]}</span>
      </header>
      <RelayBar ctx={ctx} />
      <nav className="tabs" aria-label="Sections du tournoi" style={{ marginTop: 8 }}>
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet context={ctx} />
    </>
  );
}
