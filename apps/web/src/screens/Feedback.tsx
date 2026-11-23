import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useSendFeedback } from '../api/queries';
import type { FeedbackKind } from '../api/types';
import { useAuth } from '../auth/session';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { useI18n } from '../lib/i18n';
import { FEEDBACK_KIND_KEY } from '../lib/labels';

const KINDS: FeedbackKind[] = ['IDEA', 'IMPROVEMENT', 'BUG', 'OTHER'];
const MAX = 2000;

/**
 * Donner son avis : proposer une fonctionnalité, une amélioration, signaler un bug. Ouvert à tous :
 * un admin connecté écrit avec son compte, un joueur sans compte écrit anonymement et peut laisser
 * son pseudo Plato s'il veut une réponse. Seul le propriétaire de la plateforme lit les retours.
 */
export function Feedback() {
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const signedIn = Boolean(user);
  const send = useSendFeedback(signedIn);
  const [kind, setKind] = useState<FeedbackKind>('IDEA');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const fieldError = send.error instanceof ApiError ? send.error.fields : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = contact.trim();
    send.mutate({
      kind,
      message: message.trim(),
      ...(!signedIn && text !== '' ? { contact: text } : {}),
    });
  }

  const back = (
    <button
      type="button"
      className="icon-btn flat"
      aria-label={t('common.back')}
      onClick={() => void navigate(-1)}
    >
      <Icon name="back" size={24} />
    </button>
  );

  if (send.isSuccess) {
    return (
      <main className="login">
        <div className="logo">i-am-in</div>
        <section className="panel" role="status">
          <h1 className="section-title">{t('fb.thanks')}</h1>
          <p>{t('fb.received')}</p>
          <button type="button" className="btn" onClick={() => void navigate(-1)}>
            {t('common.back')}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="login">
      <header className="topbar" style={{ alignSelf: 'stretch' }}>
        {back}
        <h1 className="title">{t('fb.title')}</h1>
      </header>
      <form className="panel" onSubmit={submit}>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>{t('fb.kind')}</legend>
          <div className="segmented" style={{ flexWrap: 'wrap' }}>
            {KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {t(FEEDBACK_KIND_KEY[k])}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="feedback-message">{t('fb.message')}</label>
          <textarea
            id="feedback-message"
            className="input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MAX}
            placeholder={kind === 'BUG' ? t('fb.placeholderBug') : t('fb.placeholderIdea')}
            required
          />
          <p className="hint">
            {message.length} / {MAX}
          </p>
          {fieldError.message && <p className="error">{fieldError.message}</p>}
        </div>

        {!signedIn && (
          <div className="field">
            <label htmlFor="feedback-contact">{t('fb.contact')}</label>
            <input
              id="feedback-contact"
              className="input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              maxLength={64}
            />
            <p className="hint">{t('fb.contactHint')}</p>
            {fieldError.contact && <p className="error">{fieldError.contact}</p>}
          </div>
        )}

        <ErrorNote error={Object.keys(fieldError).length === 0 ? send.error : null} />
        <button
          className="key key-wide"
          type="submit"
          disabled={send.isPending || message.trim().length < 5}
        >
          {t('fb.send')}
        </button>
        <p className="hint">
          {signedIn ? t('fb.withAccount') : t('fb.anonymous')} {t('fb.ownerOnly')}{' '}
          {!signedIn && <Link to="/connexion">{t('fb.signIn')}</Link>}
        </p>
      </form>
    </main>
  );
}
