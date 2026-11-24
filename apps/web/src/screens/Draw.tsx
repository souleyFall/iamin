import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isBracketView } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { namesOf } from '../lib/chat';
import { useI18n } from '../lib/i18n';
import { useTournamentCtx } from './tournament-context';

/** Plus petite puissance de deux au moins égale à n (taille du tableau d'élimination). */
export const bracketSize = (n: number): number => {
  let size = 2;
  while (size < n) size *= 2;
  return size;
};

export function Draw() {
  const { tournament, draw, isHolder, act } = useTournamentCtx();
  const { t, tn } = useI18n();
  const navigate = useNavigate();
  const [legs, setLegs] = useState<1 | 2>(1);
  const present = tournament.registrations.filter(
    (r) => r.status === 'ACCEPTED' && r.presence === 'PRESENT',
  ).length;

  if (tournament.drawnAt !== null) {
    const names = namesOf(draw, tournament);
    return (
      <div className="page" style={{ paddingTop: 12 }}>
        <h2 className="section-title">{t('draw.doneTitle')}</h2>
        <p className="muted">{t('draw.doneHint')}</p>
        <Link className="key key-wide" to="../jeu">
          {t('draw.seeMatches')}
        </Link>
        {draw && isBracketView(draw) && draw.bracket.byes > 0 && (
          <p>
            {t('draw.bracketLine', {
              players: draw.initialPlayers.length,
              size: draw.bracket.size,
            })}
            <b>{tn('draw.byes', draw.bracket.byes)}</b>
            {t('draw.byesTail')}
          </p>
        )}
        {/* La graine et l'ordre servent à vérifier le tirage : repliés, ils ne gênent pas. */}
        <details className="panel fold">
          <summary className="section-title">{t('draw.details')}</summary>
          <p className="muted">{t('draw.verifiable')}</p>
          <div className="field">
            <span className="section-title" style={{ fontSize: 18 }}>
              {t('draw.seed')}
            </span>
            <code style={{ overflowWrap: 'anywhere' }}>{tournament.drawSeed}</code>
          </div>
          <h3 className="section-title">{t('draw.order')}</h3>
          <ol style={{ margin: 0, paddingInlineStart: 24 }}>
            {(draw?.initialPlayers ?? []).map((id) => (
              <li key={id} style={{ padding: '4px 0', fontSize: 17 }}>
                {names[id] ?? id}
              </li>
            ))}
          </ol>
        </details>
      </div>
    );
  }

  const isLeague = tournament.format === 'LEAGUE';
  const size = bracketSize(Math.max(present, 2));
  const byes = size - present;
  const ready = tournament.status === 'CHECK_IN' && present >= 2 && isHolder;

  return (
    <div className="page" style={{ paddingTop: 12 }}>
      <h2 className="section-title">{t('draw.title')}</h2>
      <div className="panel">
        <p>{tn('draw.presentCount', present)}</p>
        {!isLeague && present >= 2 && (
          <p className="muted">
            {t('draw.bracketSize', { size })}
            {byes > 0 ? tn('draw.withByes', byes) : t('draw.noBye')}
          </p>
        )}
        {isLeague && (
          <div className="field">
            <span className="section-title" style={{ fontSize: 18 }}>
              {t('draw.matches')}
            </span>
            <div className="segmented">
              <button type="button" aria-pressed={legs === 1} onClick={() => setLegs(1)}>
                {t('draw.singleLeg')}
              </button>
              <button type="button" aria-pressed={legs === 2} onClick={() => setLegs(2)}>
                {t('draw.doubleLeg')}
              </button>
            </div>
          </div>
        )}
        {tournament.status === 'REGISTRATION' && (
          <p className="notice notice-bad">{t('draw.openCheckInFirst')}</p>
        )}
        {present < 2 && tournament.status === 'CHECK_IN' && (
          <p className="notice notice-bad">{t('draw.needTwo')}</p>
        )}
        <p className="hint">{t('draw.fairHint')}</p>
        <button
          className="key key-wide"
          type="button"
          disabled={!ready || act.isPending}
          onClick={() =>
            act.mutate(
              { method: 'POST', path: '/draw', body: isLeague ? { legs } : {} },
              // Étape suivante sans clic : les matchs du premier tour.
              { onSuccess: () => void navigate('../jeu') },
            )
          }
        >
          {t('draw.do')}
        </button>
        <ErrorNote error={act.error} />
      </div>
    </div>
  );
}
