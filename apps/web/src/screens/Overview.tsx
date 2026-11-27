import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api/client';
import type {
  Overview as Summary,
  OverviewPerson,
  OverviewTournamentPage,
  PersonKind,
  TournamentFormat,
  TournamentStatus,
} from '../api/types';
import { useAuth } from '../auth/session';
import { ErrorNote } from '../components/ErrorNote';
import { useI18n } from '../lib/i18n';
import { FORMAT_KEY, initialOf, STATUS_CLASS, STATUS_KEY } from '../lib/labels';

const REFRESH_MS = 60_000;
const ONLINE_MS = 15 * 60 * 1000;
const STATUSES: TournamentStatus[] = ['REGISTRATION', 'CHECK_IN', 'STARTED', 'FINISHED'];
type Section = 'tournaments' | 'groups' | 'people';

/**
 * Tableau de bord du propriétaire : des totaux, puis les tournois (filtrables), les groupes et les
 * personnes. Tout est en lecture : aucun bouton ne modifie quoi que ce soit, et les joueurs n'y
 * apparaissent que sous forme de nombres.
 */
export function Overview() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [section, setSection] = useState<Section>('tournaments');
  const query = useQuery({
    queryKey: ['overview', 'summary'],
    queryFn: () => api<Summary>('GET', '/overview'),
    enabled: user?.role === 'PLATFORM_OWNER',
    refetchInterval: REFRESH_MS,
  });
  if (user?.role !== 'PLATFORM_OWNER') return <Navigate to="/" replace />;
  const data = query.data;

  return (
    <>
      <header className="topbar">
        <div className="topbar-title">
          <h1 className="title">{t('ov.title')}</h1>
          <p className="subtitle">{t('ov.readOnly')}</p>
        </div>
      </header>
      <div className="page page-wide">
        <ErrorNote error={query.error} />
        {query.isPending && (
          <p className="muted" role="status">
            {t('common.loading')}
          </p>
        )}
        {data && (
          <>
            <Figures data={data} />
            <div className="segmented" role="group" aria-label={t('ov.sections')}>
              {(['tournaments', 'groups', 'people'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={section === s}
                  onClick={() => setSection(s)}
                >
                  {t(`ov.tab.${s}`)}
                </button>
              ))}
            </div>
            {section === 'tournaments' && <Tournaments data={data} />}
            {section === 'groups' && <Groups data={data} />}
            {section === 'people' && <People data={data} />}
          </>
        )}
      </div>
    </>
  );
}

function Figures({ data }: { data: Summary }) {
  const { t } = useI18n();
  const tiles = [
    { label: t('ov.groups'), value: data.groups.length, note: null },
    {
      label: t('ov.superAdmins'),
      value: data.accounts.superAdmins,
      note: t('ov.accountsNote', { n: data.accounts.total }),
    },
    { label: t('ov.admins'), value: data.accounts.admins, note: null },
    {
      label: t('ov.active'),
      value: data.active.week,
      note: t('ov.activeNote', { online: data.active.online, month: data.active.month }),
    },
    {
      label: t('ov.tournaments'),
      value: data.tournaments.total,
      note: t('ov.tournamentsNote', {
        running: data.tournaments.STARTED,
        finished: data.tournaments.FINISHED,
      }),
    },
    {
      label: t('ov.registrations'),
      value: data.registrations.total,
      note: t('ov.registrationsNote', { players: data.registrations.players }),
    },
  ];
  return (
    <section aria-label={t('ov.figures')}>
      <dl className="stat-grid">
        {tiles.map((tile) => (
          <div className="stat" key={tile.label}>
            <dt>{tile.label}</dt>
            <dd className="stat-value tabular">{tile.value}</dd>
            {tile.note && <dd className="stat-note">{tile.note}</dd>}
          </div>
        ))}
      </dl>
      <p className="hint">
        {t('ov.breakdown', {
          accepted: data.registrations.accepted,
          waitlist: data.registrations.waitlist,
          pending: data.registrations.pending,
        })}
      </p>
      <p className="hint">{t('ov.activeHelp')}</p>
    </section>
  );
}

function Tournaments({ data }: { data: Summary }) {
  const { t, date } = useI18n();
  const [status, setStatus] = useState<TournamentStatus | ''>('');
  const [groupId, setGroupId] = useState('');
  const [format, setFormat] = useState<TournamentFormat | ''>('');
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  // La recherche part 300 ms après la dernière frappe : pas un appel par lettre.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(timer);
  }, [typed]);

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (groupId) params.set('groupId', groupId);
  if (format) params.set('format', format);
  if (search) params.set('q', search);
  const filters = params.toString();

  const list = useInfiniteQuery({
    queryKey: ['overview', 'tournaments', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(filters);
      if (pageParam) p.set('before', pageParam);
      const qs = p.toString();
      return api<OverviewTournamentPage>('GET', `/overview/tournaments${qs ? `?${qs}` : ''}`);
    },
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    refetchInterval: REFRESH_MS,
  });
  const rows = (list.data?.pages ?? []).flatMap((p) => p.tournaments);
  const total = list.data?.pages[0]?.total;

  return (
    <section aria-label={t('ov.tab.tournaments')}>
      <div className="chips" role="group" aria-label={t('ov.filter.status')}>
        <button type="button" aria-pressed={status === ''} onClick={() => setStatus('')}>
          {t('ov.filter.all')} <span className="chip-count">{data.tournaments.total}</span>
        </button>
        {STATUSES.map((s) => (
          <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>
            {t(`ov.filter.${s}`)} <span className="chip-count">{data.tournaments[s]}</span>
          </button>
        ))}
      </div>
      <div className="filter-bar">
        <label className="filter">
          <span>{t('ov.filter.search')}</span>
          <input
            className="input"
            type="search"
            maxLength={80}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
        <label className="filter">
          <span>{t('ov.filter.group')}</span>
          <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">{t('ov.filter.allGroups')}</option>
            {data.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="filter">
          <span>{t('ov.filter.format')}</span>
          <select
            className="input"
            value={format}
            onChange={(e) => setFormat(e.target.value as TournamentFormat | '')}
          >
            <option value="">{t('ov.filter.allFormats')}</option>
            <option value="ELIMINATION">{t('format.elimination')}</option>
            <option value="LEAGUE">{t('format.league')}</option>
          </select>
        </label>
      </div>
      <ErrorNote error={list.error} />
      {total !== undefined && (
        <p className="muted" role="status">
          {t('ov.count', { n: total })}
        </p>
      )}
      {total === 0 && <p className="muted">{t('ov.noTournament')}</p>}
      <ul className="rows rows-cards">
        {rows.map((tour) => (
          <li key={tour.id} className="ov-card">
            <span className="row-head">
              <span className="row-name">{tour.name}</span>
              <span className={STATUS_CLASS[tour.status]}>{t(STATUS_KEY[tour.status])}</span>
            </span>
            <span className="muted">
              {tour.group.name} · {t(FORMAT_KEY[tour.format])}
            </span>
            <span className="tabular">
              {t('ov.places', { n: tour.counts.accepted, capacity: tour.capacity })}
              {tour.counts.waitlist > 0 && ` · ${t('ov.waiting', { n: tour.counts.waitlist })}`}
              {tour.counts.pending > 0 && ` · ${t('ov.toApprove', { n: tour.counts.pending })}`}
            </span>
            <span className="muted ov-small">
              {tour.holder ? t('ov.holder', { name: tour.holder }) : t('ov.noHolder')} ·{' '}
              {t('ov.createdOn', {
                date: date(tour.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }),
              })}
            </span>
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <button
          type="button"
          className="btn"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {t('ov.more')}
        </button>
      )}
    </section>
  );
}

function Groups({ data }: { data: Summary }) {
  const { t } = useI18n();
  const names = (list: { username: string }[]) =>
    list.length === 0 ? t('ov.noAdmin') : list.map((p) => p.username).join(', ');
  return (
    <section aria-label={t('ov.tab.groups')}>
      {data.groups.length === 0 && <p className="muted">{t('ov.noGroup')}</p>}
      <ul className="rows rows-cards">
        {data.groups.map((g) => (
          <li key={g.id} className="ov-card">
            <span className="row-name">{g.name}</span>
            <span>
              <b>{t('ov.superAdmins')} :</b> {names(g.superAdmins)}
            </span>
            <span>
              <b>{t('ov.admins')} :</b> {names(g.admins)}
            </span>
            <span className="muted ov-small tabular">
              {t('ov.groupLine', {
                total: g.tournaments.total,
                running: g.tournaments.running,
                finished: g.tournaments.finished,
                registrations: g.registrations,
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function People({ data }: { data: Summary }) {
  const { t, date } = useI18n();
  const [kind, setKind] = useState<PersonKind | ''>('');
  const shown = data.people.filter((p) => kind === '' || p.kind === kind);
  // « En ligne » se juge à l'heure du serveur au moment du relevé, pas à celle de l'ordinateur.
  const seenAt = new Date(data.generatedAt).getTime();
  const activity = (p: OverviewPerson) => {
    if (p.lastActiveAt === null) return t('ov.people.inactive');
    if (seenAt - new Date(p.lastActiveAt).getTime() <= ONLINE_MS) return t('ov.people.online');
    return t('ov.people.lastSeen', {
      date: date(p.lastActiveAt, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
  };
  const count = (k: PersonKind) => data.people.filter((p) => p.kind === k).length;
  return (
    <section aria-label={t('ov.tab.people')}>
      <div className="chips" role="group" aria-label={t('ov.tab.people')}>
        <button type="button" aria-pressed={kind === ''} onClick={() => setKind('')}>
          {t('ov.people.all')} <span className="chip-count">{data.people.length}</span>
        </button>
        {(['SUPER_ADMIN', 'ADMIN', 'NONE'] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(`ov.people.kind.${k}`)} <span className="chip-count">{count(k)}</span>
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="muted">{t('ov.people.empty')}</p>}
      <ul>
        {shown.map((p) => (
          <li key={p.id} className="player-row" style={{ alignItems: 'flex-start' }}>
            <span className="avatar" aria-hidden="true">
              {initialOf(p.username)}
            </span>
            <div className="ov-person">
              <span className="row-head">
                <span className="player-name">{p.username}</span>
                <span className="tag">{t(`ov.people.kind.${p.kind}`)}</span>
              </span>
              <span className="muted ov-small">
                {t('ov.people.plato', { name: p.platoUsername })}
                {p.groups.length > 0 && ` · ${p.groups.map((g) => g.name).join(', ')}`}
              </span>
              <span className="muted ov-small">{activity(p)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
