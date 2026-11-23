import { Link } from 'react-router-dom';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { Lcd } from '../components/Lcd';
import { useI18n } from '../lib/i18n';
import { initialOf, isOpenStatus } from '../lib/labels';
import { useTournamentCtx } from './tournament-context';

/** Le pointage : qui est là ? Seuls les présents sont tirés au sort. */
export function CheckIn() {
  const { tournament, isHolder, act } = useTournamentCtx();
  const { t, tn } = useI18n();
  const open = isOpenStatus(tournament.status);
  const canWrite = isHolder && open;
  const accepted = tournament.registrations.filter((r) => r.status === 'ACCEPTED');
  const present = accepted.filter((r) => r.presence === 'PRESENT').length;
  const absent = accepted.filter((r) => r.presence === 'ABSENT').length;
  const unknown = accepted.length - present - absent;
  const setPresence = (id: string, presence: 'PRESENT' | 'ABSENT' | 'UNKNOWN') =>
    act.mutate({ method: 'PATCH', path: `/registrations/${id}`, body: { presence } });

  const readouts = [
    { value: present, label: tn('check.present', present), color: undefined },
    { value: absent, label: tn('check.absent', absent), color: undefined },
    {
      value: unknown,
      label: t('check.toCheck'),
      color: unknown > 0 ? 'var(--accent)' : undefined,
    },
  ];

  return (
    <div className="page page-wide" style={{ paddingTop: 12 }}>
      <div className="screen" role="group" aria-label={t('check.counters')}>
        {readouts.map((r) => (
          <div className="readout" key={r.label}>
            <Lcd value={r.value} color={r.color} />
            <div className="readout-label">{r.label}</div>
          </div>
        ))}
      </div>

      {tournament.status === 'REGISTRATION' && (
        <div className="card">
          <p>{t('check.openHint')}</p>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!isHolder || act.isPending}
            onClick={() => act.mutate({ method: 'PATCH', path: '', body: { status: 'CHECK_IN' } })}
          >
            {t('check.open')}
          </button>
        </div>
      )}

      {accepted.length === 0 && <p className="muted">{t('check.none')}</p>}
      <ul className="list-cols">
        {accepted.map((r) => (
          <li key={r.id} className="player-row">
            <span className="avatar">{initialOf(r.platoName)}</span>
            <span className="player-name">{r.platoName}</span>
            <div
              className="toggle"
              role="group"
              aria-label={t('check.presenceOf', { name: r.platoName })}
            >
              <button
                type="button"
                className={r.presence === 'PRESENT' ? 'on-ok' : undefined}
                aria-pressed={r.presence === 'PRESENT'}
                disabled={!canWrite || act.isPending}
                onClick={() => setPresence(r.id, r.presence === 'PRESENT' ? 'UNKNOWN' : 'PRESENT')}
              >
                <Icon name="check" size={16} stroke={2.5} />
                {t('check.present')}
              </button>
              <button
                type="button"
                className={r.presence === 'ABSENT' ? 'on-bad' : undefined}
                aria-pressed={r.presence === 'ABSENT'}
                aria-label={t('check.absentAria')}
                disabled={!canWrite || act.isPending}
                onClick={() => setPresence(r.id, r.presence === 'ABSENT' ? 'UNKNOWN' : 'ABSENT')}
              >
                <Icon name="close" size={18} stroke={2.5} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <ErrorNote error={act.error} />

      {tournament.status === 'CHECK_IN' && (
        <>
          <p className="hint" style={{ textAlign: 'center' }}>
            {t('check.drawHint')}
          </p>
          <Link className="key key-wide" to="../tirage">
            {tn('check.validate', present)}
          </Link>
        </>
      )}
    </div>
  );
}
