import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { keys } from '../api/queries';
import type { Tournament, TournamentFormat, TournamentLanguage } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { useCurrentGroup } from '../groups/current';
import { LOCALES, useI18n } from '../lib/i18n';

export function NewTournament() {
  const { current, loading } = useCurrentGroup();
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('ELIMINATION');
  const [capacity, setCapacity] = useState(16);
  // Matchs nuls (ligue seulement) : selon le jeu, une égalité est possible ou non. Non par défaut.
  const [allowDraws, setAllowDraws] = useState(false);
  // Par défaut : la langue de l'écran de l'admin, le plus souvent celle de son groupe.
  const [language, setLanguage] = useState<TournamentLanguage>(locale);
  const groupId = current?.id;

  const create = useMutation({
    mutationFn: () =>
      api<Tournament>('POST', `/groups/${groupId ?? ''}/tournaments`, {
        name: name.trim(),
        format,
        capacity,
        language,
        allowDraws: format === 'LEAGUE' && allowDraws,
      }),
    onSuccess: async (created) => {
      await client.invalidateQueries({ queryKey: keys.scope(groupId ?? '') });
      void navigate(`/tournois/${created.id}/inscrits`);
    },
  });

  if (loading) {
    return (
      <p className="page muted" role="status">
        {t('common.loading')}
      </p>
    );
  }
  if (!current || current.myRole === null) return <Navigate to="/" replace />;

  const fieldError = create.error instanceof ApiError ? create.error.fields : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <>
      <header className="topbar">
        <Link className="icon-btn flat" to="/" aria-label={t('common.back')}>
          <Icon name="back" size={24} />
        </Link>
        <h1 className="title">{t('new.title')}</h1>
      </header>
      <form className="page" onSubmit={submit}>
        <div className="field">
          <label htmlFor="name">{t('new.name')}</label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('new.namePlaceholder')}
            maxLength={80}
            required
          />
          {fieldError.name && <p className="error">{fieldError.name}</p>}
        </div>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>{t('new.format')}</legend>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={format === 'ELIMINATION'}
              onClick={() => setFormat('ELIMINATION')}
            >
              {t('format.elimination')}
            </button>
            <button
              type="button"
              aria-pressed={format === 'LEAGUE'}
              onClick={() => setFormat('LEAGUE')}
            >
              {t('format.league')}
            </button>
          </div>
          <p className="hint">
            {format === 'LEAGUE' ? t('new.leagueHint') : t('new.eliminationHint')}
          </p>
        </fieldset>

        {format === 'LEAGUE' ? (
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend>{t('new.draws.label')}</legend>
            <div className="segmented">
              <button type="button" aria-pressed={!allowDraws} onClick={() => setAllowDraws(false)}>
                {t('new.draws.no')}
              </button>
              <button type="button" aria-pressed={allowDraws} onClick={() => setAllowDraws(true)}>
                {t('new.draws.yes')}
              </button>
            </div>
            <p className="hint">{allowDraws ? t('new.draws.hintYes') : t('new.draws.hintNo')}</p>
          </fieldset>
        ) : (
          <p className="hint">{t('new.draws.knockout')}</p>
        )}

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>{t('lang.label')}</legend>
          <div className="segmented">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                type="button"
                lang={l.code}
                aria-pressed={language === l.code}
                onClick={() => setLanguage(l.code)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <p className="hint">{t('lang.hint')}</p>
        </fieldset>

        <div className="field">
          <label htmlFor="capacity">{t('new.capacity')}</label>
          <input
            id="capacity"
            className="input"
            type="number"
            inputMode="numeric"
            min={2}
            max={format === 'LEAGUE' ? 32 : 256}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
            required
          />
          <p className="hint">{t('new.capacityHint')}</p>
          {fieldError.capacity && <p className="error">{fieldError.capacity}</p>}
        </div>

        <ErrorNote error={Object.keys(fieldError).length === 0 ? create.error : null} />
        <button
          className="key key-wide"
          type="submit"
          disabled={create.isPending || name.trim().length < 2}
        >
          {t('new.submit')}
        </button>
        <p className="hint">{t('new.holderHint')}</p>
      </form>
    </>
  );
}
