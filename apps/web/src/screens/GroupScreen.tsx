import { Link } from 'react-router-dom';
import { useGroup } from '../api/queries';
import { useAuth } from '../auth/session';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { InvitationManager } from '../components/InvitationManager';
import { initialOf } from '../lib/labels';
import { useCurrentGroup } from '../groups/current';

export function GroupScreen() {
  const { user } = useAuth();
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
        {!current && (
          <p className="muted">
            {user?.role === 'GROUP_CREATOR' ? 'Tu n’as pas encore de groupe.' : 'Aucun groupe.'}
          </p>
        )}
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
        {current?.myRole === 'SUPER_ADMIN' && (
          <InvitationManager
            key={current.id}
            groupId={current.id}
            title="Inviter un admin"
            createLabel="Créer un lien d’invitation"
            intro="Un admin gère les tournois du groupe. Envoie-lui le lien : il crée son compte, ou rejoint le groupe s’il en a déjà un."
          />
        )}
        {user?.role === 'GROUP_CREATOR' && (
          <Link className="key key-wide" to="/groupe/nouveau">
            <Icon name="plus" stroke={2.25} />
            Créer un groupe
          </Link>
        )}
      </div>
    </>
  );
}
