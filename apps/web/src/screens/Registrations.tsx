import { useState, type FormEvent } from 'react';
import type { Registration } from '../api/types';
import { ConfirmButton } from '../components/ConfirmButton';
import { ErrorNote } from '../components/ErrorNote';
import { copyText } from '../lib/chat';
import { initialOf, isOpenStatus } from '../lib/labels';
import { useTournamentCtx } from './tournament-context';

/** Le lien à donner aux joueurs : inscription, puis suivi en direct. */
function ShareLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const url = `${window.location.origin}/t/${slug}`;
  return (
    <div className="panel desk-a">
      <h2 className="section-title">Lien pour les joueurs</h2>
      <code style={{ overflowWrap: 'anywhere' }}>{url}</code>
      <button
        type="button"
        className="btn btn-accent"
        onClick={() => void copyText(url).then(setCopied)}
      >
        Copier le lien
      </button>
      {copied === true && (
        <p className="notice notice-ok" role="status">
          Lien copié.
        </p>
      )}
      {copied === false && (
        <p className="notice notice-bad" role="status">
          Copie refusée par le navigateur : sélectionne le lien ci-dessus.
        </p>
      )}
    </div>
  );
}

export function Registrations() {
  const { tournament, isHolder, act } = useTournamentCtx();
  const [name, setName] = useState('');
  const open = isOpenStatus(tournament.status);
  const canWrite = isHolder && open;
  const by = (s: string): Registration[] => tournament.registrations.filter((r) => r.status === s);
  const pending = by('PENDING');
  const accepted = by('ACCEPTED');
  const waitlist = by('WAITLIST');
  const remove = (id: string) => act.mutate({ method: 'DELETE', path: `/registrations/${id}` });

  function add(event: FormEvent) {
    event.preventDefault();
    act.mutate(
      { method: 'POST', path: '/registrations', body: { name: name.trim() } },
      { onSuccess: () => setName('') },
    );
  }

  return (
    <div className="page page-wide desk-grid" style={{ paddingTop: 12 }}>
      <ShareLink slug={tournament.publicSlug} />

      <div className="desk-main">
        {!open && <p className="card">Le tirage est fait : la liste des joueurs est figée.</p>}
        <section aria-labelledby="pending-title">
          <h2 id="pending-title" className="section-title">
            À valider · {pending.length}
          </h2>
          {pending.length === 0 && <p className="muted">Aucune inscription en attente.</p>}
          <ul>
            {pending.map((r) => (
              <li key={r.id} className="player-row">
                <span className="avatar">{initialOf(r.platoName)}</span>
                <span className="player-name">{r.platoName}</span>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canWrite || act.isPending}
                  aria-label={`Valider ${r.platoName}`}
                  onClick={() =>
                    act.mutate({ method: 'POST', path: `/registrations/${r.id}/accept` })
                  }
                >
                  Valider
                </button>
                <ConfirmButton
                  confirmLabel="Refuser"
                  disabled={!canWrite || act.isPending}
                  onConfirm={() => remove(r.id)}
                >
                  Refuser
                </ConfirmButton>
              </li>
            ))}
          </ul>
          <p className="hint">
            Compare le pseudo avec Plato avant de valider : c’est ta seule vérification.
          </p>
        </section>

        <section aria-labelledby="accepted-title">
          <h2 id="accepted-title" className="section-title">
            Inscrits · {accepted.length} / {tournament.capacity}
          </h2>
          <ul>
            {accepted.map((r) => (
              <li key={r.id} className="player-row">
                <span className="avatar">{initialOf(r.platoName)}</span>
                <span className="player-name">{r.platoName}</span>
                {open && (
                  <ConfirmButton
                    confirmLabel="Retirer"
                    disabled={!canWrite || act.isPending}
                    onConfirm={() => remove(r.id)}
                  >
                    Retirer
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        </section>

        {waitlist.length > 0 && (
          <section aria-labelledby="waitlist-title">
            <h2 id="waitlist-title" className="section-title">
              Liste d’attente · {waitlist.length}
            </h2>
            <ul>
              {waitlist.map((r, i) => (
                <li key={r.id} className="player-row">
                  <span className="avatar">{i + 1}</span>
                  <span className="player-name">{r.platoName}</span>
                  {open && (
                    <ConfirmButton
                      confirmLabel="Retirer"
                      disabled={!canWrite || act.isPending}
                      onConfirm={() => remove(r.id)}
                    >
                      Retirer
                    </ConfirmButton>
                  )}
                </li>
              ))}
            </ul>
            <p className="hint">Le premier passe inscrit dès qu’une place se libère.</p>
          </section>
        )}
      </div>

      {canWrite && (
        <form className="panel desk-b" onSubmit={add}>
          <div className="field">
            <label htmlFor="add-player">Ajouter un joueur</label>
            <input
              id="add-player"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pseudo Plato"
              autoComplete="off"
              maxLength={40}
            />
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={act.isPending || name.trim() === ''}
          >
            Ajouter
          </button>
        </form>
      )}
      <ErrorNote error={act.error} />
    </div>
  );
}
