import { useState } from 'react';
import { useGroup } from '../api/queries';
import { ErrorNote } from '../components/ErrorNote';
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
    status = <span className="tag tag-ok">TU AS LA MAIN</span>;
    buttons = handoverTo ? (
      <>
        <span className="muted">Relais proposé à {handoverTo.username}</span>
        <button
          className="btn btn-sm"
          type="button"
          disabled={busy}
          onClick={() => act.mutate({ method: 'DELETE', path: '/relay/offer' })}
        >
          Annuler la proposition
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
          Passer le relais
        </button>
        <button
          className="btn btn-sm"
          type="button"
          disabled={busy}
          onClick={() => post('/relay/release')}
        >
          Rendre la main
        </button>
      </>
    );
  } else if (handoverTo?.id === me.id) {
    status = <span className="tag tag-live">RELAIS PROPOSÉ</span>;
    buttons = (
      <>
        <button
          className="btn btn-sm btn-primary"
          type="button"
          disabled={busy}
          onClick={() => post('/relay/accept')}
        >
          Accepter
        </button>
        <button
          className="btn btn-sm"
          type="button"
          disabled={busy}
          onClick={() => post('/relay/decline')}
        >
          Refuser
        </button>
      </>
    );
  } else if (holder) {
    status = <span className="tag">MAIN : {holder.username}</span>;
    if (groupRole === 'SUPER_ADMIN') {
      buttons = (
        <button
          className="btn btn-sm btn-danger"
          type="button"
          disabled={busy}
          onClick={() => post('/relay/take')}
        >
          Reprendre la main
        </button>
      );
    }
  } else {
    status = <span className="tag">PERSONNE N’A LA MAIN</span>;
    buttons = (
      <button
        className="btn btn-sm btn-primary"
        type="button"
        disabled={busy}
        onClick={() => post('/relay/take')}
      >
        Prendre la main
      </button>
    );
  }

  return (
    <section className="card relay-bar" aria-label="La main sur ce tournoi">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {status}
        {buttons}
      </div>
      {isHolder && choosing && !handoverTo && (
        <div className="field">
          <label htmlFor="relay-target" style={{ fontSize: 16 }}>
            Passer le relais à
          </label>
          <div className="actions">
            <select
              id="relay-target"
              className="input"
              style={{ height: 44, fontSize: 16 }}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choisir un admin</option>
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
              Proposer
            </button>
          </div>
          <p className="hint">Rien ne change avant son accord.</p>
        </div>
      )}
      {!isHolder && (
        <p className="hint">
          Tu peux tout lire, mais seul l’admin qui tient la main peut modifier le tournoi.
        </p>
      )}
      <ErrorNote error={act.error} />
    </section>
  );
}
