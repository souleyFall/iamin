import { isBracketView, type DrawView, type Score } from '../api/types';
import { Icon } from './Icon';
import { useI18n, type I18n } from '../lib/i18n';
import type { MessageKey } from '../lib/i18n/messages';
import { roundName } from '../lib/labels';

export interface Line {
  code: string;
  a: string | null;
  b: string | null;
  score: Score | null;
  /**
   * `true` en ligue : on affiche le score. En élimination directe on désigne le vainqueur sans
   * score : seul le gagnant est marqué.
   */
  scored: boolean;
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
export function roundsOf(draw: DrawView, t: I18n['t']): Round[] {
  if (isBracketView(draw)) {
    const total = draw.bracket.rounds.length;
    return draw.bracket.rounds.map((matches, i) => ({
      label: roundName(i + 1, total, t),
      lines: matches.map((m) => ({
        code: m.id,
        a: m.a,
        b: m.b,
        score: m.score,
        scored: false,
        state: m.status,
        forfeit: draw.forfeits[m.id] != null,
      })),
    }));
  }
  return draw.schedule.rounds.map((matches, i) => ({
    label: t('chat.round', { n: i + 1 }),
    rest: draw.schedule.rests[i],
    lines: matches.map((m) => {
      const score = draw.scores[m.id] ?? null;
      return {
        code: m.id,
        a: m.a,
        b: m.b,
        score,
        scored: true,
        state: score ? 'done' : 'ready',
        forfeit: draw.forfeits[m.id] != null,
      } satisfies Line;
    }),
  }));
}

const STATE_TAG: Record<Line['state'], { text: MessageKey; className: string }> = {
  done: { text: 'match.state.done', className: 'tag tag-ok' },
  ready: { text: 'match.state.ready', className: 'tag' },
  waiting: { text: 'match.state.waiting', className: 'tag' },
  bye: { text: 'match.state.bye', className: 'tag' },
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
  const { t } = useI18n();
  return (
    <div className="tabs" role="tablist" aria-label={t('rounds.label')}>
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
  const { t } = useI18n();
  const aWins = line.score !== null && line.score.a > line.score.b;
  const bWins = line.score !== null && line.score.b > line.score.a;
  const drawn = line.scored && line.score !== null && line.score.a === line.score.b;
  const tag = line.forfeit
    ? { text: 'match.state.forfeit' as MessageKey, className: 'tag tag-bad' }
    : drawn
      ? { text: 'score.drawValid' as MessageKey, className: 'tag tag-ok' }
      : STATE_TAG[line.state];
  return (
    <>
      <span className="row-head">
        <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
          {t('match.n', { n: position })}
        </span>
        <span className={tag.className}>{t(tag.text)}</span>
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
          {line.scored ? (
            <span className={`match-score tabular ${loses ? 'loser' : ''}`}>
              {line.score ? line.score[side] : '–'}
            </span>
          ) : (
            // Élimination : pas de score, une coche pour le vainqueur.
            <span
              className="match-score match-win"
              aria-label={wins ? t('match.winnerMark') : undefined}
            >
              {wins ? <Icon name="check" size={20} stroke={2.5} /> : null}
            </span>
          )}
        </span>
      ))}
    </>
  );
}
