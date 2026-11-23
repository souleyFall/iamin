import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { SecurityEvent, SessionInfo } from '../api/types';
import { useI18n } from '../lib/i18n';
import { SECURITY_EVENT_ALERT, SECURITY_EVENT_KEY } from '../lib/labels';
import { ConfirmButton } from './ConfirmButton';
import { ErrorNote } from './ErrorNote';

const SHORT_DATE: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
};

const SESSIONS = ['security', 'sessions'] as const;
const ACTIVITY = ['security', 'activity'] as const;

/** Mes sessions ouvertes : repérer celle qui n'est pas la mienne et la fermer. */
export function SessionsPanel() {
  const { t, date } = useI18n();
  const client = useQueryClient();
  const sessions = useQuery({
    queryKey: SESSIONS,
    queryFn: () => api<SessionInfo[]>('GET', '/auth/sessions'),
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: SESSIONS });
    void client.invalidateQueries({ queryKey: ACTIVITY });
  };
  const close = useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/auth/sessions/${id}`),
    onSuccess: refresh,
  });
  const closeOthers = useMutation({
    mutationFn: () => api<void>('POST', '/auth/sessions/close-others'),
    onSuccess: refresh,
  });
  const others = (sessions.data ?? []).filter((s) => !s.current);

  return (
    <section className="panel" aria-labelledby="sessions-title">
      <h2 id="sessions-title" className="section-title">
        {t('sec.sessions.title')}
      </h2>
      <p className="hint">{t('sec.sessions.hint')}</p>
      <ErrorNote error={sessions.error ?? close.error ?? closeOthers.error} />
      <ul className="rows">
        {(sessions.data ?? []).map((s) => (
          <li key={s.id} className="player-row" style={{ flexWrap: 'wrap' }}>
            <span className="player-name">
              {s.device ?? t('sec.sessions.unknownDevice')}{' '}
              {s.current && <span className="tag tag-ok">{t('sec.sessions.current')}</span>}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              {t('sec.sessions.times', {
                last: date(s.lastSeenAt, SHORT_DATE),
                created: date(s.createdAt, SHORT_DATE),
              })}
            </span>
            {!s.current && (
              <ConfirmButton
                confirmLabel={t('sec.sessions.closeConfirm')}
                onConfirm={() => close.mutate(s.id)}
              >
                {t('sec.sessions.close')}
              </ConfirmButton>
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <ConfirmButton
          confirmLabel={t('sec.sessions.closeOthersConfirm')}
          className="btn"
          onConfirm={() => closeOthers.mutate()}
        >
          {t('sec.sessions.closeOthers')}
        </ConfirmButton>
      )}
    </section>
  );
}

/** Journal de sécurité du compte (30 jours) : connexions, échecs, liens émis, codes de secours… */
export function ActivityPanel() {
  const { t, date } = useI18n();
  const activity = useQuery({
    queryKey: ACTIVITY,
    queryFn: () => api<SecurityEvent[]>('GET', '/auth/activity'),
  });
  return (
    <section className="panel" aria-labelledby="activity-title">
      <h2 id="activity-title" className="section-title">
        {t('sec.activity.title')}
      </h2>
      <p className="hint">{t('sec.activity.hint')}</p>
      <ErrorNote error={activity.error} />
      {activity.data?.length === 0 && <p className="muted">{t('sec.activity.none')}</p>}
      <ul className="rows">
        {(activity.data ?? []).map((e) => (
          <li key={e.id} className="player-row" style={{ flexWrap: 'wrap' }}>
            <span className="player-name">
              {SECURITY_EVENT_ALERT.has(e.type) && (
                <span className="tag tag-bad">{t('sec.activity.check')}</span>
              )}{' '}
              {t(SECURITY_EVENT_KEY[e.type])}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              {date(e.createdAt, SHORT_DATE)}
              {e.device ? ` · ${e.device}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
