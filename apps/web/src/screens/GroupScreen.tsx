import { useGroup } from '../api/queries';
import { ErrorNote } from '../components/ErrorNote';
import { initialOf } from '../lib/labels';
import { useCurrentGroup } from '../groups/current';

export function GroupScreen() {
  const { current } = useCurrentGroup();
  const group = useGroup(current?.myRole === null ? undefined : current?.id);

  return (
    <>
      <header className="topbar">
        <h1 className="title" style={{ padding: '4px 4px 0' }}>
          Groupe
        </h1>
      </header>
      <div className="page">
        {!current && <p className="muted">Aucun groupe.</p>}
        {current && (
          <p>
            <b style={{ fontSize: 18 }}>{current.name}</b>
            <span className="muted">
              {' '}
              · {current.memberCount} admin{current.memberCount > 1 ? 's' : ''}
            </span>
          </p>
        )}
        <ErrorNote error={group.error} />
        <ul>
          {(group.data?.members ?? []).map((m) => (
            <li key={m.userId} className="player-row">
              <span className="avatar">{initialOf(m.username)}</span>
              <span className="player-name">{m.username}</span>
              <span className={m.role === 'SUPER_ADMIN' ? 'tag tag-live' : 'tag'}>
                {m.role === 'SUPER_ADMIN' ? 'SUPER ADMIN' : 'ADMIN'}
              </span>
            </li>
          ))}
        </ul>
        <p className="hint">
          Les invitations d’admins se gèrent pour l’instant par l’API ; l’écran arrive dans une
          prochaine version.
        </p>
      </div>
    </>
  );
}
