import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { chatChoices, copyText } from '../lib/chat';
import { Icon } from '../components/Icon';
import { LOCALES, useI18n } from '../lib/i18n';
import { useTournamentCtx } from './tournament-context';

/** Copier pour le chat : texte brut prêt à coller dans le chat Plato (moteur @iamin/engine). */
export function Copy() {
  const { tournament, draw } = useTournamentCtx();
  const { t } = useI18n();
  const choices = useMemo(() => chatChoices(tournament, draw, t), [tournament, draw, t]);
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
        <Link className="icon-btn flat" to=".." aria-label={t('copy.backToTournament')}>
          <Icon name="back" size={24} />
        </Link>
        <h2 className="title">{t('copy.title')}</h2>
      </header>
      <div className="page">
        <p className="hint">
          {t('copy.language', {
            language: LOCALES.find((l) => l.code === tournament.language)?.label ?? '',
          })}
        </p>
        <div className="field">
          <label htmlFor="what" style={{ fontSize: 18 }}>
            {t('copy.which')}
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
        <pre className="preview" tabIndex={0} aria-label={t('copy.preview')}>
          {choice?.text}
        </pre>
        <button type="button" className="key key-wide" onClick={() => void copy()}>
          <Icon name="copy" />
          {t('copy.button')}
        </button>
        <p role="status" className={state === 'refused' ? 'error' : 'notice notice-ok'}>
          {state === 'copied' && t('copy.done')}
          {state === 'refused' && t('copy.refused')}
        </p>
      </div>
    </>
  );
}
