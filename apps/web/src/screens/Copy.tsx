import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { chatChoices, copyText } from '../lib/chat';
import { Icon } from '../components/Icon';
import { useTournamentCtx } from './tournament-context';

/** Copier pour le chat : texte brut prêt à coller dans le chat Plato (moteur @iamin/engine). */
export function Copy() {
  const { tournament, draw } = useTournamentCtx();
  const choices = useMemo(() => chatChoices(tournament, draw), [tournament, draw]);
  const [key, setKey] = useState(choices[0]?.key ?? '');
  const [state, setState] = useState<'idle' | 'copied' | 'refused'>('idle');
  const choice = choices.find((c) => c.key === key) ?? choices[0];

  async function copy() {
    if (!choice) return;
    setState((await copyText(choice.text)) ? 'copied' : 'refused');
  }

  return (
    <>
      <header className="topbar">
        <Link className="icon-btn flat" to=".." aria-label="Retour au tournoi">
          <Icon name="back" size={24} />
        </Link>
        <h2 className="title">Copier pour le chat</h2>
      </header>
      <div className="page">
        <div className="field">
          <label htmlFor="what" style={{ fontSize: 18 }}>
            Quel message ?
          </label>
          <select
            id="what"
            className="input"
            style={{ height: 48, fontSize: 17 }}
            value={choice?.key ?? ''}
            onChange={(e) => {
              setKey(e.target.value);
              setState('idle');
            }}
          >
            {choices.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        {/* tabIndex : le texte se sélectionne au clavier si la copie automatique est refusée. */}
        <pre className="preview" tabIndex={0} aria-label="Aperçu du message">
          {choice?.text}
        </pre>
        <button type="button" className="key key-wide" onClick={() => void copy()}>
          <Icon name="copy" />
          Copier le message
        </button>
        <p role="status" className={state === 'refused' ? 'error' : 'notice notice-ok'}>
          {state === 'copied' && 'Copié : colle-le dans le chat.'}
          {state === 'refused' && 'Le navigateur refuse la copie : sélectionne le texte ci-dessus.'}
        </p>
      </div>
    </>
  );
}
