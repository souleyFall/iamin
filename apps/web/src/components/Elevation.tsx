import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/session';
import { useI18n } from '../lib/i18n';
import { ErrorNote } from './ErrorNote';

/** Les actions sensibles sont-elles permises ? (connexion avec code ou ressaisie < 10 minutes) */
export function useElevated(): boolean {
  const { elevatedUntil } = useAuth();
  // L'heure est un état (pas lue pendant le rendu) : un minuteur la remet à jour à l'échéance, donc
  // l'écran redemande le code tout seul quand les 10 minutes sont passées.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (elevatedUntil === null) return;
    const wait = Math.max(0, new Date(elevatedUntil).getTime() - Date.now()) + 50;
    const timer = setTimeout(() => setNow(Date.now()), wait);
    return () => clearTimeout(timer);
  }, [elevatedUntil]);
  return elevatedUntil !== null && new Date(elevatedUntil).getTime() > now;
}

/**
 * Demande le code à 6 chiffres quand la période de confiance est passée. Une session volée ne
 * suffit pas pour inviter un super admin, émettre un lien de réinitialisation, supprimer ou purger.
 * N'affiche rien tant que la période est active.
 */
export function ElevationPrompt({ reason }: { reason: string }) {
  const { refresh } = useAuth();
  const { t } = useI18n();
  const elevated = useElevated();
  const [code, setCode] = useState('');
  const confirm = useMutation({
    mutationFn: () =>
      api<{ elevatedUntil: string }>('POST', '/auth/mfa/elevate', { code: code.trim() }),
    onSuccess: async () => {
      setCode('');
      await refresh();
    },
  });
  if (elevated) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    confirm.mutate();
  }

  return (
    <form className="panel" onSubmit={submit} aria-label={t('elev.aria')}>
      <h2 className="section-title">{t('elev.title')}</h2>
      <p className="hint">{reason}</p>
      <div className="field">
        <label htmlFor="elevate-code">{t('sec.code6')}</label>
        <input
          id="elevate-code"
          className="input tabular"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
        />
      </div>
      <ErrorNote error={confirm.error} />
      <button
        className="btn btn-accent"
        type="submit"
        disabled={confirm.isPending || code.trim().length < 6}
      >
        {t('common.confirm')}
      </button>
    </form>
  );
}
