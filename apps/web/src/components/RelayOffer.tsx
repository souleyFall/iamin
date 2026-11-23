import { useAction } from '../api/queries';
import type { TournamentSummary } from '../api/types';
import { ErrorNote } from './ErrorNote';

/** « Sana te passe la main sur Dames #4 » : à accepter ou refuser depuis la liste des tournois. */
export function RelayOffer({
  groupId,
  tournament,
}: {
  groupId: string;
  tournament: TournamentSummary;
}) {
  const act = useAction(groupId, tournament.id);
  return (
    <section className="card" aria-label={`Relais proposé sur ${tournament.name}`}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="tag tag-live">RELAIS PROPOSÉ</span>
        <span>
          <b>{tournament.holder?.username ?? 'Un admin'}</b> te passe la main sur {tournament.name}
        </span>
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={act.isPending}
          onClick={() => act.mutate({ method: 'POST', path: '/relay/accept' })}
        >
          Accepter
        </button>
        <button
          type="button"
          className="btn"
          disabled={act.isPending}
          onClick={() => act.mutate({ method: 'POST', path: '/relay/decline' })}
        >
          Refuser
        </button>
      </div>
      <ErrorNote error={act.error} />
    </section>
  );
}
