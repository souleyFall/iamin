import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { keys, tournamentPath } from '../api/queries';
import type { Journal as JournalPage, JournalEvent } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { roundsOf } from '../components/Rounds';
import { useI18n } from '../lib/i18n';
import { describeEvent, type JournalEnv } from '../lib/journal';
import { initialOf } from '../lib/labels';
import { useTournamentCtx } from './tournament-context';

const PAGE = 30;
const NO_REFS: JournalPage['refs'] = { players: {}, users: {} };

/** Jour local d'un événement (clé de regroupement). */
const dayOf = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/**
 * Le journal : qui a fait quoi et quand (R14). Les plus récents d'abord, regroupés par jour, chaque
 * ligne avec une phrase lisible (noms, match, score) et l'admin qui a fait l'action.
 */
export function Journal() {
  const { groupId, tournament, draw } = useTournamentCtx();
  const { t, date } = useI18n();
  const query = useInfiniteQuery({
    queryKey: [...keys.journal(groupId, tournament.id)],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<JournalPage>(
        'GET',
        `${tournamentPath(groupId, tournament.id)}/events?limit=${PAGE}${pageParam ? `&before=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    refetchOnWindowFocus: true,
  });
  const pages = query.data?.pages ?? [];
  const events: JournalEvent[] = pages.flatMap((p) => p.events);

  // Les noms et les matchs : chaque page lue apporte sa propre table de noms.
  const refs = pages.reduce<JournalPage['refs']>(
    (all, page) => ({
      players: { ...all.players, ...page.refs.players },
      users: { ...all.users, ...page.refs.users },
    }),
    NO_REFS,
  );
  const knownPlayers = Object.fromEntries([
    ...tournament.registrations.map((r) => [r.id, r.platoName] as const),
    ...(draw?.players ?? []).map((p) => [p.id, p.platoName] as const),
  ]);
  const matches: JournalEnv['matches'] = {};
  if (draw) {
    for (const round of roundsOf(draw, t)) {
      round.lines.forEach((l, i) => {
        matches[l.code] = { round: round.label, position: i + 1, a: l.a, b: l.b };
      });
    }
  }
  const env: JournalEnv = { refs, knownPlayers, matches, t };

  // L'heure est lue une seule fois (initialisation paresseuse) : le rendu reste pur.
  const [now] = useState(() => Date.now());
  const today = dayOf(new Date(now).toISOString());
  const yesterday = dayOf(new Date(now - 86_400_000).toISOString());
  const dayTitle = (iso: string): string =>
    dayOf(iso) === today
      ? t('journal.today')
      : dayOf(iso) === yesterday
        ? t('journal.yesterday')
        : date(iso, { weekday: 'long', day: 'numeric', month: 'long' });

  // Une ligne par événement, avec le titre du jour quand le jour change.
  const rows = events.map((e, i) => ({
    e,
    view: describeEvent(e, env),
    heading:
      i > 0 && dayOf(events[i - 1]!.createdAt) === dayOf(e.createdAt)
        ? null
        : dayTitle(e.createdAt),
  }));
  return (
    <div className="page" style={{ paddingTop: 12 }}>
      <h2 className="section-title">{t('journal.title')}</h2>
      <p className="hint">{t('journal.hint')}</p>
      <ErrorNote error={query.error} />
      {query.isPending && (
        <p className="muted" role="status">
          {t('common.loading')}
        </p>
      )}
      {!query.isPending && events.length === 0 && <p className="muted">{t('journal.empty')}</p>}
      <ul className="journal">
        {rows.map(({ e, view, heading }) => {
          return (
            <li key={e.id} className="journal-item">
              {heading && <h3 className="journal-day">{heading}</h3>}
              <div className={`journal-row cat-${view.category}`}>
                <span className="journal-dot" aria-hidden="true" />
                <div className="journal-body">
                  <div className="journal-head">
                    <span className="journal-title">{view.title}</span>
                    <time className="muted tabular" dateTime={e.createdAt}>
                      {date(e.createdAt, { hour: '2-digit', minute: '2-digit' })}
                    </time>
                  </div>
                  {view.detail && <p className="journal-detail">{view.detail}</p>}
                  <p className="journal-actor muted">
                    <span className={`avatar avatar-sm${view.actor.removed ? ' is-gone' : ''}`}>
                      {initialOf(view.actor.name)}
                    </span>
                    {t('journal.by', { name: view.actor.name })}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {query.hasNextPage && (
        <button
          type="button"
          className="btn"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('journal.older')}
        </button>
      )}
    </div>
  );
}
