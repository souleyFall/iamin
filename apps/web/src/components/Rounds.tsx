import { bracketRoundName } from '@iamin/engine';
import { isBracketView, type DrawView, type Score } from '../api/types';

export interface Line {
  code: string;
  a: string | null;
  b: string | null;
  score: Score | null;
  /** `waiting` : un joueur n'est pas encore connu ; `bye` : exempt. */
  state: 'waiting' | 'ready' | 'done' | 'bye';
  forfeit: boolean;
}

export interface Round {
  label: string;
  lines: Line[];
  rest?: string | null;
}

/** Les matchs d'un tour (élimination) ou d'une journée (ligue), sous une forme commune. */
export function roundsOf(draw: DrawView): Round[] {
  if (isBracketView(draw)) {
    const total = draw.bracket.rounds.length;
    return draw.bracket.rounds.map((matches, i) => ({
      label: bracketRoundName(i + 1, total),
      lines: matches.map((m) => ({
        code: m.id,
        a: m.a,
        b: m.b,
        score: m.score,
        state: m.status,
        forfeit: draw.forfeits[m.id] != null,
      })),
    }));
  }
  return draw.schedule.rounds.map((matches, i) => ({
    label: `Journée ${i + 1}`,
    rest: draw.schedule.rests[i],
    lines: matches.map((m) => {
      const score = draw.scores[m.id] ?? null;
      return {
        code: m.id,
        a: m.a,
        b: m.b,
        score,
        state: score ? 'done' : 'ready',
        forfeit: draw.forfeits[m.id] != null,
      } satisfies Line;
    }),
  }));
}

const STATE_TAG: Record<Line['state'], { text: string; className: string }> = {
  done: { text: 'TERMINÉ', className: 'tag tag-ok' },
  ready: { text: 'À JOUER', className: 'tag' },
  waiting: { text: 'EN ATTENTE', className: 'tag' },
  bye: { text: 'BYE', className: 'tag' },
};

/** Le tour à afficher par défaut : le premier où il reste un match à jouer, sinon le dernier. */
export function defaultRound(rounds: Round[]): number {
  const firstOpen = rounds.findIndex((r) => r.lines.some((l) => l.state === 'ready'));
  return firstOpen === -1 ? rounds.length - 1 : firstOpen;
}

const finished = (r: Round) =>
  r.lines.filter((l) => l.state === 'done' || l.state === 'bye').length;

/** Onglets des tours, avec le nombre de matchs terminés. */
export function RoundTabs({
  rounds,
  index,
  onPick,
}: {
  rounds: Round[];
  index: number;
  onPick: (i: number) => void;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Tours">
      {rounds.map((r, i) => (
        <button
          key={r.label}
          type="button"
          role="tab"
          aria-selected={i === index}
          className="link-btn"
          style={{
            flex: 1,
            minWidth: 72,
            textAlign: 'center',
            color: i === index ? 'var(--text)' : 'var(--muted)',
            fontWeight: i === index ? 700 : 500,
            fontSize: 13,
            borderBottom: `3px solid ${i === index ? 'var(--action)' : 'transparent'}`,
            borderRadius: 0,
            background: 'transparent',
          }}
          onClick={() => onPick(i)}
        >
          {r.label} · {finished(r)}/{r.lines.length}
        </button>
      ))}
    </div>
  );
}

/** Contenu d'une fiche de match (pour la poser dans un bouton ou dans un bloc). */
export function MatchContent({
  line,
  position,
  nameOf,
}: {
  line: Line;
  position: number;
  nameOf: (id: string | null) => string;
}) {
  const aWins = line.score !== null && line.score.a > line.score.b;
  const bWins = line.score !== null && line.score.b > line.score.a;
  const tag = line.forfeit ? { text: 'FORFAIT', className: 'tag tag-bad' } : STATE_TAG[line.state];
  return (
    <>
      <span className="row-head">
        <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
          Match {position}
        </span>
        <span className={tag.className}>{tag.text}</span>
      </span>
      {(
        [
          ['a', line.a, aWins, bWins],
          ['b', line.b, bWins, aWins],
        ] as const
      ).map(([side, id, wins, loses]) => (
        <span className="match-line" key={side}>
          <span className={`match-name ${wins ? 'winner' : loses ? 'loser' : ''}`}>
            {nameOf(id)}
          </span>
          <span className={`match-score tabular ${loses ? 'loser' : ''}`}>
            {line.score ? line.score[side] : '–'}
          </span>
        </span>
      ))}
    </>
  );
}
