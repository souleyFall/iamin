import { Link } from 'react-router-dom';
import { useGroup } from '../api/queries';
import { useAuth } from '../auth/session';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { InvitationManager } from '../components/InvitationManager';
import { initialOf } from '../lib/labels';
import { useCurrentGroup } from '../groups/current';
import { useI18n } from '../lib/i18n';

export function GroupScreen() {
  const { user } = useAuth();
  const { t, tn } = useI18n();
  const { current } = useCurrentGroup();
  const group = useGroup(current?.myRole === null ? undefined : current?.id);

  return (
    <>
      <header className="topbar">
        <h1 className="title" style={{ padding: '4px 4px 0' }}>
          {t('group.title')}
        </h1>
      </header>
      <div className="page page-wide desk-grid">
        <div className="desk-main">
          {!current && (
            <p className="muted">
              {user?.role === 'GROUP_CREATOR' ? t('group.creatorNone') : t('group.none')}
            </p>
          )}
          {current && (
            <p>
              <b style={{ fontSize: 18 }}>{current.name}</b>
              <span className="muted"> · {tn('members.count', current.memberCount)}</span>
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
        </div>
        {current?.myRole === 'SUPER_ADMIN' && (
          <div className="desk-a">
            <InvitationManager
              key={current.id}
              groupId={current.id}
              title={t('group.inviteTitle')}
              createLabel={t('inv.createLink')}
              intro={t('group.inviteIntro')}
            />
          </div>
        )}
        {user?.role === 'GROUP_CREATOR' && (
          <div className="desk-b">
            <Link className="key key-wide" to="/groupe/nouveau">
              <Icon name="plus" stroke={2.25} />
              {t('group.create')}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
