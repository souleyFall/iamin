import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useFeedbackInbox } from '../api/queries';
import type { FeedbackStatus } from '../api/types';
import { useAuth } from '../auth/session';
import { ConfirmButton } from '../components/ConfirmButton';
import { ElevationPrompt, useElevated } from '../components/Elevation';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { useI18n } from '../lib/i18n';
import type { MessageKey } from '../lib/i18n/messages';
import { FEEDBACK_KIND_KEY, FEEDBACK_STATUS_KEY } from '../lib/labels';

const FILTERS: { value: FeedbackStatus | 'ALL'; label: MessageKey }[] = [
  { value: 'NEW', label: 'fb.inbox.new' },
  { value: 'READ', label: 'fb.inbox.read' },
  { value: 'DONE', label: 'fb.inbox.done' },
  { value: 'ALL', label: 'fb.inbox.all' },
];

const STATUS_CLASS = { NEW: 'tag tag-live', READ: 'tag', DONE: 'tag tag-ok' } as const;

/** Boîte de réception du propriétaire : lire, classer et supprimer les retours des utilisateurs. */
export function FeedbackInbox() {
  const { user } = useAuth();
  // Aucune requête pour un autre compte : l'API la refuserait de toute façon.
  if (user?.role !== 'PLATFORM_OWNER') return <Navigate to="/" replace />;
  return <Inbox />;
}

function Inbox() {
  const { t, tn, date } = useI18n();
  const [filter, setFilter] = useState<FeedbackStatus | 'ALL'>('NEW');
  const { list, setStatus, remove, purge } = useFeedbackInbox(filter);
  const elevated = useElevated();
  return (
    <>
      <header className="topbar">
        <Link className="icon-btn flat" to="/moi" aria-label={t('common.back')}>
          <Icon name="back" size={24} />
        </Link>
        <h1 className="title">{t('fb.inbox.title')}</h1>
      </header>
      <div className="page page-wide">
        <ElevationPrompt reason={t('fb.inbox.reason')} />
        <div className="segmented" role="group" aria-label={t('fb.inbox.filter')}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {t(f.label)}
            </button>
          ))}
        </div>

        <ErrorNote error={list.error ?? setStatus.error ?? remove.error ?? purge.error} />
        {list.data?.length === 0 && <p className="muted">{t('fb.inbox.empty')}</p>}

        <ul className="rows cards-grid">
          {(list.data ?? []).map((f) => (
            <li key={f.id} className="card" style={{ display: 'grid', gap: 8 }}>
              <span className="row-head">
                <b>{t(FEEDBACK_KIND_KEY[f.kind])}</b>
                <span className={STATUS_CLASS[f.status]}>{t(FEEDBACK_STATUS_KEY[f.status])}</span>
              </span>
              {/* Texte libre d'un inconnu : affiché comme du texte (React échappe), retours à la ligne gardés. */}
              <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0 }}>
                {f.message}
              </p>
              <span className="muted" style={{ fontSize: 13 }}>
                {f.author
                  ? t('fb.inbox.fromAdmin', { name: f.author.username })
                  : f.contact
                    ? t('fb.inbox.fromPlayer', { name: f.contact })
                    : t('fb.inbox.fromAnon')}{' '}
                · {date(f.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {f.status !== 'READ' && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setStatus.mutate({ id: f.id, status: 'READ' })}
                  >
                    {t('fb.inbox.markRead')}
                  </button>
                )}
                {f.status !== 'DONE' && (
                  <button
                    type="button"
                    className="btn btn-sm btn-accent"
                    onClick={() => setStatus.mutate({ id: f.id, status: 'DONE' })}
                  >
                    {t('fb.inbox.markDone')}
                  </button>
                )}
                {f.status !== 'NEW' && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setStatus.mutate({ id: f.id, status: 'NEW' })}
                  >
                    {t('fb.inbox.markNew')}
                  </button>
                )}
                <ConfirmButton
                  confirmLabel={t('fb.inbox.deleteConfirm')}
                  disabled={!elevated}
                  onConfirm={() => remove.mutate(f.id)}
                >
                  {t('common.delete')}
                </ConfirmButton>
              </span>
            </li>
          ))}
        </ul>

        <section className="panel">
          <h2 className="section-title">{t('fb.inbox.cleanTitle')}</h2>
          <p className="hint">{t('fb.inbox.cleanHint')}</p>
          <ConfirmButton
            confirmLabel={t('fb.inbox.purgeConfirm')}
            className="btn"
            disabled={!elevated}
            onConfirm={() => purge.mutate()}
          >
            {t('fb.inbox.purge')}
          </ConfirmButton>
          {purge.data && (
            <p className="notice notice-ok" role="status">
              {tn('fb.inbox.purged', purge.data.deleted)}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
