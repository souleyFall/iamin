import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { keys, tournamentPath } from '../api/queries';
import type { Journal as JournalPage, JournalEvent } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { useI18n, type I18n } from '../lib/i18n';
import { eventLabel } from '../lib/labels';
import { useTournamentCtx } from './tournament-context';

const PAGE = 30;

/** Détail utile d'un événement : le code du match et le score. Jamais de pseudo (voir D17). */
export function eventDetail(e: JournalEvent, t: I18n['t']): string | null {
  const { code, a, b, seed } = e.payload as {
    code?: unknown;
    a?: unknown;
    b?: unknown;
    seed?: unknown;
  };
  const parts: string[] = [];
  if (typeof code === 'string') parts.push(code);
  if (typeof a === 'number' && typeof b === 'number') parts.push(`${a}-${b}`);
  if (typeof seed === 'string') parts.push(t('journal.seed', { seed: seed.slice(0, 8) }));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Le journal : qui a fait quoi et quand (R14). Les plus récents d'abord. */
export function Journal() {
  const { groupId, tournament } = useTournamentCtx();
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
  const events = (query.data?.pages ?? []).flatMap((p) => p.events);

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
      <ul>
        {events.map((e) => {
          const detail = eventDetail(e, t);
          return (
            <li key={e.id} className="player-row" style={{ alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{eventLabel(e.type, t)}</div>
                <div className="muted tabular" style={{ fontSize: 14 }}>
                  {e.actor?.username ?? t('common.unknownUser')} ·{' '}
                  {date(e.createdAt, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {detail ? ` · ${detail}` : ''}
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
