import { bracketRoundName } from '@iamin/engine';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isBracketView, type DrawView, type Score } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { ScoreSheet } from '../components/ScoreSheet';
import { namesOf } from '../lib/chat';
import { useTournamentCtx } from './tournament-context';

interface Line {
  code: string;
  a: string | null;
  b: string | null;
  score: Score | null;
  /** `waiting` : un joueur n'est pas encore connu ; `bye` : exempt. */
  state: 'waiting' | 'ready' | 'done' | 'bye';
  forfeit: boolean;
}

/** Les matchs d'un tour (élimination) ou d'une journée (ligue), sous une forme commune. */
export function roundsOf(draw: DrawView): { label: string; lines: Line[]; rest?: string | null }[] {
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

/**
 * Un joueur du tirage ne vient pas : un remplaçant prend sa place (même tirage, même graine).
 * Le remplaçant vient de la liste d'attente ou des inscrits qui n'étaient pas dans le tirage.
 */
function Replacement() {
  const { tournament, draw, act } = useTournamentCtx();
  const [outId, setOutId] = useState('');
  const [inId, setInId] = useState('');
  if (!draw) return null;
  const inDraw = new Set(draw.initialPlayers);
  const outs = tournament.registrations.filter((r) => inDraw.has(r.id) && r.status === 'ACCEPTED');
  const ins = tournament.registrations.filter(
    (r) => r.status === 'WAITLIST' || (r.status === 'ACCEPTED' && !inDraw.has(r.id)),
  );
  if (outs.length === 0 || ins.length === 0) return null;
  return (
    <details className="panel fold">
      <summary className="section-title">Remplacer un joueur</summary>
      <div className="field">
        <label htmlFor="replace-out" style={{ fontSize: 16 }}>
          Joueur absent
        </label>
        <select
          id="replace-out"
          className="input"
          style={{ height: 44, fontSize: 16 }}
          value={outId}
          onChange={(e) => setOutId(e.target.value)}
        >
          <option value="">Choisir</option>
          {outs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.platoName}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="replace-in" style={{ fontSize: 16 }}>
          Remplaçant
        </label>
        <select
          id="replace-in"
          className="input"
          style={{ height: 44, fontSize: 16 }}
          value={inId}
          onChange={(e) => setInId(e.target.value)}
        >
          <option value="">Choisir</option>
          {ins.map((r) => (
            <option key={r.id} value={r.id}>
              {r.platoName}
              {r.status === 'WAITLIST' ? ' (liste d’attente)' : ''}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className="btn btn-accent"
        disabled={outId === '' || inId === '' || act.isPending}
        onClick={() =>
          act.mutate(
            { method: 'POST', path: '/replacements', body: { outId, inId } },
            {
              onSuccess: () => {
                setOutId('');
                setInId('');
              },
            },
          )
        }
      >
        Remplacer
      </button>
    </details>
  );
}

export function Play() {
  const { tournament, draw, isHolder, act } = useTournamentCtx();
  const [picked, setPicked] = useState<number | null>(null);
  const [editing, setEditing] = useState<Line | null>(null);

  if (tournament.drawnAt === null) {
    return (
      <div className="page" style={{ paddingTop: 12 }}>
        <p className="card">
          Le tirage n’est pas fait. <Link to="../tirage">Va à l’onglet Tirage.</Link>
        </p>
      </div>
    );
  }
  if (!draw)
    return (
      <p className="page muted" role="status">
        Chargement…
      </p>
    );

  const names = namesOf(draw, tournament);
  const nameOf = (id: string | null) => (id === null ? 'à déterminer' : (names[id] ?? id));
  const rounds = roundsOf(draw);
  // Par défaut : le premier tour où il reste un match à jouer.
  const firstOpen = rounds.findIndex((r) => r.lines.some((l) => l.state === 'ready'));
  const index = Math.min(
    picked ?? (firstOpen === -1 ? rounds.length - 1 : firstOpen),
    rounds.length - 1,
  );
  const round = rounds[index];
  if (!round) return null;
  const finished = (r: (typeof rounds)[number]) =>
    r.lines.filter((l) => l.state === 'done' || l.state === 'bye').length;

  function save(line: Line, body: unknown) {
    act.mutate(
      { method: 'PUT', path: `/matches/${line.code}/result`, body },
      { onSuccess: () => setEditing(null) },
    );
  }
  const version = (code: string) => draw?.versions[code] ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
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
            onClick={() => setPicked(i)}
          >
            {r.label} · {finished(r)}/{r.lines.length}
          </button>
        ))}
      </div>

      <div className="page" style={{ paddingTop: 8 }}>
        {isBracketView(draw) && draw.champion && (
          <p className="card notice notice-ok">Vainqueur du tournoi : {nameOf(draw.champion)}</p>
        )}
        {!isHolder && (
          <p className="hint">Lecture seule : prends la main pour saisir les scores.</p>
        )}
        <ul>
          {round.lines.map((l, i) => {
            const aWins = l.score !== null && l.score.a > l.score.b;
            const bWins = l.score !== null && l.score.b > l.score.a;
            const tag = l.forfeit
              ? { text: 'FORFAIT', className: 'tag tag-bad' }
              : STATE_TAG[l.state];
            const editable = isHolder && (l.state === 'ready' || l.state === 'done');
            const content = (
              <>
                <span className="row-head">
                  <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>
                    Match {i + 1}
                  </span>
                  <span className={tag.className}>{tag.text}</span>
                </span>
                {(
                  [
                    ['a', l.a, aWins, bWins],
                    ['b', l.b, bWins, aWins],
                  ] as const
                ).map(([side, id, wins, loses]) => (
                  <span className="match-line" key={side}>
                    <span className={`match-name ${wins ? 'winner' : loses ? 'loser' : ''}`}>
                      {nameOf(id)}
                    </span>
                    <span className={`match-score tabular ${loses ? 'loser' : ''}`}>
                      {l.score ? l.score[side] : '–'}
                    </span>
                  </span>
                ))}
              </>
            );
            return (
              <li key={l.code}>
                {editable ? (
                  <button
                    type="button"
                    className="match"
                    aria-label={`Saisir le score du match ${i + 1}`}
                    onClick={() => setEditing(l)}
                  >
                    {content}
                  </button>
                ) : (
                  <div className="match">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
        {round.rest && <p className="muted">Repos : {nameOf(round.rest)}</p>}
        {!isBracketView(draw) && (
          <section aria-labelledby="standings">
            <h2 id="standings" className="section-title">
              Classement ({draw.standings.played}/{draw.standings.total})
            </h2>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
              <thead>
                <tr className="muted" style={{ textAlign: 'left', fontSize: 13 }}>
                  <th scope="col">#</th>
                  <th scope="col">Joueur</th>
                  <th scope="col">Pts</th>
                  <th scope="col">V-D</th>
                  <th scope="col">Diff</th>
                </tr>
              </thead>
              <tbody>
                {draw.standings.rows.map((r) => (
                  <tr
                    key={r.playerId}
                    className="tabular"
                    style={{ borderTop: '1px solid var(--line)', height: 40 }}
                  >
                    <td>{r.rank}</td>
                    <th scope="row" style={{ textAlign: 'left', fontWeight: 600 }}>
                      {nameOf(r.playerId)}
                    </th>
                    <td>{r.points}</td>
                    <td>
                      {r.wins}-{r.losses}
                    </td>
                    <td>{r.scoreDiff > 0 ? `+${r.scoreDiff}` : r.scoreDiff}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        <ErrorNote error={editing ? null : act.error} />
        {isHolder && tournament.status === 'STARTED' && <Replacement />}
      </div>

      {editing && (
        <ScoreSheet
          title={`Match ${round.lines.findIndex((l) => l.code === editing.code) + 1} · ${round.label}`}
          nameA={nameOf(editing.a)}
          nameB={nameOf(editing.b)}
          initial={editing.score}
          forfeitScore={draw.forfeitScore}
          pending={act.isPending}
          error={act.error}
          onClose={() => {
            act.reset();
            setEditing(null);
          }}
          onSave={(score) => save(editing, { ...score, version: version(editing.code) })}
          onForfeit={(side) => save(editing, { forfeit: side, version: version(editing.code) })}
          onDelete={
            editing.score
              ? () =>
                  act.mutate(
                    { method: 'DELETE', path: `/matches/${editing.code}/result` },
                    { onSuccess: () => setEditing(null) },
                  )
              : null
          }
        />
      )}
    </div>
  );
}
