import { useEffect, useRef, useState } from 'react';
import type { Score } from '../api/types';
import { translate, useI18n, type I18n } from '../lib/i18n';
import { ConfirmButton } from './ConfirmButton';
import { ErrorNote } from './ErrorNote';
import { Icon } from './Icon';
import { Lcd } from './Lcd';

const MAX = 99;

/** Un match ne finit pas à égalité (le moteur le refuse aussi) ; scores entiers de 0 à 99. */
export function validateScore(
  s: Score,
  t: I18n['t'] = (key, params) => translate('fr', key, params),
): { ok: true; winner: 'a' | 'b' } | { ok: false; reason: string } {
  if (
    !Number.isInteger(s.a) ||
    !Number.isInteger(s.b) ||
    s.a < 0 ||
    s.b < 0 ||
    s.a > MAX ||
    s.b > MAX
  ) {
    return { ok: false, reason: t('score.range', { max: MAX }) };
  }
  if (s.a === s.b) return { ok: false, reason: t('score.tie') };
  return { ok: true, winner: s.a > s.b ? 'a' : 'b' };
}

interface Props {
  title: string;
  nameA: string;
  nameB: string;
  initial: Score | null;
  forfeitScore: number;
  pending: boolean;
  error: Error | null;
  onSave: (score: Score) => void;
  onForfeit: (side: 'a' | 'b') => void;
  onDelete: (() => void) | null;
  onClose: () => void;
}

/** Feuille de saisie d'un score : gros boutons +/−, chiffres LCD, forfait. */
export function ScoreSheet(p: Props) {
  const { t } = useI18n();
  const [score, setScore] = useState<Score>(p.initial ?? { a: 0, b: 0 });
  const [forfeiting, setForfeiting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const verdict = validateScore(score, t);
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

  const step = (side: 'a' | 'b', delta: number) =>
    setScore((s) => ({ ...s, [side]: Math.min(MAX, Math.max(0, s[side] + delta)) }));

  return (
    <>
      <div className="dim" onClick={p.onClose} aria-hidden="true" />
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('score.title', { title: p.title })}
      >
        <div className="sheet-grip" />
        <div className="row-head">
          <div>
            <h2 className="title">{p.title}</h2>
            <p className="subtitle">{t('score.enter')}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            aria-label={t('common.close')}
            onClick={p.onClose}
          >
            <Icon name="close" size={20} stroke={2} />
          </button>
        </div>

        {!forfeiting ? (
          <>
            {(['a', 'b'] as const).map((side) => (
              <div className="stepper" key={side}>
                <div className="player-name">{names[side]}</div>
                <button
                  type="button"
                  className="step-btn"
                  aria-label={t('score.minus', { name: names[side] })}
                  onClick={() => step(side, -1)}
                >
                  <Icon name="minus" stroke={2.5} />
                </button>
                <div
                  className="score-box"
                  role="status"
                  aria-label={t('score.of', { name: names[side] })}
                >
                  <Lcd value={score[side]} ghost="8" size={56} />
                </div>
                <button
                  type="button"
                  className="step-btn plus"
                  aria-label={t('score.plus', { name: names[side] })}
                  onClick={() => step(side, 1)}
                >
                  <Icon name="plus" stroke={2.5} />
                </button>
              </div>
            ))}

            {verdict.ok ? (
              <p className="notice notice-ok">
                <Icon name="check" size={18} stroke={2.5} />
                {t('score.valid', { name: names[verdict.winner] })}
              </p>
            ) : (
              <p className="notice notice-bad">{verdict.reason}</p>
            )}
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
              <button
                type="button"
                className="key"
                disabled={!verdict.ok || p.pending}
                onClick={() => p.onSave(score)}
              >
                {t('score.save')}
              </button>
            </div>
            {p.onDelete && (
              <ConfirmButton
                confirmLabel={t('score.delete')}
                disabled={p.pending}
                onConfirm={p.onDelete}
              >
                {t('score.delete')}
              </ConfirmButton>
            )}
          </>
        ) : (
          <>
            <p>
              {t('score.forfeitWho')}
              <b>{p.forfeitScore}-0</b>.
            </p>
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
              {t('score.backToScore')}
            </button>
          </>
        )}
      </div>
    </>
  );
}
