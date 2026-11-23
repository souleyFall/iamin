import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useSendFeedback } from '../api/queries';
import type { FeedbackKind } from '../api/types';
import { useAuth } from '../auth/session';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { FEEDBACK_KIND_LABEL } from '../lib/labels';

const KINDS: FeedbackKind[] = ['IDEA', 'IMPROVEMENT', 'BUG', 'OTHER'];
const MAX = 2000;

/**
 * Donner son avis : proposer une fonctionnalité, une amélioration, signaler un bug. Ouvert à tous :
 * un admin connecté écrit avec son compte, un joueur sans compte écrit anonymement et peut laisser
 * son pseudo Plato s'il veut une réponse. Seul le propriétaire de la plateforme lit les retours.
 */
export function Feedback() {
  const { user } = useAuth();
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
      aria-label="Retour"
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
          <h1 className="section-title">Merci !</h1>
          <p>Ton retour est bien reçu. Il sera lu par le responsable d’i-am-in.</p>
          <button type="button" className="btn" onClick={() => void navigate(-1)}>
            Retour
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="login">
      <header className="topbar" style={{ alignSelf: 'stretch' }}>
        {back}
        <h1 className="title">Donner mon avis</h1>
      </header>
      <form className="panel" onSubmit={submit}>
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>Type de retour</legend>
          <div className="segmented" style={{ flexWrap: 'wrap' }}>
            {KINDS.map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>
                {FEEDBACK_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label htmlFor="feedback-message">Ton message</label>
          <textarea
            id="feedback-message"
            className="input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={MAX}
            placeholder={
              kind === 'BUG'
                ? 'Ce que tu as fait, ce qui s’est passé, ce que tu attendais.'
                : 'Décris ton idée ou ce qui pourrait être mieux.'
            }
            required
          />
          <p className="hint">
            {message.length} / {MAX}
          </p>
          {fieldError.message && <p className="error">{fieldError.message}</p>}
        </div>

        {!signedIn && (
          <div className="field">
            <label htmlFor="feedback-contact">Ton pseudo Plato (facultatif)</label>
            <input
              id="feedback-contact"
              className="input"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
              maxLength={64}
            />
            <p className="hint">Seulement si tu veux qu’on puisse te répondre.</p>
            {fieldError.contact && <p className="error">{fieldError.contact}</p>}
          </div>
        )}

        <ErrorNote error={Object.keys(fieldError).length === 0 ? send.error : null} />
        <button
          className="key key-wide"
          type="submit"
          disabled={send.isPending || message.trim().length < 5}
        >
          Envoyer
        </button>
        <p className="hint">
          {signedIn
            ? 'Ton identifiant est joint à ton message.'
            : 'Sans compte, ton message est anonyme.'}{' '}
          Seul le propriétaire de la plateforme le lit.{' '}
          {!signedIn && <Link to="/connexion">Se connecter</Link>}
        </p>
      </form>
    </main>
  );
}
