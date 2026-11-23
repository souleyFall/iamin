import { useEffect, useRef, useState } from 'react';
import type { Score } from '../api/types';
import { ConfirmButton } from './ConfirmButton';
import { ErrorNote } from './ErrorNote';
import { Icon } from './Icon';
import { Lcd } from './Lcd';

const MAX = 99;

/** Un match ne finit pas à égalité (le moteur le refuse aussi) ; scores entiers de 0 à 99. */
export function validateScore(
  s: Score,
): { ok: true; winner: 'a' | 'b' } | { ok: false; reason: string } {
  if (
    !Number.isInteger(s.a) ||
    !Number.isInteger(s.b) ||
    s.a < 0 ||
    s.b < 0 ||
    s.a > MAX ||
    s.b > MAX
  ) {
    return { ok: false, reason: `Le score va de 0 à ${MAX}.` };
  }
  if (s.a === s.b) return { ok: false, reason: 'Un match ne peut pas finir à égalité.' };
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
  const [score, setScore] = useState<Score>(p.initial ?? { a: 0, b: 0 });
  const [forfeiting, setForfeiting] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const verdict = validateScore(score);
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
        aria-label={`Saisir le score : ${p.title}`}
      >
        <div className="sheet-grip" />
        <div className="row-head">
          <div>
            <h2 className="title">{p.title}</h2>
            <p className="subtitle">Entre le score final</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            aria-label="Fermer"
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
                  aria-label={`Retirer un point à ${names[side]}`}
                  onClick={() => step(side, -1)}
                >
                  <Icon name="minus" stroke={2.5} />
                </button>
                <div className="score-box" role="status" aria-label={`Score de ${names[side]}`}>
                  <Lcd value={score[side]} ghost="8" size={56} />
                </div>
                <button
                  type="button"
                  className="step-btn plus"
                  aria-label={`Ajouter un point à ${names[side]}`}
                  onClick={() => step(side, 1)}
                >
                  <Icon name="plus" stroke={2.5} />
                </button>
              </div>
            ))}

            {verdict.ok ? (
              <p className="notice notice-ok">
                <Icon name="check" size={18} stroke={2.5} />
                Score valide : {names[verdict.winner]} gagne
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
                Forfait
              </button>
              <button
                type="button"
                className="key"
                disabled={!verdict.ok || p.pending}
                onClick={() => p.onSave(score)}
              >
                Enregistrer le score
              </button>
            </div>
            {p.onDelete && (
              <ConfirmButton
                confirmLabel="Supprimer le score"
                disabled={p.pending}
                onConfirm={p.onDelete}
              >
                Supprimer le score
              </ConfirmButton>
            )}
          </>
        ) : (
          <>
            <p>
              Qui déclare forfait ? Son adversaire gagne <b>{p.forfeitScore}-0</b>.
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
                  Forfait de {names[side]}
                </button>
              ))}
            </div>
            <ErrorNote error={p.error} />
            <button type="button" className="btn" onClick={() => setForfeiting(false)}>
              Retour au score
            </button>
          </>
        )}
      </div>
    </>
  );
}
