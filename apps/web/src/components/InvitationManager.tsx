import { useState, type FormEvent } from 'react';
import { useInvitations } from '../api/queries';
import { copyText } from '../lib/chat';
import { useI18n } from '../lib/i18n';
import { ConfirmButton } from './ConfirmButton';
import { ErrorNote } from './ErrorNote';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Jours restants, au moins 1 (une invitation encore valable n'affiche jamais « 0 jour »). */
const daysOf = (expiresAt: string): number =>
  Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / DAY_MS));

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
  pseudoRequired = false,
  locked = false,
}: {
  groupId?: string;
  title: string;
  createLabel: string;
  intro: string;
  /** Super admins : le pseudo Plato de la personne invitée est obligatoire (il lui sera imposé). */
  pseudoRequired?: boolean;
  /** Actions désactivées (ressaisie du code demandée avant). */
  locked?: boolean;
}) {
  const { t, tn } = useI18n();
  const { list, create, revoke } = useInvitations(groupId);
  const daysLeft = (expiresAt: string) => tn('inv.days', daysOf(expiresAt));
  const [copied, setCopied] = useState<boolean | null>(null);
  const [pseudo, setPseudo] = useState('');
  const created = create.data;
  const link = created?.url;

  return (
    <section className="panel" aria-labelledby="invite-title">
      <h2 id="invite-title" className="section-title">
        {title}
      </h2>
      <p className="hint">{intro}</p>

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setCopied(null);
          create.mutate(pseudo.trim() === '' ? undefined : pseudo.trim(), {
            onSuccess: () => setPseudo(''),
          });
        }}
      >
        <div className="field">
          <label htmlFor="invite-pseudo">
            {t('inv.pseudo')}
            {pseudoRequired ? '' : t('inv.optional')}
          </label>
          <input
            id="invite-pseudo"
            className="input"
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
            maxLength={64}
            required={pseudoRequired}
          />
          <p className="hint">{t('inv.pseudoHint')}</p>
        </div>
        <button type="submit" className="btn btn-accent" disabled={create.isPending || locked}>
          {createLabel}
        </button>
      </form>
      <ErrorNote error={create.error} />

      {created && link && (
        <div role="status">
          <p className="notice notice-ok">
            {t('inv.created', { days: daysLeft(created.expiresAt) })}
          </p>
          <code style={{ overflowWrap: 'anywhere' }}>{link}</code>
          <button type="button" className="btn" onClick={() => void copyText(link).then(setCopied)}>
            {t('inv.copy')}
          </button>
          {copied === true && <p className="notice notice-ok">{t('inv.copied')}</p>}
          {copied === false && <p className="notice notice-bad">{t('inv.copyRefused')}</p>}
        </div>
      )}

      <ErrorNote error={list.error ?? revoke.error} />
      {list.data && list.data.length > 0 && (
        <>
          <h3 className="section-title" style={{ fontSize: 16 }}>
            {t('inv.pending', { n: list.data.length })}
          </h3>
          <ul>
            {list.data.map((inv) => (
              <li key={inv.id} className="player-row">
                <span className="player-name">{inv.platoUsername ?? t('inv.freePseudo')}</span>
                <span className="muted">{t('inv.expires', { days: daysLeft(inv.expiresAt) })}</span>
                <ConfirmButton
                  confirmLabel={t('inv.cancelLink')}
                  onConfirm={() => revoke.mutate(inv.id)}
                  disabled={revoke.isPending || locked}
                >
                  {t('common.cancel')}
                </ConfirmButton>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
