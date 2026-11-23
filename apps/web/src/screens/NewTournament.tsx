import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { keys } from '../api/queries';
import type { Tournament, TournamentFormat } from '../api/types';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { useCurrentGroup } from '../groups/current';

export function NewTournament() {
  const { current, loading } = useCurrentGroup();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [format, setFormat] = useState<TournamentFormat>('ELIMINATION');
  const [capacity, setCapacity] = useState(16);
  const groupId = current?.id;

  const create = useMutation({
    mutationFn: () =>
      api<Tournament>('POST', `/groups/${groupId ?? ''}/tournaments`, {
        name: name.trim(),
        format,
        capacity,
      }),
    onSuccess: async (t) => {
      await client.invalidateQueries({ queryKey: keys.scope(groupId ?? '') });
      void navigate(`/tournois/${t.id}/inscrits`);
    },
  });

  if (loading) {
    return (
      <p className="page muted" role="status">
        Chargement…
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
        <Link className="icon-btn flat" to="/" aria-label="Retour">
          <Icon name="back" size={24} />
        </Link>
        <h1 className="title">Nouveau tournoi</h1>
      </header>
      <form className="page" onSubmit={submit}>
        <div className="field">
          <label htmlFor="name">Nom du tournoi</label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Échecs #13"
            maxLength={80}
            required
          />
          {fieldError.name && <p className="error">{fieldError.name}</p>}
        </div>

        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend>Format</legend>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={format === 'ELIMINATION'}
              onClick={() => setFormat('ELIMINATION')}
            >
              Élimination directe
            </button>
            <button
              type="button"
              aria-pressed={format === 'LEAGUE'}
              onClick={() => setFormat('LEAGUE')}
            >
              Ligue
            </button>
          </div>
          <p className="hint">
            {format === 'LEAGUE'
              ? 'Chacun joue contre chacun : 32 joueurs au plus.'
              : 'Le perdant est éliminé. Les byes vont à des joueurs tirés au sort.'}
          </p>
        </fieldset>

        <div className="field">
          <label htmlFor="capacity">Nombre de places</label>
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
          <p className="hint">Au-delà, les inscrits validés vont en liste d’attente.</p>
          {fieldError.capacity && <p className="error">{fieldError.capacity}</p>}
        </div>

        <ErrorNote error={Object.keys(fieldError).length === 0 ? create.error : null} />
        <button
          className="key key-wide"
          type="submit"
          disabled={create.isPending || name.trim().length < 2}
        >
          Créer le tournoi
        </button>
        <p className="hint">
          Tu en auras la main : tu pourras la passer à un autre admin du groupe.
        </p>
      </form>
    </>
  );
}
