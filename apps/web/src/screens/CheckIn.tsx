import { Link } from 'react-router-dom';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { Lcd } from '../components/Lcd';
import { initialOf, isOpenStatus } from '../lib/labels';
import { useTournamentCtx } from './tournament-context';

/** Le pointage : qui est là ? Seuls les présents sont tirés au sort. */
export function CheckIn() {
  const { tournament, isHolder, act } = useTournamentCtx();
  const open = isOpenStatus(tournament.status);
  const canWrite = isHolder && open;
  const accepted = tournament.registrations.filter((r) => r.status === 'ACCEPTED');
  const present = accepted.filter((r) => r.presence === 'PRESENT').length;
  const absent = accepted.filter((r) => r.presence === 'ABSENT').length;
  const unknown = accepted.length - present - absent;
  const setPresence = (id: string, presence: 'PRESENT' | 'ABSENT' | 'UNKNOWN') =>
    act.mutate({ method: 'PATCH', path: `/registrations/${id}`, body: { presence } });

  const readouts = [
    { value: present, label: present > 1 ? 'présents' : 'présent', color: undefined },
    { value: absent, label: absent > 1 ? 'absents' : 'absent', color: undefined },
    { value: unknown, label: 'à pointer', color: unknown > 0 ? 'var(--accent)' : undefined },
  ];

  return (
    <div className="page" style={{ paddingTop: 12 }}>
      <div className="screen" role="group" aria-label="Compteurs du pointage">
        {readouts.map((r) => (
          <div className="readout" key={r.label}>
            <Lcd value={r.value} color={r.color} />
            <div className="readout-label">{r.label}</div>
          </div>
        ))}
      </div>

      {tournament.status === 'REGISTRATION' && (
        <div className="card">
          <p>Les inscriptions sont ouvertes. Ouvre le pointage quand les joueurs arrivent.</p>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!isHolder || act.isPending}
            onClick={() => act.mutate({ method: 'PATCH', path: '', body: { status: 'CHECK_IN' } })}
          >
            Ouvrir le pointage
          </button>
        </div>
      )}

      {accepted.length === 0 && <p className="muted">Aucun inscrit à pointer pour l’instant.</p>}
      <ul>
        {accepted.map((r) => (
          <li key={r.id} className="player-row">
            <span className="avatar">{initialOf(r.platoName)}</span>
            <span className="player-name">{r.platoName}</span>
            <div className="toggle" role="group" aria-label={`Présence de ${r.platoName}`}>
              <button
                type="button"
                className={r.presence === 'PRESENT' ? 'on-ok' : undefined}
                aria-pressed={r.presence === 'PRESENT'}
                disabled={!canWrite || act.isPending}
                onClick={() => setPresence(r.id, r.presence === 'PRESENT' ? 'UNKNOWN' : 'PRESENT')}
              >
                <Icon name="check" size={16} stroke={2.5} />
                Présent
              </button>
              <button
                type="button"
                className={r.presence === 'ABSENT' ? 'on-bad' : undefined}
                aria-pressed={r.presence === 'ABSENT'}
                aria-label="Absent"
                disabled={!canWrite || act.isPending}
                onClick={() => setPresence(r.id, r.presence === 'ABSENT' ? 'UNKNOWN' : 'ABSENT')}
              >
                <Icon name="close" size={18} stroke={2.5} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <ErrorNote error={act.error} />

      {tournament.status === 'CHECK_IN' && (
        <>
          <p className="hint" style={{ textAlign: 'center' }}>
            Le tirage se fait uniquement avec les joueurs présents.
          </p>
          <Link className="key key-wide" to="../tirage">
            Valider les {present} présent{present > 1 ? 's' : ''}
          </Link>
        </>
      )}
    </div>
  );
}
