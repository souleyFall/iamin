import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { ConfirmButton } from './ConfirmButton';
import { ErrorNote } from './ErrorNote';
import { Icon } from './Icon';

interface Props {
  title: string;
  nameA: string;
  nameB: string;
  /** Vainqueur déjà désigné (correction d'un résultat). */
  current: 'a' | 'b' | null;
  pending: boolean;
  error: Error | null;
  onPick: (side: 'a' | 'b') => void;
  onForfeit: (side: 'a' | 'b') => void;
  onDelete: (() => void) | null;
  onClose: () => void;
}

/**
 * Élimination directe : pas de score, on désigne le vainqueur d'un geste. Deux gros boutons, un par
 * joueur ; un forfait (le joueur absent perd) et l'annulation d'un résultat posé par erreur.
 */
export function WinnerSheet(p: Props) {
  const { t } = useI18n();
  const [forfeiting, setForfeiting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const names = { a: p.nameA, b: p.nameB };

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // Une seule installation : `onClose` ne change pas de sens pendant que la feuille est ouverte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="dim" onClick={p.onClose} aria-hidden="true" />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('winner.title') + ' ' + p.title}
      >
        <div className="sheet-grip" />
        <div className="row-head">
          <div>
            <h2 className="title">{p.title}</h2>
            <p className="subtitle">{t('winner.title')}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            aria-label={t('common.close')}
            onClick={p.onClose}
          >
            <Icon name="close" size={20} stroke={2.5} />
          </button>
        </div>

        {!forfeiting ? (
          <>
            <div className="winner-pick">
              {(['a', 'b'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  className={`winner-btn${p.current === side ? ' is-current' : ''}`}
                  disabled={p.pending}
                  onClick={() => p.onPick(side)}
                >
                  {p.current === side && <Icon name="check" size={22} stroke={2.5} />}
                  <span>{t('winner.pick', { name: names[side] })}</span>
                </button>
              ))}
            </div>
            {p.current && <p className="hint">{t('winner.current', { name: names[p.current] })}</p>}
            <ErrorNote error={p.error} />
            <div className="actions">
              <button
                type="button"
                className="btn btn-danger"
                style={{ flex: 'none', height: 56 }}
                onClick={() => setForfeiting(true)}
              >
                {t('score.forfeit')}
              </button>
            </div>
            {p.onDelete && (
              <ConfirmButton
                confirmLabel={t('winner.delete')}
                disabled={p.pending}
                onConfirm={p.onDelete}
              >
                {t('winner.delete')}
              </ConfirmButton>
            )}
          </>
        ) : (
          <>
            <p>{t('winner.forfeitWho')}</p>
            <div className="actions">
              {(['a', 'b'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  className="btn btn-danger"
                  disabled={p.pending}
                  onClick={() => p.onForfeit(side)}
                >
                  {t('score.forfeitOf', { name: names[side] })}
                </button>
              ))}
            </div>
            <ErrorNote error={p.error} />
            <button type="button" className="btn" onClick={() => setForfeiting(false)}>
              {t('winner.back')}
            </button>
          </>
        )}
      </div>
    </>
  );
}
