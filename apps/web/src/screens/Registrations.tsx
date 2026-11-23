import { useState, type FormEvent } from 'react';
import type { Registration, TournamentLanguage } from '../api/types';
import { ConfirmButton } from '../components/ConfirmButton';
import { ErrorNote } from '../components/ErrorNote';
import { copyText } from '../lib/chat';
import { LOCALES, useI18n } from '../lib/i18n';
import { initialOf, isOpenStatus } from '../lib/labels';
import { useTournamentCtx } from './tournament-context';

/** Le lien à donner aux joueurs : inscription, puis suivi en direct. */
function ShareLink({
  slug,
  language,
  canChange,
  onLanguage,
}: {
  slug: string;
  language: TournamentLanguage;
  canChange: boolean;
  onLanguage: (language: TournamentLanguage) => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<boolean | null>(null);
  const url = `${window.location.origin}/t/${slug}`;
  return (
    <div className="panel desk-a">
      <h2 className="section-title">{t('reg.shareTitle')}</h2>
      <code style={{ overflowWrap: 'anywhere' }}>{url}</code>
      <button
        type="button"
        className="btn btn-accent"
        onClick={() => void copyText(url).then(setCopied)}
      >
        {t('reg.copyLink')}
      </button>
      {copied === true && (
        <p className="notice notice-ok" role="status">
          {t('reg.linkCopied')}
        </p>
      )}
      {copied === false && (
        <p className="notice notice-bad" role="status">
          {t('reg.copyRefused')}
        </p>
      )}
      <div className="field">
        <span className="section-title" style={{ fontSize: 18 }}>
          {t('lang.label')}
        </span>
        <div className="segmented" role="group" aria-label={t('lang.label')}>
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              lang={l.code}
              aria-pressed={language === l.code}
              disabled={!canChange}
              onClick={() => onLanguage(l.code)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="hint">{t('lang.hint')}</p>
      </div>
    </div>
  );
}

export function Registrations() {
  const { tournament, isHolder, act } = useTournamentCtx();
  const { t } = useI18n();
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
      <ShareLink
        slug={tournament.publicSlug}
        language={tournament.language}
        canChange={isHolder}
        onLanguage={(language) => act.mutate({ method: 'PATCH', path: '', body: { language } })}
      />

      <div className="desk-main">
        {!open && <p className="card">{t('reg.frozen')}</p>}
        <section aria-labelledby="pending-title">
          <h2 id="pending-title" className="section-title">
            {t('reg.pendingTitle', { n: pending.length })}
          </h2>
          {pending.length === 0 && <p className="muted">{t('reg.pendingNone')}</p>}
          <ul>
            {pending.map((r) => (
              <li key={r.id} className="player-row">
                <span className="avatar">{initialOf(r.platoName)}</span>
                <span className="player-name">{r.platoName}</span>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!canWrite || act.isPending}
                  aria-label={t('reg.approveAria', { name: r.platoName })}
                  onClick={() =>
                    act.mutate({ method: 'POST', path: `/registrations/${r.id}/accept` })
                  }
                >
                  {t('reg.approve')}
                </button>
                <ConfirmButton
                  confirmLabel={t('reg.refuse')}
                  disabled={!canWrite || act.isPending}
                  onConfirm={() => remove(r.id)}
                >
                  {t('reg.refuse')}
                </ConfirmButton>
              </li>
            ))}
          </ul>
          <p className="hint">{t('reg.comparePlato')}</p>
        </section>

        <section aria-labelledby="accepted-title">
          <h2 id="accepted-title" className="section-title">
            {t('reg.acceptedTitle', { n: accepted.length, cap: tournament.capacity })}
          </h2>
          <ul>
            {accepted.map((r) => (
              <li key={r.id} className="player-row">
                <span className="avatar">{initialOf(r.platoName)}</span>
                <span className="player-name">{r.platoName}</span>
                {open && (
                  <ConfirmButton
                    confirmLabel={t('reg.remove')}
                    disabled={!canWrite || act.isPending}
                    onConfirm={() => remove(r.id)}
                  >
                    {t('reg.remove')}
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        </section>

        {waitlist.length > 0 && (
          <section aria-labelledby="waitlist-title">
            <h2 id="waitlist-title" className="section-title">
              {t('reg.waitlistTitle', { n: waitlist.length })}
            </h2>
            <ul>
              {waitlist.map((r, i) => (
                <li key={r.id} className="player-row">
                  <span className="avatar">{i + 1}</span>
                  <span className="player-name">{r.platoName}</span>
                  {open && (
                    <ConfirmButton
                      confirmLabel={t('reg.remove')}
                      disabled={!canWrite || act.isPending}
                      onConfirm={() => remove(r.id)}
                    >
                      {t('reg.remove')}
                    </ConfirmButton>
                  )}
                </li>
              ))}
            </ul>
            <p className="hint">{t('reg.waitlistHint')}</p>
          </section>
        )}
      </div>

      {canWrite && (
        <form className="panel desk-b" onSubmit={add}>
          <div className="field">
            <label htmlFor="add-player">{t('reg.addTitle')}</label>
            <input
              id="add-player"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('reg.addPlaceholder')}
              autoComplete="off"
              maxLength={40}
            />
          </div>
          <button
            className="btn btn-primary"
            type="submit"
            disabled={act.isPending || name.trim() === ''}
          >
            {t('reg.add')}
          </button>
        </form>
      )}
      <ErrorNote error={act.error} />
    </div>
  );
}
