import { useAction } from '../api/queries';
import type { TournamentSummary } from '../api/types';
import { useI18n } from '../lib/i18n';
import { ErrorNote } from './ErrorNote';

/** « Sana te passe la main sur Dames #4 » : à accepter ou refuser depuis la liste des tournois. */
export function RelayOffer({
  groupId,
  tournament,
}: {
  groupId: string;
  tournament: TournamentSummary;
}) {
  const { t } = useI18n();
  const act = useAction(groupId, tournament.id);
  return (
    <section className="card" aria-label={t('relay.offerRegion', { name: tournament.name })}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="tag tag-live">{t('relay.offeredBadge')}</span>
        <span>
          <b>{tournament.holder?.username ?? t('relay.anAdmin')}</b>{' '}
          {t('relay.offerText', { tournament: tournament.name })}
        </span>
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={act.isPending}
          onClick={() => act.mutate({ method: 'POST', path: '/relay/accept' })}
        >
          {t('relay.accept')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={act.isPending}
          onClick={() => act.mutate({ method: 'POST', path: '/relay/decline' })}
        >
          {t('relay.decline')}
        </button>
      </div>
      <ErrorNote error={act.error} />
    </section>
  );
}
