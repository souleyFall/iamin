import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';

interface Props {
  /** Ce qui est annoncé : « Pointage terminé : tout le monde est noté. » */
  message: string;
  /** Où l'on va : « Passage au tirage ». */
  label: string;
  /** Attente avant d'y aller tout seul, en secondes. */
  seconds?: number;
  onGo: () => void;
  onStay: () => void;
}

/**
 * Une étape est terminée : on annonce la suivante et on y va tout seul après quelques secondes, sans
 * clic. Un bouton permet d'y aller tout de suite, un autre de rester (une erreur de pointage se
 * corrige sans être emporté). La page n'annonce pas chaque seconde aux lecteurs d'écran : seule la
 * phrase d'annonce est lue.
 */
export function NextStep({ message, label, seconds = 3, onGo, onStay }: Props) {
  const { t } = useI18n();
  const [left, setLeft] = useState(seconds);
  const go = useRef(onGo);
  useEffect(() => {
    go.current = onGo;
  });

  useEffect(() => {
    if (left <= 0) {
      go.current();
      return;
    }
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);

  return (
    <div className="card next-step" role="status">
      <p>{message}</p>
      <p className="next-step-count" aria-hidden="true">
        {t('next.in', { label, n: left })}
      </p>
      <div className="actions">
        <button type="button" className="btn" onClick={onStay}>
          {t('next.stay')}
        </button>
        <button type="button" className="btn btn-primary" onClick={onGo}>
          {t('next.now')}
        </button>
      </div>
    </div>
  );
}
