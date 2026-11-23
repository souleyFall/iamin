import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useFeedbackInbox } from '../api/queries';
import type { FeedbackStatus } from '../api/types';
import { useAuth } from '../auth/session';
import { ConfirmButton } from '../components/ConfirmButton';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { FEEDBACK_KIND_LABEL, FEEDBACK_STATUS_LABEL } from '../lib/labels';

const FILTERS: { value: FeedbackStatus | 'ALL'; label: string }[] = [
  { value: 'NEW', label: 'Nouveaux' },
  { value: 'READ', label: 'Lus' },
  { value: 'DONE', label: 'Traités' },
  { value: 'ALL', label: 'Tous' },
];

const STATUS_CLASS = { NEW: 'tag tag-live', READ: 'tag', DONE: 'tag tag-ok' } as const;

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** Boîte de réception du propriétaire : lire, classer et supprimer les retours des utilisateurs. */
export function FeedbackInbox() {
  const { user } = useAuth();
  // Aucune requête pour un autre compte : l'API la refuserait de toute façon.
  if (user?.role !== 'PLATFORM_OWNER') return <Navigate to="/" replace />;
  return <Inbox />;
}

function Inbox() {
  const [filter, setFilter] = useState<FeedbackStatus | 'ALL'>('NEW');
  const { list, setStatus, remove, purge } = useFeedbackInbox(filter);
  return (
    <>
      <header className="topbar">
        <Link className="icon-btn flat" to="/moi" aria-label="Retour">
          <Icon name="back" size={24} />
        </Link>
        <h1 className="title">Retours</h1>
      </header>
      <div className="page">
        <div className="segmented" role="group" aria-label="Filtrer par statut">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <ErrorNote error={list.error ?? setStatus.error ?? remove.error ?? purge.error} />
        {list.data?.length === 0 && <p className="muted">Aucun retour dans cette catégorie.</p>}

        <ul className="rows">
          {(list.data ?? []).map((f) => (
            <li key={f.id} className="card" style={{ display: 'grid', gap: 8 }}>
              <span className="row-head">
                <b>{FEEDBACK_KIND_LABEL[f.kind]}</b>
                <span className={STATUS_CLASS[f.status]}>{FEEDBACK_STATUS_LABEL[f.status]}</span>
              </span>
              {/* Texte libre d'un inconnu : affiché comme du texte (React échappe), retours à la ligne gardés. */}
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>
                {f.message}
              </p>
              <span className="muted" style={{ fontSize: 13 }}>
                {f.author
                  ? `Admin ${f.author.username}`
                  : f.contact
                    ? `Joueur · ${f.contact}`
                    : 'Joueur anonyme'}{' '}
                · {date(f.createdAt)}
              </span>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {f.status !== 'READ' && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setStatus.mutate({ id: f.id, status: 'READ' })}
                  >
                    Marquer comme lu
                  </button>
                )}
                {f.status !== 'DONE' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-accent"
                    onClick={() => setStatus.mutate({ id: f.id, status: 'DONE' })}
                  >
                    Marquer comme traité
                  </button>
                )}
                {f.status !== 'NEW' && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setStatus.mutate({ id: f.id, status: 'NEW' })}
                  >
                    Remettre en nouveau
                  </button>
                )}
                <ConfirmButton
                  confirmLabel="Supprimer pour de bon"
                  onConfirm={() => remove.mutate(f.id)}
                >
                  Supprimer
                </ConfirmButton>
              </span>
            </li>
          ))}
        </ul>

        <section className="panel">
          <h2 className="section-title">Nettoyage</h2>
          <p className="hint">
            Les retours traités depuis plus d’un an sont à supprimer (registre RGPD, traitement 6).
          </p>
          <ConfirmButton
            confirmLabel="Purger maintenant"
            className="btn"
            onConfirm={() => purge.mutate()}
          >
            Purger les retours traités depuis plus d’un an
          </ConfirmButton>
          {purge.data && (
            <p className="notice notice-ok" role="status">
              {purge.data.deleted} retour{purge.data.deleted > 1 ? 's' : ''} supprimé
              {purge.data.deleted > 1 ? 's' : ''}.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
