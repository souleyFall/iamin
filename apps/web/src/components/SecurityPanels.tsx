import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { SecurityEvent, SessionInfo } from '../api/types';
import { SECURITY_EVENT_ALERT, SECURITY_EVENT_LABEL } from '../lib/labels';
import { ConfirmButton } from './ConfirmButton';
import { ErrorNote } from './ErrorNote';

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const SESSIONS = ['security', 'sessions'] as const;
const ACTIVITY = ['security', 'activity'] as const;

/** Mes sessions ouvertes : repérer celle qui n'est pas la mienne et la fermer. */
export function SessionsPanel() {
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
        Sessions ouvertes
      </h2>
      <p className="hint">
        Une session que tu ne reconnais pas ? Ferme-la, puis change ton mot de passe.
      </p>
      <ErrorNote error={sessions.error ?? close.error ?? closeOthers.error} />
      <ul className="rows">
        {(sessions.data ?? []).map((s) => (
          <li key={s.id} className="player-row" style={{ flexWrap: 'wrap' }}>
            <span className="player-name">
              {s.device ?? 'Appareil inconnu'}{' '}
              {s.current && <span className="tag tag-ok">CETTE SESSION</span>}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              Active {when(s.lastSeenAt)} · ouverte {when(s.createdAt)}
            </span>
            {!s.current && (
              <ConfirmButton confirmLabel="Fermer la session" onConfirm={() => close.mutate(s.id)}>
                Fermer
              </ConfirmButton>
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <ConfirmButton
          confirmLabel="Fermer toutes les autres"
          className="btn"
          onConfirm={() => closeOthers.mutate()}
        >
          Fermer toutes les autres sessions
        </ConfirmButton>
      )}
    </section>
  );
}

/** Journal de sécurité du compte (30 jours) : connexions, échecs, liens émis, codes de secours… */
export function ActivityPanel() {
  const activity = useQuery({
    queryKey: ACTIVITY,
    queryFn: () => api<SecurityEvent[]>('GET', '/auth/activity'),
  });
  return (
    <section className="panel" aria-labelledby="activity-title">
      <h2 id="activity-title" className="section-title">
        Activité récente
      </h2>
      <p className="hint">
        Les 30 derniers jours. Ni adresse IP ni détail de ton navigateur : seulement le type
        d’appareil.
      </p>
      <ErrorNote error={activity.error} />
      {activity.data?.length === 0 && <p className="muted">Rien à signaler.</p>}
      <ul className="rows">
        {(activity.data ?? []).map((e) => (
          <li key={e.id} className="player-row" style={{ flexWrap: 'wrap' }}>
            <span className="player-name">
              {SECURITY_EVENT_ALERT.has(e.type) && <span className="tag tag-bad">À VÉRIFIER</span>}{' '}
              {SECURITY_EVENT_LABEL[e.type]}
            </span>
            <span className="muted" style={{ fontSize: 13 }}>
              {when(e.createdAt)}
              {e.device ? ` · ${e.device}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
