import { useState } from 'react';
import { useGroup } from '../api/queries';
import { ErrorNote } from '../components/ErrorNote';
import { useI18n } from '../lib/i18n';
import type { TournamentCtx } from './tournament-context';

/**
 * La main (D5, D17) : un seul admin écrit. Ici : la prendre quand elle est libre, la rendre, la
 * proposer à un autre admin du groupe, répondre à une proposition, ou la reprendre en super admin.
 */
export function RelayBar({
  ctx,
}: {
  ctx: Pick<TournamentCtx, 'groupId' | 'groupRole' | 'tournament' | 'me' | 'isHolder' | 'act'>;
}) {
  const { groupId, groupRole, tournament, me, isHolder, act } = ctx;
  const { t } = useI18n();
  const group = useGroup(groupId);
  const [choosing, setChoosing] = useState(false);
  const [target, setTarget] = useState('');
  const { holder, handoverTo } = tournament;
  const post = (path: string, body?: unknown) => act.mutate({ method: 'POST', path, body });
  const busy = act.isPending;
  const others = (group.data?.members ?? []).filter((m) => m.userId !== me.id);

  let status: React.ReactNode;
  let buttons: React.ReactNode = null;

  if (isHolder) {
    status = <span className="tag tag-ok">{t('relay.youHave')}</span>;
    buttons = handoverTo ? (
      <>
        <span className="muted">{t('relay.offeredTo', { name: handoverTo.username })}</span>
        <button
          className="btn btn-sm"
          type="button"
          disabled={busy}
          onClick={() => act.mutate({ method: 'DELETE', path: '/relay/offer' })}
        >
          {t('relay.cancelOffer')}
        </button>
      </>
    ) : (
      <>
        <button
          className="btn btn-sm"
          type="button"
          disabled={busy || others.length === 0}
          onClick={() => setChoosing((v) => !v)}
        >
          {t('relay.pass')}
        </button>
        <button
          className="btn btn-sm"
          type="button"
          disabled={busy}
          onClick={() => post('/relay/release')}
        >
          {t('relay.release')}
        </button>
      </>
    );
  } else if (handoverTo?.id === me.id) {
    status = <span className="tag tag-live">{t('relay.offeredBadge')}</span>;
    buttons = (
      <>
        <button
          className="btn btn-sm btn-primary"
          type="button"
          disabled={busy}
          onClick={() => post('/relay/accept')}
        >
          {t('relay.accept')}
        </button>
        <button
          className="btn btn-sm"
          type="button"
          disabled={busy}
          onClick={() => post('/relay/decline')}
        >
          {t('relay.decline')}
        </button>
      </>
    );
  } else if (holder) {
    status = <span className="tag">{t('relay.heldBy', { name: holder.username })}</span>;
    if (groupRole === 'SUPER_ADMIN') {
      buttons = (
        <button
          className="btn btn-sm btn-danger"
          type="button"
          disabled={busy}
          onClick={() => post('/relay/take')}
        >
          {t('relay.reclaim')}
        </button>
      );
    }
  } else {
    status = <span className="tag">{t('relay.nobody')}</span>;
    buttons = (
      <button
        className="btn btn-sm btn-primary"
        type="button"
        disabled={busy}
        onClick={() => post('/relay/take')}
      >
        {t('relay.take')}
      </button>
    );
  }

  return (
    <section className="card relay-bar" aria-label={t('relay.region')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {status}
        {buttons}
      </div>
      {isHolder && choosing && !handoverTo && (
        <div className="field">
          <label htmlFor="relay-target" style={{ fontSize: 16 }}>
            {t('relay.passTo')}
          </label>
          <div className="actions">
            <select
              id="relay-target"
              className="input"
              style={{ height: 44, fontSize: 16 }}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">{t('relay.chooseAdmin')}</option>
              {others.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.username}
                </option>
              ))}
            </select>
            <button
              className="btn btn-sm btn-primary"
              type="button"
              disabled={busy || target === ''}
              style={{ flex: 'none' }}
              onClick={() => {
                post('/relay/offer', { toUserId: target });
                setChoosing(false);
                setTarget('');
              }}
            >
              {t('relay.propose')}
            </button>
          </div>
          <p className="hint">{t('relay.nothingChanges')}</p>
        </div>
      )}
      {!isHolder && <p className="hint">{t('relay.readOnly')}</p>}
      <ErrorNote error={act.error} />
    </section>
  );
}
