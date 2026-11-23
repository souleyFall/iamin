import { useState } from 'react';
import { isBracketView } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { namesOf } from '../lib/chat';
import { useTournamentCtx } from './tournament-context';

/** Plus petite puissance de deux au moins égale à n (taille du tableau d'élimination). */
export const bracketSize = (n: number): number => {
  let size = 2;
  while (size < n) size *= 2;
  return size;
};

export function Draw() {
  const { tournament, draw, isHolder, act } = useTournamentCtx();
  const [legs, setLegs] = useState<1 | 2>(1);
  const present = tournament.registrations.filter(
    (r) => r.status === 'ACCEPTED' && r.presence === 'PRESENT',
  ).length;

  if (tournament.drawnAt !== null) {
    const names = namesOf(draw, tournament);
    return (
      <div className="page" style={{ paddingTop: 12 }}>
        <h2 className="section-title">Tirage effectué</h2>
        <p className="muted">
          Le tirage est vérifiable : avec la même liste et la même graine, n’importe qui retrouve ce
          résultat.
        </p>
        <div className="panel">
          <div className="field">
            <span className="section-title" style={{ fontSize: 18 }}>
              Graine
            </span>
            <code style={{ overflowWrap: 'anywhere' }}>{tournament.drawSeed}</code>
          </div>
          {draw && isBracketView(draw) && draw.bracket.byes > 0 && (
            <p>
              {draw.initialPlayers.length} joueurs, tableau de {draw.bracket.size} :{' '}
              <b>
                {draw.bracket.byes} bye{draw.bracket.byes > 1 ? 's' : ''}
              </b>{' '}
              (des joueurs tirés au sort passent le premier tour).
            </p>
          )}
        </div>
        <h3 className="section-title">Ordre du tirage</h3>
        <ol style={{ margin: 0, paddingLeft: 24 }}>
          {(draw?.initialPlayers ?? []).map((id) => (
            <li key={id} style={{ padding: '4px 0', fontSize: 17 }}>
              {names[id] ?? id}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const isLeague = tournament.format === 'LEAGUE';
  const size = bracketSize(Math.max(present, 2));
  const byes = size - present;
  const ready = tournament.status === 'CHECK_IN' && present >= 2 && isHolder;

  return (
    <div className="page" style={{ paddingTop: 12 }}>
      <h2 className="section-title">Tirage au sort</h2>
      <div className="panel">
        <p>
          <b>{present}</b> joueur{present > 1 ? 's' : ''} présent{present > 1 ? 's' : ''}.
        </p>
        {!isLeague && present >= 2 && (
          <p className="muted">
            Tableau de {size}
            {byes > 0
              ? ` : ${byes} bye${byes > 1 ? 's' : ''}. Les byes vont à des joueurs tirés au sort, jamais deux dans le même match.`
              : ', aucun bye.'}
          </p>
        )}
        {isLeague && (
          <div className="field">
            <span className="section-title" style={{ fontSize: 18 }}>
              Matchs
            </span>
            <div className="segmented">
              <button type="button" aria-pressed={legs === 1} onClick={() => setLegs(1)}>
                Aller simple
              </button>
              <button type="button" aria-pressed={legs === 2} onClick={() => setLegs(2)}>
                Aller-retour
              </button>
            </div>
          </div>
        )}
        {tournament.status === 'REGISTRATION' && (
          <p className="notice notice-bad">Ouvre le pointage avant le tirage (onglet Pointage).</p>
        )}
        {present < 2 && tournament.status === 'CHECK_IN' && (
          <p className="notice notice-bad">Il faut au moins 2 joueurs présents.</p>
        )}
        <p className="hint">
          Le serveur choisit la graine et la publie avec la liste des joueurs : personne ne peut «
          essayer » un tirage jusqu’à obtenir celui qu’il veut. Le tirage ne se refait pas.
        </p>
        <button
          className="key key-wide"
          type="button"
          disabled={!ready || act.isPending}
          onClick={() =>
            act.mutate({ method: 'POST', path: '/draw', body: isLeague ? { legs } : {} })
          }
        >
          Faire le tirage
        </button>
        <ErrorNote error={act.error} />
      </div>
    </div>
  );
}
