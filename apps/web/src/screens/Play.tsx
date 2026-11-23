import { useState } from 'react';
import { Link } from 'react-router-dom';
import { isBracketView } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { defaultRound, MatchContent, RoundTabs, roundsOf, type Line } from '../components/Rounds';
import { ScoreSheet } from '../components/ScoreSheet';
import { StandingsTable } from '../components/StandingsTable';
import { namesOf } from '../lib/chat';
import { useI18n } from '../lib/i18n';
import { useTournamentCtx } from './tournament-context';

/**
 * Un joueur du tirage ne vient pas : un remplaçant prend sa place (même tirage, même graine).
 * Le remplaçant vient de la liste d'attente ou des inscrits qui n'étaient pas dans le tirage.
 */
function Replacement() {
  const { tournament, draw, act } = useTournamentCtx();
  const { t } = useI18n();
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
    <details className="panel fold desk-b">
      <summary className="section-title">{t('replace.title')}</summary>
      <div className="field">
        <label htmlFor="replace-out" style={{ fontSize: 16 }}>
          {t('replace.absent')}
        </label>
        <select
          id="replace-out"
          className="input"
          style={{ height: 44, fontSize: 16 }}
          value={outId}
          onChange={(e) => setOutId(e.target.value)}
        >
          <option value="">{t('replace.choose')}</option>
          {outs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.platoName}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="replace-in" style={{ fontSize: 16 }}>
          {t('replace.substitute')}
        </label>
        <select
          id="replace-in"
          className="input"
          style={{ height: 44, fontSize: 16 }}
          value={inId}
          onChange={(e) => setInId(e.target.value)}
        >
          <option value="">{t('replace.choose')}</option>
          {ins.map((r) => (
            <option key={r.id} value={r.id}>
              {r.platoName}
              {r.status === 'WAITLIST' ? t('replace.waitlist') : ''}
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
        {t('replace.submit')}
      </button>
    </details>
  );
}

export function Play() {
  const { tournament, draw, isHolder, act } = useTournamentCtx();
  const { t } = useI18n();
  const [picked, setPicked] = useState<number | null>(null);
  const [editing, setEditing] = useState<Line | null>(null);

  if (tournament.drawnAt === null) {
    return (
      <div className="page" style={{ paddingTop: 12 }}>
        <p className="card">
          {t('play.notDrawn')}
          <Link to="../tirage">{t('play.goToDraw')}</Link>
        </p>
      </div>
    );
  }
  if (!draw)
    return (
      <p className="page muted" role="status">
        {t('common.loading')}
      </p>
    );

  const names = namesOf(draw, tournament);
  const nameOf = (id: string | null) => (id === null ? t('match.tbd') : (names[id] ?? id));
  const rounds = roundsOf(draw, t);
  const index = Math.min(picked ?? defaultRound(rounds), rounds.length - 1);
  const round = rounds[index];
  if (!round) return null;

  function save(line: Line, body: unknown) {
    act.mutate(
      { method: 'PUT', path: `/matches/${line.code}/result`, body },
      { onSuccess: () => setEditing(null) },
    );
  }
  const version = (code: string) => draw?.versions[code] ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <RoundTabs rounds={rounds} index={index} onPick={setPicked} />

      <div className="page page-wide desk-grid" style={{ paddingTop: 8 }}>
        <div className="desk-main">
          {isBracketView(draw) && draw.champion && (
            <p className="card notice notice-ok">
              {t('play.champion', { name: nameOf(draw.champion) })}
            </p>
          )}
          {!isHolder && <p className="hint">{t('play.readOnly')}</p>}
          <ul className="match-list">
            {round.lines.map((l, i) => {
              const editable = isHolder && (l.state === 'ready' || l.state === 'done');
              const content = <MatchContent line={l} position={i + 1} nameOf={nameOf} />;
              return (
                <li key={l.code}>
                  {editable ? (
                    <button
                      type="button"
                      className="match"
                      aria-label={t('match.enterScore', { n: i + 1 })}
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
          {round.rest && <p className="muted">{t('play.rest', { name: nameOf(round.rest) })}</p>}
        </div>
        {!isBracketView(draw) && (
          <div className="desk-a">
            <StandingsTable standings={draw.standings} nameOf={nameOf} />
          </div>
        )}
        <ErrorNote error={editing ? null : act.error} />
        {isHolder && tournament.status === 'STARTED' && <Replacement />}
      </div>

      {editing && (
        <ScoreSheet
          title={t('play.sheetTitle', {
            n: round.lines.findIndex((l) => l.code === editing.code) + 1,
            round: round.label,
          })}
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
