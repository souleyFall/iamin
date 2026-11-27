import { Link } from 'react-router-dom';
import { useTournaments } from '../api/queries';
import type { TournamentSummary } from '../api/types';
import { useAuth } from '../auth/session';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { RelayOffer } from '../components/RelayOffer';
import { When } from '../components/When';
import { useCurrentGroup } from '../groups/current';
import { useI18n, type I18n } from '../lib/i18n';
import { countsLine, FORMAT_KEY, STATUS_CLASS, STATUS_KEY } from '../lib/labels';

function relayLine(
  t: TournamentSummary,
  meId: string,
  tr: I18n['t'],
): { text: string; className: string } {
  if (t.status === 'FINISHED') return { text: tr('list.relay.finished'), className: 'muted' };
  if (t.holder?.id === meId) return { text: tr('list.relay.you'), className: 'notice-ok' };
  if (t.holder)
    return { text: tr('list.relay.other', { name: t.holder.username }), className: 'muted' };
  return { text: tr('list.relay.nobody'), className: 'muted' };
}

function GroupPicker() {
  const { groups, current, select } = useCurrentGroup();
  const { t, tn } = useI18n();
  if (!current) return null;
  const members = tn('members.count', current.memberCount);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
      {groups.length > 1 ? (
        <>
          <label className="sr-only" htmlFor="group-select">
            {t('list.group')}
          </label>
          <select
            id="group-select"
            className="input"
            style={{ height: 44, fontSize: 17, fontWeight: 600, maxWidth: 240 }}
            value={current.id}
            onChange={(e) => select(e.target.value)}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </>
      ) : (
        <strong style={{ fontSize: 17 }}>{current.name}</strong>
      )}
      <span className="muted" style={{ fontSize: 14 }}>
        {members}
      </span>
    </div>
  );
}

export function Tournaments() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { current, loading, error: groupsError } = useCurrentGroup();
  const readable = current !== undefined && current.myRole !== null;
  const tournaments = useTournaments(readable ? current.id : undefined);
  const meId = user?.id ?? '';

  const offers = (tournaments.data ?? []).filter((tour) => tour.handoverTo?.id === meId);

  return (
    <>
      <header className="topbar" style={{ justifyContent: 'space-between' }}>
        <div className="logo">i-am-in</div>
      </header>
      <div className="page page-wide">
        <GroupPicker />
        <ErrorNote error={groupsError} />
        {loading && (
          <p className="muted" role="status">
            {t('common.loading')}
          </p>
        )}

        {!loading && !current && user?.role === 'GROUP_CREATOR' && (
          <>
            <p className="card">{t('list.creatorHint')}</p>
            <Link className="key key-wide" to="/groupe/nouveau">
              <Icon name="plus" stroke={2.25} />
              {t('list.createGroup')}
            </Link>
          </>
        )}
        {!loading && !current && user?.role === 'PLATFORM_OWNER' && (
          <p className="card">{t('list.ownerHint')}</p>
        )}
        {user?.role === 'PLATFORM_OWNER' && (
          <Link className="key key-wide" to="/apercu">
            <Icon name="chart" stroke={2.25} />
            {t('ov.open')}
          </Link>
        )}
        {!loading && !current && user?.role === 'MEMBER' && (
          <p className="card">{t('list.memberHint')}</p>
        )}
        {current && !readable && <p className="card">{t('list.ownerNoAccess')}</p>}

        {readable &&
          offers.map((tour) => <RelayOffer key={tour.id} groupId={current.id} tournament={tour} />)}

        {readable && (
          <>
            <h1 className="title" style={{ paddingTop: 6 }}>
              {t('list.title')}
            </h1>
            <ErrorNote error={tournaments.error} />
            {tournaments.data?.length === 0 && <p className="muted">{t('list.empty')}</p>}
            <ul className="rows rows-cards">
              {(tournaments.data ?? []).map((tour) => {
                const relay = relayLine(tour, meId, t);
                return (
                  <li key={tour.id}>
                    <Link className="row-link" to={`/tournois/${tour.id}`}>
                      <span className="row-head">
                        <span className="row-name">{tour.name}</span>
                        <span className={STATUS_CLASS[tour.status]}>
                          {t(STATUS_KEY[tour.status])}
                        </span>
                      </span>
                      <span className="muted">{t(FORMAT_KEY[tour.format])}</span>
                      <span className="when-line">
                        <When value={tour.startsAt} />
                      </span>
                      <span className="row-head">
                        <span className="tabular">{countsLine(tour.counts, tour.capacity, t)}</span>
                        <span className={relay.className} style={{ fontSize: 13, fontWeight: 600 }}>
                          {relay.text}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link className="key key-wide" to="/nouveau">
              <Icon name="plus" stroke={2.25} />
              {t('list.new')}
            </Link>
          </>
        )}
      </div>
    </>
  );
}
