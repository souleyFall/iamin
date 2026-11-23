import { Link } from 'react-router-dom';
import { useTournaments } from '../api/queries';
import type { TournamentSummary } from '../api/types';
import { useAuth } from '../auth/session';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { RelayOffer } from '../components/RelayOffer';
import { useCurrentGroup } from '../groups/current';
import { countsLine, FORMAT_LABEL, STATUS_CLASS, STATUS_LABEL } from '../lib/labels';

function relayLine(t: TournamentSummary, meId: string): { text: string; className: string } {
  if (t.status === 'FINISHED') return { text: 'Terminé', className: 'muted' };
  if (t.holder?.id === meId) return { text: 'Tu as la main', className: 'notice-ok' };
  if (t.holder) return { text: `Main : ${t.holder.username}`, className: 'muted' };
  return { text: 'Personne n’a la main', className: 'muted' };
}

function GroupPicker() {
  const { groups, current, select } = useCurrentGroup();
  if (!current) return null;
  const members = `${current.memberCount} admin${current.memberCount > 1 ? 's' : ''}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
      {groups.length > 1 ? (
        <>
          <label className="sr-only" htmlFor="group-select">
            Groupe
          </label>
          <select
            id="group-select"
            className="input"
            style={{ height: 44, fontSize: 17, fontWeight: 600, maxWidth: 240 }}
            value={current.id}
            onChange={(e) => select(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <strong style={{ fontSize: 17 }}>{current.name}</strong>
      )}
      <span className="muted" style={{ fontSize: 14 }}>
        {members}
      </span>
    </div>
  );
}

export function Tournaments() {
  const { user } = useAuth();
  const { current, loading, error: groupsError } = useCurrentGroup();
  const readable = current !== undefined && current.myRole !== null;
  const tournaments = useTournaments(readable ? current.id : undefined);
  const meId = user?.id ?? '';

  const offers = (tournaments.data ?? []).filter((t) => t.handoverTo?.id === meId);

  return (
    <>
      <header className="topbar" style={{ justifyContent: 'space-between' }}>
        <div className="logo">i-am-in</div>
      </header>
      <div className="page">
        <GroupPicker />
        <ErrorNote error={groupsError} />
        {loading && (
          <p className="muted" role="status">
            Chargement…
          </p>
        )}

        {!loading && !current && (
          <p className="card">
            Tu n’es membre d’aucun groupe. Demande une invitation à un super admin de ton groupe.
          </p>
        )}
        {current && !readable && (
          <p className="card">
            Le propriétaire de la plateforme n’accède pas aux tournois des groupes : connecte-toi
            avec un compte admin de groupe.
          </p>
        )}

        {readable &&
          offers.map((t) => <RelayOffer key={t.id} groupId={current.id} tournament={t} />)}

        {readable && (
          <>
            <h1 className="title" style={{ paddingTop: 6 }}>
              Mes tournois
            </h1>
            <ErrorNote error={tournaments.error} />
            {tournaments.data?.length === 0 && (
              <p className="muted">Aucun tournoi pour l’instant. Crée le premier ci-dessous.</p>
            )}
            <ul className="rows">
              {(tournaments.data ?? []).map((t) => {
                const relay = relayLine(t, meId);
                return (
                  <li key={t.id}>
                    <Link className="row-link" to={`/tournois/${t.id}`}>
                      <span className="row-head">
                        <span className="row-name">{t.name}</span>
                        <span className={STATUS_CLASS[t.status]}>{STATUS_LABEL[t.status]}</span>
                      </span>
                      <span className="muted">{FORMAT_LABEL[t.format]}</span>
                      <span className="row-head">
                        <span className="tabular">{countsLine(t.counts, t.capacity)}</span>
                        <span className={relay.className} style={{ fontSize: 13, fontWeight: 600 }}>
                          {relay.text}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link className="key key-wide" to="/nouveau">
              <Icon name="plus" stroke={2.25} />
              Nouveau tournoi
            </Link>
          </>
        )}
      </div>
    </>
  );
}
