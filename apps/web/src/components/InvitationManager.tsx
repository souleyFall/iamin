import { useState } from 'react';
import { useInvitations } from '../api/queries';
import { copyText } from '../lib/chat';
import { ConfirmButton } from './ConfirmButton';
import { ErrorNote } from './ErrorNote';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysLeft(expiresAt: string): string {
  const days = Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS));
  return `${days} jour${days > 1 ? 's' : ''}`;
}

/**
 * Créer, copier et annuler des liens d'invitation. Le lien n'est visible qu'à la création : il est
 * stocké haché côté serveur, donc la liste ne peut que dire qu'une invitation attend.
 * `groupId` : invitations d'admins du groupe ; sans lui : invitations de super admins (propriétaire).
 */
export function InvitationManager({
  groupId,
  title,
  createLabel,
  intro,
}: {
  groupId?: string;
  title: string;
  createLabel: string;
  intro: string;
}) {
  const { list, create, revoke } = useInvitations(groupId);
  const [copied, setCopied] = useState<boolean | null>(null);
  const created = create.data;
  const link = created?.url;

  return (
    <section className="panel" aria-labelledby="invite-title">
      <h2 id="invite-title" className="section-title">
        {title}
      </h2>
      <p className="hint">{intro}</p>

      <button
        type="button"
        className="btn btn-accent"
        disabled={create.isPending}
        onClick={() => {
          setCopied(null);
          create.mutate();
        }}
      >
        {createLabel}
      </button>
      <ErrorNote error={create.error} />

      {created && link && (
        <div role="status">
          <p className="notice notice-ok">
            Lien créé. Copie-le maintenant : il ne s’affichera plus. Il sert une seule fois et
            expire dans {daysLeft(created.expiresAt)}.
          </p>
          <code style={{ overflowWrap: 'anywhere' }}>{link}</code>
          <button type="button" className="btn" onClick={() => void copyText(link).then(setCopied)}>
            Copier le lien
          </button>
          {copied === true && <p className="notice notice-ok">Lien copié.</p>}
          {copied === false && (
            <p className="notice notice-bad">
              Copie refusée par le navigateur : sélectionne le lien ci-dessus.
            </p>
          )}
        </div>
      )}

      <ErrorNote error={list.error ?? revoke.error} />
      {list.data && list.data.length > 0 && (
        <>
          <h3 className="section-title" style={{ fontSize: 16 }}>
            En attente · {list.data.length}
          </h3>
          <ul>
            {list.data.map((inv) => (
              <li key={inv.id} className="player-row">
                <span className="player-name">Expire dans {daysLeft(inv.expiresAt)}</span>
                <ConfirmButton
                  confirmLabel="Annuler le lien"
                  onConfirm={() => revoke.mutate(inv.id)}
                  disabled={revoke.isPending}
                >
                  Annuler
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
